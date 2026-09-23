# JavaScript 动态覆写参数

**第一次配置，不必先读完参数表。** [README 完整示例](../README.md#providerurl-与前置代理完整示例) 已把节点命名、rename、节点订阅链接、主配置生成和选组步骤串在一起。本页用于查参数、判断何时需要更新，以及排错。

## 先选使用方式

| 你想做什么 | 从哪里开始 |
| --- | --- |
| 把现有节点转换成带分流规则的配置 | [README 普通配置两步流程](../README.md#快速开始)，不传 `providerurl` |
| 日常节点变化不再依赖主配置重载 | 使用 `providerurl`；先看下面的 [provider 工作方式](#节点订阅-provider-与生成时快照) |
| provider 更新节点，同时让落地节点经过前置代理 | 直接照做 [README 完整示例](../README.md#providerurl-与前置代理完整示例) |
| 客户端不能执行 JavaScript | 查看[预生成 YAML](./USAGE.md#预生成-yaml)；它不负责下载快照或自动发现链路 |

参数放在脚本 URL 的 `#` 后，多个参数用 `&` 连接，例如：

```text
https://cdn.jsdelivr.net/gh/Lumintian/override-rules@dist/convert.min.js#grouptype=1&fakeip=true&us=2
```

Sub-Store 会解析这些参数。不需要的参数可以不填，默认值已列在下表。

## 参数表

### 常用功能

| 参数 | 什么时候使用 | 默认值 |
| --- | --- | --- |
| `grouptype` | 改变基础地区组类型：`0=手动选择`、`1=自动测速`、`2=负载均衡`；不改变前置组、落地组或额外组 | `1` |
| `threshold` | 某地区节点不足这个数量时，不生成基础地区组；不限制前置候选或额外组 | `2` |
| `us`、`sg` 等地区代码 | 为对应地区增加几个独立的手动组，例如 `us=2`；完整代码见[地区表](#额外地区组) | `0` |
| `fakeip` | DNS 使用 Fake-IP；改为 `false` 时使用 RedirHost | `true` |
| `ipv6` | 启用 IPv6 | `false` |
| `tun` | 启用 TUN | `false` |
| `quic` | 允许 UDP 443 / QUIC | `false` |
| `full` | 需要脚本补齐端口、控制器等主配置字段时启用，适合直接启动内核；客户端接管这些设置时通常不必开启 | `false` |
| `keepalive` | 启用 TCP Keep Alive（相关字段在 `full=true` 时输出） | `false` |
| `regex` | 显式节点的地区组改用 `include-all + filter`，不直接枚举名称；有 provider 时自动使用 `use + filter`，无需为此额外开启 | `false` |

布尔参数支持 `true / false` 或 `1 / 0`。`full=true` 默认启用局域网访问，控制器为 `:9999`；部署时仍需自行限制访问、设置客户端安全选项，不要直接暴露到公网。

### provider 与前置代理

| 参数 | 填什么 | 默认值 |
| --- | --- | --- |
| `providerurl` | **rename 之后、convert 之前**的单个 HTTP(S) Mihomo 节点订阅链接；对整个 URL 使用一次 `encodeURIComponent` | 不下载快照 |
| `providerinterval` | 新建 provider 的节点更新间隔，整数 `60–604800` 秒；需与 `providerurl` 一起使用 | `3600` 秒 |
| `front` | 默认 `中转` 链路允许使用的前置地区，例如 `front=hk,sg` | 全部合格非落地节点 |
| `front_a`…`front_z` | 对应 `中转A`…`中转Z` 链路的前置地区，例如 `front_a=hk,sg,jp` | 全部合格非落地节点 |

`providerurl` 下载仅支持已核查异步入口的 Sub-Store Node / Docker Mihomo 快捷脚本，不是任意客户端的 JS 覆写都能使用。版本或入口不确定时先做[环境核查](#环境与入口)。

## 常用组合

```text
# 香港等基础地区组自动测速；美国、新加坡另加手动组
convert.min.js#grouptype=1&us=2&sg=1

# RedirHost、IPv6 和 TUN
convert.min.js#fakeip=false&ipv6=true&tun=true

# 两条已存在的链路分别限制前置地区
convert.min.js#front_a=hk,sg,jp&front_b=uk,de,fr
```

上面是参数示意，实际使用需补齐脚本基础地址。`front_a` 只规定候选范围，**不会凭空创建 A 链路**；还需要存在对应落地节点。

## 节点订阅 provider 与生成时快照

你只需要区分两件事：**节点由 provider 更新，组结构由 JS 生成。** “快照”就是生成主配置时临时读取的一份节点列表，用来决定建哪些组；它不会复制进输出的 `proxies`。

```text
处理好的节点订阅链接 → providerurl → 生成主配置时决定地区和链路组
                    └────────────→ Mihomo 定时更新已有组中的节点
```

### 最短操作路径

1. 在节点来源上完成 rename，导出含非空 `proxies` 数组的 Mihomo / Clash.Meta YAML 节点链接。
2. 用空模板（`{}` 或 `proxies: []`）生成主配置，给 convert 设置 `providerurl`。脚本会自动创建 provider，不必自己填写其名称、缓存路径或 `use`。
3. 把生成的主配置导入客户端。**节点链接填给 `providerurl`，主配置链接交给客户端，不要互相填反。**
4. 日常让 Mihomo 更新 provider；需要调整组结构或规则配置时，再更新主配置。

需要前置代理时，使用 [README 的同一条完整流程](../README.md#providerurl-与前置代理完整示例)，不要额外再执行一遍 rename 或把相同节点导入主配置。Tailscale 可单独留在主配置模板的显式 `proxies` 中。

这里的 `proxy-providers` 是**节点订阅**，不是负责分流规则的 `rule-providers`。

### 订阅格式及编码

节点链接需要直接返回 YAML 或 JSON 对象，含 `proxies: [...]`，每个节点都有真实的 `name`、`type`、`server`、`port` 及协议所需字段。含 `proxies` 的完整 Mihomo 配置也能解析，但其他顶层字段不会导入；为避免递归生成或重复节点，推荐使用专门的节点导出链接。

不支持 Base64、`ss://` 等 URI 列表、登录网页或只含其他 provider 的配置；脚本不会递归下载嵌套来源。

**不要直接把含 `&` 的订阅 URL 拼进脚本参数，也不要编码两次。** 使用 [README 的本机链接生成代码](../README.md#4-用空模板生成主配置)，让 `encodeURIComponent(subscription)` 一次处理整个参数值。此参数值不支持 URL 用户名/密码、空白或 Fragment；访问凭据可使用来源支持的查询参数。编码后的链接仍包含凭据，不要公开分享。

### provider 链式代理

`中转` 标签标记的是**落地节点**，不是前置节点。首次使用只需检查这三项是否对上：

| 落地节点最终名称里的标签 | 同一节点的属性 | 配置前置地区用哪个参数 |
| --- | --- | --- |
| `中转` | `dialer-proxy: 前置代理` | `front=hk,sg` |
| `中转A` | `dialer-proxy: 前置代理A` | `front_a=hk,sg` |
| `中转B` | `dialer-proxy: 前置代理B` | `front_b=uk,de` |
| 依此类推至 `中转Z` | `dialer-proxy: 前置代理Z` | `front_z=…` |

**rename 的两项设置缺一不可：** `chain` 负责设置属性，`blkey` 负责保留最终名称里的标签。例如默认、A、B 三条链路可用 `chain&blkey=中转+中转A+中转B`。完整可复制链接见 [README 示例](../README.md#2-在节点来源上执行-rename)。

- 普通前置节点不要带中转标签或链路拨号属性。前置组会排除全部中转节点，防止选中自己或其他落地链路。
- 最终标签使用 `中转A` 这样的连续写法，不加内部空格、不用全角字母，不替换成 `线路A`。标签后保留分隔符，例如 `中转A 01`，不要拼成 `中转A01`。不要在来源前缀等无关位置使用这些保留标签。
- 同一个节点不能同时归属 A、B 等不同链路。缺标签、缺属性或编号不一致时，生成会明确报错，不会替你猜测。
- 本功能支持两端都在 provider，也支持“provider 前置 + 显式落地”或反向混合。显式落地仍按属性识别，不额外要求名称标签。
- **只有 `providerurl` 所对应、已校验的 provider 能进入前置和落地组。** 其他已有 provider 不会自动成为前置来源；需要它们的节点时，先在 Sub-Store 合并成一个导出链接。

> [!WARNING]
> 前置组没有候选时会回退直连，而不是阻断流量。已验证的 Mihomo 版本会显示 `COMPATIBLE`；仅显式候选模式下会保留 `DIRECT`。请检查前置候选和真实出口，不要把“组已生成”当成“链路已连通”。

<details>
<summary>更多匹配与选择细节</summary>

- 默认 `中转` 与字母链路精确区分，`中转A` 不会进入默认链路或 B 链路；字母匹配不区分大小写，但 `dialer-proxy` 目标使用表中的标准组名。
- 最终标签后须为名称结尾或非 ASCII 字母/数字字符。原始名称识别接受的全角字符、内部空格，不等于最终 provider 名称可用。
- 基础地区组、额外地区组和前置组都动态排除中转标签；落地节点也不参与普通地区数量统计。前置候选不受 `threshold` 或地区组存在性限制。
- 前置及落地组是手动 `select`，不受 `grouptype` 控制。动态前置组不会把 `DIRECT` 放在 provider 候选之前；空组才由 Mihomo 回退。只有落地、暂时没有前置时也保留已发现链路的目标组。
- 快照校验只在生成主配置时进行。Mihomo 后续下载不再执行这项 JS 校验，因此来源必须持续保留同一套命名和属性，不能只改一次快照。

</details>

### 什么时候需要重新生成主配置

| 变化 | 要做什么 |
| --- | --- |
| 现有链路内节点增删、改名、序号变化 | 让 Mihomo 更新 provider，保持中转标签与属性一致 |
| 想因节点数量变化增删地区组、重算 `threshold` 或额外组 | 重新运行 JS，并加载新主配置 |
| 新增 `中转B` 等链路编号，或修改 `front_a` 的地区范围 | 重新运行 JS，并加载新主配置 |
| 修改规则、DNS、TUN 等配置参数，或应用新版 convert 的变化 | 更新主配置；provider 更新不会替你更新这些内容 |

客户端如果仍然定时下载并重载主配置，就仍会发生主配置更新。provider 模式不会替你关闭这个任务；可按需降低其频率，把日常节点刷新交给 provider。新增地区的节点即使还没有地区组，仍能从 `手动选择` 到达；新增链路则必须先生成对应的前置组才能正常拨号。

### 快速排错

| 现象 | 优先检查 |
| --- | --- |
| 提示需要 Sub-Store Node / 异步入口 | 执行位置是否为 Node / Docker 后端的 Mihomo 快捷脚本；版本不确定时运行下面的环境探针 |
| 下载失败、HTTP 非 200、内容不合法 | 节点链接能否由 Sub-Store 访问；是否导出 Mihomo YAML；是否误填主配置、登录网页或 Base64 订阅；带 `&` 的 URL 是否只编码了一次 |
| 生成成功，但 Mihomo 下载节点失败 | Mihomo 所在机器是否能直连节点 URL；不要把只在 Sub-Store 容器内可用的地址给另一个环境使用 |
| 链路标签与 `dialer-proxy` 不一致 | 检查**导出后的最终节点**：`chain`、`blkey` 是否都设置；标签是否被后续 rename 删除或与编号连在一起 |
| 没有 `前置代理A` / `落地节点A` | 是否确有 A 链路落地节点；只设置 `front_a` 不会创建链路；新增 A 后是否重新生成主配置 |
| 前置组为空或显示 `COMPATIBLE` | 前置地区是否真的有普通节点；是否把中转标签加错到了前置节点；这些节点是否在 `providerurl` 对应来源中 |
| 有新加坡节点，却没有 `新加坡节点` 组 | 默认 `threshold=2`；不足两个不建基础地区组，但仍可作为前置，也可用 `sg=1` 增加手动组 |
| 节点出现两份 | 主配置模板是否又导入了 provider 中的同一批显式节点；是否重复添加同源 provider |
| 节点刷新了，但没出现新链路/地区组 | provider 只更新已有组的成员，按上表重新生成组结构 |
| 没有使用预期的美国出口 | 服务分流组是否选了 `落地节点A`，而不是 `前置代理A`；前置组是否为空并已回退直连；再检查真实连接 |

### 已有 provider 与动态引用

从空模板开始时无需手工设置 provider。下面的规则仅在你合并已有配置、定制 header 或排查输出时需要了解。

<details>
<summary>展开：已有定义、同源复用、缓存与成员选择</summary>

- 所有已有 `http`、`file`、`inline` provider 定义都会保留，但不会自动下载或展开。**只有 `providerurl` 的快照和显式节点参与结构判断**；仅有已有 provider、未传 URL 时，提供动态手动入口，不猜测其地区或链路。inline 的 payload 也不参与统计。
- `providerurl` 与某个已有 HTTP provider 的 URL 字符串完全一致时，复用第一个匹配定义，保留名称、路径、周期等设置；`providerinterval` 不覆盖已有周期。快照请求沿用其 `header`，每个值须为单元素字符串数组，未指定 User-Agent 时使用 `clash.meta`。
- 这个同源 provider 若含 `filter`、`exclude-filter`、`exclude-type` 或 `override`，会拒绝快照生成，避免按变换前的节点错误统计。需要此类处理时，优先在节点来源上完成，再提供处理后的节点链接。
- 新定义默认名为 `override-provider`，名称或规范化缓存路径冲突时递增编号；缓存位于 `./proxy_providers/`。新定义使用 `proxy: DIRECT` 直连下载，避免下载依赖自身节点。特殊下载路由可以预先通过同 URL provider 的 `proxy` 设置，但引用必须在输出配置中有效；输入的旧策略组不会保留。
- 地区组的 `use` 引用全部 provider，配合地区正则和中转排除规则；`proxies` 只枚举显式候选。前置/落地组只引用已校验来源，同 URL 的其他定义不会因此自动获得资格。
- `手动选择` 保留全部 provider 节点，可能与地区组重复，这是兜底入口而不是重复创建节点。`选择代理` 通过它可达动态节点，`GLOBAL` 也直接引用全部 provider。

</details>

### 环境与入口

下载路径已核查 **Sub-Store Node 后端 2.41.0**，不等于所有旧版、代理 App 内置后端或同步 JS 覆写入口都支持。源码仍分为同步配置生成与可选异步下载，不依赖全局 `fetch()`。本地预览也不会下载 `providerurl`，详见 [PREVIEW.md](./PREVIEW.md#provider-only-结构预览)。

<details>
<summary>版本或入口不确定时：先在临时配置中运行这个探针</summary>

把下面代码作为**临时测试配置**的快捷脚本，确认输出中出现 `override-async-probe.invalid` 这个 hosts 项，再配置真实订阅。它只访问公开地址，不需要订阅密钥，不要保留为正式覆写脚本。

```javascript
async function main(config) {
    const response = await $substore.http.get({
        url: "https://cp.cloudflare.com/",
        timeout: 10000,
    });
    if (response.statusCode !== 200 || typeof response.body !== "string") {
        throw new Error("HTTP 探针失败，请检查后端版本和网络");
    }
    return {
        ...config,
        hosts: { ...config.hosts, "override-async-probe.invalid": "127.0.0.1" },
    };
}
```

验证依据：Sub-Store 提交 [`797c6c5`](https://github.com/sub-store-org/Sub-Store/tree/797c6c56b5b2344fcf4634d3055aeaa9ded4c4b2) 的 Mihomo 快捷脚本调用 `await main(config)`，注入 `$substore.http.get()`、`ProxyUtils.yaml.safeLoad()` 和 `Buffer`；已用该版本包装器及 Node HTTP 实现验证延迟响应与 `statusCode` / `body` 返回。

</details>

### 支持边界

| 能力 | 实际行为 |
| --- | --- |
| 精确节点顺序和地区识别 | provider 运行时使用独立名称正则，可能跨地区匹配，顺序由 Mihomo/provider 决定；不保证与显式节点模式完全等价 |
| 未识别节点只出现在手动选择 | 不保证；手动入口保留全部 provider 节点，地区组按正则近似匹配 |
| Tailscale | 使用显式 `proxies`；快照含 Tailscale 会拒绝，已有 provider 不触发自动 Tailscale 规则 |
| rename | 在节点来源上执行，快照不再执行 rename；以后更新必须仍从同一预处理流程输出 |
| 可用性验证 | 已用 Mihomo v1.19.31 验证 provider-only / 混合模式的地区及链路成员更新，无需重载主配置；测试不代表你的节点可连接，也不验证真实链式流量出口 |

### 失败、限制与凭据

- 快照请求超时 **10 秒**，要求 HTTP 200，最多 **2 MiB UTF-8 文本**、**2000 个节点**、每个名称最多 **512 字符**且不重名；YAML 别名展开上限 20。下载或校验失败会中止生成，不用空节点或旧快照冒充成功。
- Sub-Store 的 Node HTTP 实现先缓冲响应；2 MiB 是**收到响应后的解析上限，不是传输或进程内存硬上限**。仅使用可信来源。
- 订阅 URL 和 header 凭据会保留在参数及输出配置中。编码不是加密，优先使用 HTTPS，不分享完整链接、配置或敏感截图。脚本错误不输出 URL、正文或底层请求错误，但外层 Sub-Store / 反向代理日志仍需自行管理。
- 请求从 Sub-Store 主机发出，包括它可达的内网地址；不要向不可信用户开放配置生成入口。Mihomo 后续下载的网络位置、权限和缓存独立于 Sub-Store。

## 额外地区组

想同时手动选择同一地区的多个出口，可设置 `us=2&sg=1`，生成 `美国额外1`、`美国额外2`、`新加坡额外1`。每个组包含该地区全部合格候选，不是把节点分成几份。它们始终为手动 `select`，不受 `grouptype` 影响。

| 参数 | 地区 | 参数 | 地区 |
| --- | --- | --- | --- |
| `hk` | 香港 | `mo` | 澳门 |
| `tw` | 台湾 | `sg` | 新加坡 |
| `jp` | 日本 | `kr` | 韩国 |
| `us` | 美国 | `ca` | 加拿大 |
| `uk` | 英国 | `au` | 澳大利亚 |
| `de` | 德国 | `fr` | 法国 |
| `ru` | 俄罗斯 | `th` | 泰国 |
| `in` | 印度 | `my` | 马来西亚 |
| `ar` | 阿根廷 | `fi` | 芬兰 |
| `eg` | 埃及 | `ph` | 菲律宾 |
| `tr` | 土耳其 | `ua` | 乌克兰 |

- 数量只接受整数 `0–100`。不填或 `0` 不生成；负数、小数、非数字或大于 100 都按 0 处理。
- 有至少一个该地区候选就能生成额外组，不要求达到 `threshold`；没有候选则不生成空组。provider 的资格按生成时快照计算，之后不会自动重算。
- 基础组和额外组按地区权重排列，同一地区基础组在前，额外组按编号在后。它们会加入 `选择代理`、通用服务分流列表和 `GLOBAL`，相应地区的哔哩哔哩、巴哈姆特列表也会引用。
- 纯显式模式下，已经进入某个地区组的节点不再重复放进 `手动选择`；无剩余候选就不生成手动组。provider 模式仍保留全部 provider 的手动入口。
- 纯显式模式默认枚举节点；`regex=true` 时使用地区正则，并按名称排除已发现的落地节点。provider 模式按标签动态排除中转节点，地区统计也不包含落地快照。

这些数量参数只供 JS 使用，预生成 YAML 不包含额外组组合。脚本不再生成跨地区的 `自动选择`、`故障转移` 组；普通地区组自身的测速/负载均衡仍由 `grouptype` 控制。

## 前置地区映射

`front_a=hk,sg,jp` 的意思是：**让 A 链路的前置组从香港、新加坡、日本的普通节点中选，不是把 A 落地节点改成这些地区。** 默认链路用 `front`，字母链路用 `front_a`…`front_z`；地区代码取自上表。

```text
convert.min.js#front=hk,jp&front_a=sg,us
```

前置候选不依赖地区组是否存在或是否达到 `threshold`。显式节点按当前属性和地区分类选取，已校验 provider 按运行时名称过滤；不传地区限制则使用全部合格非落地候选。无候选时会回退直连，详见 [provider 链式代理](#provider-链式代理)。

## 动态脚本与静态 YAML

JS 根据显式节点或下载快照决定组结构；Tailscale 仅从显式节点识别。静态 YAML 使用虚拟节点集生成，不下载快照，也不能替代依赖真实节点数量和链路的动态行为。无法执行 JavaScript 的客户端可参考[预生成 YAML](./USAGE.md#预生成-yaml)。
