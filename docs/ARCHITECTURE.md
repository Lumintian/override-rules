# override-rules 架构文档

本项目是一个 Mihomo/Clash 订阅覆写脚本。它拦截上游订阅配置中的代理节点，按落地/非落地、国家和地区进行多维度分类，并按照预设的规则与策略组将其重组为优化后的 Clash 配置——包含代理组、路由规则、DNS 及 TUN 支持。

---

## 数据流概览

整个覆写脚本的核心流程分为五个阶段：**输入** → **参数解析** → **节点分类** → **配置构建** → **最终组装**。

```mermaid
flowchart TD
    subgraph Input["1. 输入"]
        CP["config.proxies (ProxyNode[])"]
        RA["rawArgs (来自 $arguments)"]
    end

    subgraph Args["2. 参数解析 (args.ts)"]
        RA --> BFF["buildFeatureFlags()"]
        BFF --> FF["FeatureFlags"]
    end

    subgraph Parser["3. 节点多维度分类 (node_parser.ts)"]
        CP --> PNL["parseNodesByLanding()"]
        PNL --> LN["landingNodes"]
        PNL --> NLN["nonLandingNodes"]
        LN --> LCHK{"landingNodes.length > 0<br/>&& nonLandingNodes.length > 0"}
        LCHK --> LAND["landing: boolean"]
        LCHK -->|"true: 用 nonLandingNodes"| PC["parseCountries()"]
        LCHK -->|"false: 用 config.proxies"| PC
        PC --> CN["countryNodes (Record)"]
        CN --> GACN["getActiveCountryNames()"]
        GACN --> ACN["countryNames (无后缀)"]
        FF --> GACN
    end

    subgraph Builders["4. 配置构建"]
        ACN --> BCG["buildCountryGroups()"]
        CN --> BCG
        FF --> BCG
        BCG --> CG["countryGroups (基础组 + 额外 select 组)"]
        CG --> BBL["buildBaseLists()"]
        LAND --> BBL
        NLN --> BBL
        BBL --> BL["BaseLists"]
        BL --> BPG["buildProxyGroups()"]
        ACN --> BPG
        CG --> BPG
        LAND --> BPG
        LN --> BPG
        BPG --> PG["proxy-groups<br/>(含基础及额外地区组)"]
    end

    subgraph Output["5. 最终组装 (main.ts)"]
        PG --> RULES["buildRules()"]
        PG --> DNS["buildDns()"]
        PG --> TUN["buildTunConfig()"]
        FF --> RULES
        FF --> DNS
        FF --> TUN
        RULES --> FINAL["ClashConfig"]
        DNS --> FINAL
        TUN --> FINAL
    end
```

### 各阶段职责

| 阶段 | 核心模块 | 职责 |
|------|----------|------|
| 输入 | — | 上游订阅传入的代理节点列表 (`config.proxies`) 与用户提供的 URL 覆写参数 (`$arguments`) |
| 参数解析 | `src/args.ts` | 将原始字符串参数转换为类型安全的 `FeatureFlags` 对象，设置各项开关的默认值 |
| 节点分类 | `src/node_parser.ts` | 识别落地/非落地 (`parseNodesByLanding`)、所属国家/地区 (`parseCountries`) 和 Tailscale 节点 (`parseTailscale`)；提取活跃国家名称 (`getActiveCountryNames`) |
| 配置构建 | `src/selectors.ts` + `src/proxy_groups.ts` | 先生成基础及额外地区组 (`buildCountryGroups`)，据此生成基础代理选择列表 (`BaseLists`)，最后组装完整的代理组定义 |
| 最终组装 | `src/main.ts` | 将代理组、路由规则 (`buildRules`)、DNS 配置 (`buildDns`) 与 TUN 配置 (`buildTunConfig`) 拼装为最终输出的 `ClashConfig` |

---

## 文件职责

| 文件 | 职责 | 关键导出 |
|------|------|----------|
| `src/args.ts` | URL 参数解析与默认值处理 | `buildFeatureFlags()`, `parseGroupType()` |
| `src/constants.ts` | 常量集中管理（国家元数据、代理组名称、CDN 地址等） | `countriesMeta`, `NODE_SUFFIX`, `PROXY_GROUPS` |
| `src/node_parser.ts` | 多维度节点分类与过滤 | `parseNodesByLanding()`, `parseCountries()`, `parseTailscale()`, `getActiveCountryNames()` |
| `src/selectors.ts` | 代理选择列表构建（各策略组的基础选项列表） | `buildBaseLists()` |
| `src/proxy_groups.ts` | 代理组定义生成（含基础及额外地区组） | `buildCountryGroups()`, `buildProxyGroups()`, `buildGroupByType()` |
| `src/rules.ts` | 路由规则构建 | `buildRules()` |
| `src/dns.ts` | DNS 配置构建 | `buildDns()`, `snifferConfig` |
| `src/tun.ts` | TUN 模式配置构建 | `buildTunConfig()` |
| `src/rule_providers.ts` | Rule Provider 定义（外部规则集引用） | `ruleProviders` |
| `src/types.ts` | TypeScript 类型与接口定义 | `FeatureFlags`, `ProxyNode`, `ProxyGroup`, `ClashConfig`, `BaseLists`, `BuildBaseListsInput`, `BuildProxyGroupsInput` 等 |
| `src/utils.ts` | 通用工具函数 | `buildList()`, `parseBool()`, `parseNumber()`, `isNotNull()` |
| `scripts/yaml_generator/generator.ts` | 静态 YAML 覆写文件生成器 | 穷举参数组合，生成 `dist/yamls/` 下的 192 个 YAML 配置文件 |

---

## 设计决策

### 落地/非落地自动检测

`dialer-proxy` 在 Mihomo 链式代理中表示当前节点通过指定代理拨号。脚本据此自动区分：

- 包含 `dialer-proxy: "前置代理"` 字段的节点 → **落地节点**（目标/出口节点），归入「落地节点」组
- 其余所有节点 → **非落地节点**（中继/普通节点），归入国家地区分组和「前置代理」组

变量 `landing` 为 `true` 当且仅当两类节点均存在（`landingNodes.length > 0 && nonLandingNodes.length > 0`）。这保证了中继代理组仅在真正需要时才生成，避免了空组或配置不一致的问题。

### 节点分类

节点在进入配置构建阶段前，进行以下识别：

1. **落地/非落地** — 决定链式代理的节点来源。当 `landing = true` 时，后续的国家分类只扫描非落地节点（即落地节点不参与按国家分发）。
2. **国家/地区** — 通过正则匹配节点名称中的地理位置关键字，将节点归入对应的国家/地区分组。匹配规则定义在 `countriesMeta` 中。
3. **Tailscale** — 从全部节点中识别 `type: tailscale`，供专用策略组、TUN 和分流规则使用。

不再单独识别或生成低倍率策略组，也不会据此删除原始节点。

### 数据流

- **统一地区组构建**：`parseCountries()` 返回 `Record<string, ProxyNode[]>`，`getActiveCountryNames()` 返回不含后缀的地区名。`buildCountryGroups()` 统一生成基础地区组和额外地区组，供 `buildBaseLists()` 生成选择列表，并由 `buildProxyGroups()` 合入最终配置，避免组定义和引用不同步。
- **名称仅在构建层添加**：`"节点"` 后缀（如「香港」→「香港节点」）和 `"额外N"`（如「美国额外1」）不进入分类层；额外组与基础组复用同一份节点来源规则。
- **数据优于标志**：接收节点信息的参数统一使用具体数据（如 `landingNodes: ProxyNode[]`、`countryNodes: Record<string, ProxyNode[]>`）而非布尔值。布尔标志（如 `landing`）由数据推导得出，保证了判定依据的可追溯性。

### args.ts 的默认值

所有 URL 参数都有明确的默认值。`buildFeatureFlags()` 负责解析并回填默认值，产出类型安全的 `FeatureFlags` 对象。这使得下游模块无需关心参数来源或缺失情况——每个标志都有确定的值。

### 额外地区组参数

`countriesMeta.code` 定义各地区的数量参数名，例如 `us`、`sg`；类型范围由 `CountryCode` 维护。`buildFeatureFlags()` 将参数解析为以地区名称为键的 `countryExtraCounts`。数量只接受 `0–100` 的整数，缺省或非法值为 `0`。

`buildCountryGroups()` 按地区权重遍历至少有一个候选节点的地区：基础组遵循 `countryThreshold` 和 `groupType`，额外组按显式数量生成，固定为 `select`，名称为「地区额外1」「地区额外2」等。无该地区节点时不生成空组。两类组均遵循 `regexFilter`，所以正则模式也保留运行时独立匹配及不按 `dialer-proxy` 排除成员的现有行为。

基础地区组和额外组直接加入 `选择代理`、服务列表和前置代理列表。不再生成跨地区的 `自动选择` / `故障转移` 组，也不再构建它们的候选列表；基础地区组自身的测速和负载均衡仍遵循 `groupType`。

### YAML Generator 的参数

静态 YAML 配置文件通过 `scripts/yaml_generator/generator.ts` 穷举参数组合生成：

| 参数 | 可选值 | 数量 |
|------|--------|------|
| `ipv6` | true / false | 2 |
| `full` | true / false | 2 |
| `keepalive` | true / false | 2 |
| `fakeip` | true / false | 2 |
| `quic` | true / false | 2 |
| `tun` | true / false | 2 |
| `grouptype` | select / url-test / load-balance | 3 |

共计 2⁶ × 3 = 192 个 YAML 文件。`landing` 不在 FLAGS 中——YAML 生成器使用 `fake_proxies.json` 中的模拟节点数据自动判定。生成时固定启用 `regex: true`，因为静态配置无法预知实际订阅的节点名称。地区额外组数量保持默认 `0`，不参与预生成组合。

---

## 输出模式

本项目支持两种部署方式，分别适用于不同使用场景：

### JS 动态覆写（dist/convert.js）

**主要模式。** 运行于 Substore 等订阅转换工具的脚本执行环境（如 Loon、Surge 的脚本功能）。脚本动态分析上游订阅传入的**真实代理节点列表**，根据节点名称中的地理位置关键字和属性字段（如 `dialer-proxy`）实时分类，并生成包含完整代理组、规则、DNS 及 TUN 配置的 Clash 配置。

这是推荐的使用方式，原因在于：

- 节点分类结果始终反映当前订阅的实际状态，新增或失效的节点会自动归入对应分组
- 代理组可直接枚举具体节点名称（`regex: false`），比正则过滤更精确
- 支持完整的运行时参数覆盖（通过 URL hash 传参）

### 静态 YAML 覆写（dist/yamls/*.yaml）

**备用模式。** 通过 `scripts/yaml_generator/generator.ts` 预先生成的 YAML 配置文件，存放在 `dist/yamls/` 下。这些文件使用 `scripts/yaml_generator/fake_proxies.json` 中的模拟节点数据穷举所有参数组合生成，供无法运行 JS 脚本的客户端直接引用。

YAML 模式的特点：

- 代理组使用正则过滤（`include-all` + `filter`），而非枚举具体节点名称——这是静态文件无法预知真实节点列表的必然选择
- 所有参数组合已预编译，用户只需选择对应的 YAML 文件 URL
- 不依赖脚本运行时，兼容性最广

两种模式共享同一套常量定义（`src/constants.ts`）和代理组结构逻辑，区别仅在于运行时的数据来源和过滤方式。
