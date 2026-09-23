# JavaScript 动态覆写参数

本页说明 `convert.min.js` 支持的 URL Fragment 参数。Sub-Store 会解析 `#` 后的参数并将其传给覆写脚本；多个参数使用 `&` 连接。

基础地址：

```text
https://cdn.jsdelivr.net/gh/Lumintian/override-rules@dist/convert.min.js
```

参数示例：

```text
https://cdn.jsdelivr.net/gh/Lumintian/override-rules@dist/convert.min.js#grouptype=1&fakeip=true&us=2
```

## 参数表

| 参数 | 说明 | 默认值 |
| --- | --- | --- |
| `grouptype` | 基础地区策略组类型：`0=select`、`1=url-test`、`2=load-balance`，不影响额外地区组 | `1` |
| `ipv6` | 启用 IPv6 | `false` |
| `full` | 生成完整 Mihomo 配置 | `false` |
| `keepalive` | 启用 TCP Keep Alive | `false` |
| `fakeip` | DNS 使用 Fake-IP；显式传 `false` 时使用 RedirHost | `true` |
| `quic` | 允许 UDP 443 / QUIC 流量 | `false` |
| `regex` | 显式节点模式下，基础及额外地区组使用 `include-all + filter`；存在节点 provider 时改用 `use + filter` | `false` |
| `tun` | 启用 TUN 模式 | `false` |
| `threshold` | 某地区节点数量低于该值时不生成基础地区组；不影响额外地区组 | `2` |
| `providerurl` | 单个 HTTP(S) Mihomo 节点订阅 URL，生成时下载快照、运行时通过 provider 更新；值须 `encodeURIComponent` 编码，仅支持 Sub-Store Node 异步快捷脚本 | 不下载快照 |
| `providerinterval` | 新建节点 provider 的更新周期，整数 `60–604800` 秒；须与 `providerurl` 一起使用，复用已有同源 provider 时不覆盖原周期 | `3600` |
| `front`、`front_a`…`front_z` | 对应落地链路允许使用的前置地区代码，逗号分隔，例如 `front_a=hk,sg,jp`；未传时使用全部非落地节点 | 全部非落地节点 |
| `us`、`sg` 等地区代码 | 对应地区的额外手动选择组数量，整数 `0–100`；完整代码见下表 | `0` |

布尔参数支持 `true / false` 或 `1 / 0`。

## 常用组合

使用测速类型的基础地区组，并为美国和新加坡分别添加额外手动组：

```text
convert.min.js#grouptype=1&us=2&sg=1
```

使用 RedirHost、IPv6 和 TUN：

```text
convert.min.js#fakeip=false&ipv6=true&tun=true
```

限制不同落地链路的前置地区：

```text
convert.min.js#front_a=hk,sg,jp&front_b=uk,de,fr
```

链式代理的节点命名、`dialer-proxy` 字段和策略组生成方式见[使用场景与行为说明](./USAGE.md#链式代理)。

## 节点订阅 provider 与生成时快照

此处的 `proxy-providers` 是**节点订阅**；与脚本原有的 `rule-providers` 分流规则集无关。

```text
生成时：providerurl → 下载节点快照 + 输入的显式节点 → 地区统计 / threshold / 额外组资格 / 链路结构
输出时：仅保留原来的显式 proxies，合并 proxy-providers，策略组使用 use + filter
运行时：Mihomo 按 provider interval 更新节点；主配置和组结构保持不变
```

### 环境与入口

下载仅支持 **Sub-Store Node / Docker 后端的 Mihomo 配置快捷脚本**。已核查后端 **2.41.0**（提交 [`797c6c5`](https://github.com/sub-store-org/Sub-Store/tree/797c6c56b5b2344fcf4634d3055aeaa9ded4c4b2)）：`backend/src/core/proxy-utils/processors/index.js` 的快捷脚本调用 `await main(config)`，并注入 `$substore.http.get()`、`ProxyUtils.yaml.safeLoad()` 和 `Buffer`。使用该提交的快捷脚本包装器与 Node HTTP 实现，通过延迟响应的本地 HTTP 服务验证了异步等待及 `statusCode` / `body` 返回结构。

这不等于所有旧版或部署实例均已验证。部署版本不同或未知时，请先在**临时配置**中运行以下快捷脚本，确认输出包含测试 hosts，再使用订阅参数；不要把本地预览成功当作入口验证。测试只访问公开地址，不需要订阅密钥。

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

生成核心仍保持同步；仅带 `providerurl` 的部署入口返回 Promise。其他客户端的同步覆写入口、代理 App 内置后端以及本地预览器不支持此下载流程，不会尝试回退到全局 `fetch()`。

### 订阅格式及编码

来源必须直接返回 Mihomo 可用的 **YAML 或 JSON 对象，含非空 `proxies` 数组**。可以是节点 provider 文件，也可以是含 `proxies` 的完整配置；其他顶层字段不会被导入。暂不转换 Base64、`ss://` 等 URI 列表，不递归展开来源中的其他 provider。节点需含非空 `name`、`type`、`server` 和有效 `port`；协议专属字段是否正确仍由 Mihomo 校验。

```yaml
proxies:
  - name: 香港 01
    type: ss
    server: node.example
    port: 443
    cipher: aes-128-gcm
    password: example-only
```

对**整个订阅 URL 编码一次**，再拼接 Fragment。不要把内层 URL 的 `&` 当成脚本参数分隔符，也不要对传入脚本的值再次解码：

```javascript
const subscription = "https://example.com/provider.yaml?token=EXAMPLE&target=mihomo";
const script = "https://cdn.jsdelivr.net/gh/Lumintian/override-rules@dist/convert.min.js";
const link = `${script}#providerurl=${encodeURIComponent(subscription)}&providerinterval=3600&us=2`;
```

输入可以只有 `proxy-providers`，也可以是显式节点与 provider 混合；带 `providerurl` 时 `{}` 也可作为输入。快照不会写入输出 `proxies`，也不会被枚举到 `GLOBAL`、地区组或前置组的 `proxies` 字段中。

### 已有 provider 与动态引用

- 保留所有已有 `http`、`file`、`inline` provider 定义，不主动下载它们。**只有 `providerurl` 的快照和输入显式节点参与地区统计**；其他 provider（包括 inline 的 payload）只接入运行时选择。因此，仅有已有 provider、未传 `providerurl` 时，默认只生成可达的动态手动入口，不会猜测地区组。
- 若 `providerurl` 与已有 HTTP provider 的 URL 字符串完全一致，复用其名称、缓存路径、周期等设置。快照请求沿用其 `header`（每个值须为单元素字符串数组）；未指定 User-Agent 时使用 `clash.meta`。已有同源 provider 含 `filter`、`exclude-filter`、`exclude-type` 或 `override` 时拒绝快照生成，避免按未变换的节点错误统计。
- 否则新建 `override-provider`，有名称或规范化缓存路径冲突时递增为 `override-provider-2` 等；缓存位于 `./proxy_providers/`。新 provider 使用 `proxy: DIRECT`，避免订阅下载依赖自身节点。订阅须能从 Mihomo 所在机器直连；需要特殊下载代理时，可预先定义同 URL provider 并配置其 `proxy`。已有 provider 的路径与依赖需适合目标 Mihomo 环境，脚本不会保留输入的旧策略组。
- 已生成的基础和额外地区组：`proxies` 只枚举当前显式候选节点，`use` 引用全部 provider，`filter` / `exclude-filter` 使用地区正则，并动态排除全部 `中转 / 中转A…Z` 标签。统计时也排除快照中的落地节点。存在 provider 时，不再通过 `regex=true` 扩大为 `include-all`。
- `手动选择` 始终引用全部 provider，不排除已经进入地区组的节点；`选择代理` 可通过它到达任何 provider 节点，`GLOBAL` 也直接设置 `use`。新增、改名、未知地区以及尚未生成地区组的节点不会因快照过期而失去手动入口。

### provider 链式代理

沿用 rename 与 override 的同一套链路约定，不需要另起一套命名规则：

```text
最终名称包含完整标签        节点属性                    生成的链路组
中转                       dialer-proxy: 前置代理       前置代理 / 落地节点
中转A                      dialer-proxy: 前置代理A      前置代理A / 落地节点A
…                          …                           …
中转Z                      dialer-proxy: 前置代理Z      前置代理Z / 落地节点Z
```

**订阅来源必须持续输出名称与属性一致的节点。** rename 的 `chain` 设置属性，但不会自动保留最终名称中的标签；来源预处理应同时配置 `blkey`，例如默认、A、B 三条链路：

```text
rename.min.js#chain&blkey=中转+中转A+中转B
```

其他 rename 参数可以继续使用。最终标签使用 `中转` 或紧接半角字母的 `中转A…Z`（匹配不区分字母大小写），标签后须为名称结尾或非 ASCII 字母/数字分隔符。不要把 `中转A` 改写为 `线路A`，不要用空 `sn` 把编号拼成 `中转A01`，也不要在来源前缀等无关字段加入这些保留标签。原始名识别可接受的全角字符、内部空格不等于最终 provider 名称可用，输出应使用规范标签。

生成时校验最终名称与 `dialer-proxy` 的一一对应。缺标签、缺属性、链路编号不同、多个不同标签或其他拨号目标都会中止生成；不会仅修改快照来掩盖来源问题。**后续 Mihomo 自行更新不会再次执行这项 JS 校验**，所以需保持来源预处理约定不变。

- 支持前置和落地都在 provider 中，也支持“provider 前置 + 显式落地”或“显式前置 + provider 落地”。显式落地继续按属性识别，不额外要求名称标签。
- 从快照及显式节点发现链路，生成固定的成对策略组。落地组以 `use + filter` 精确匹配对应标签；默认 `中转` 不会混入 `中转A`，A 也不会混入 B。
- 前置组使用 `front` / `front_a…front_z` 地区正则，并以 `exclude-filter` 排除**全部中转标签**，防止自身或其他落地链路混入前置候选。前置来源不受 `threshold` 和地区组是否存在影响。
- 前置及落地链路组只动态引用 **`providerurl` 快照所对应、已通过校验的那个 provider**。未下载的已有 provider 不接入链路组，避免其隐藏的拨号属性或 override 造成循环；仍保留普通地区、手动选择及 GLOBAL 的入口。同 URL 多个定义也只校验并引用第一个匹配项。
- 动态前置组不把 `DIRECT` 排在 provider 节点之前，否则初始选择会绕过前置。没有任何候选时采用 Mihomo 的空组回退（已验证版本显示 `COMPATIBLE`，行为为直连），**不是阻断流量**。若没有已校验 provider，则前置组仍只使用显式候选，空候选保留 `DIRECT`。
- 已有链路中的增删、序号或前缀变化无需重建主配置；新增链路编号、修改前置地区范围仍需重新生成。只有落地快照、暂时没有前置候选时也保留目标组，不把落地节点反过来作为前置。

### 支持边界

| 能力 | provider 模式的行为 |
| --- | --- |
| 日常增删、改名 | 已有组通过 `use + filter` 动态匹配，不必重建主配置 |
| `threshold`、地区组存在性、额外组资格与数量 | 仅生成时计算；新增地区不会自动产生新组，减少节点也不会自动删除组；重新运行 JS 并加载配置才能重算；无匹配成员时的回退行为由 Mihomo 决定 |
| 地区识别与排序 | 运行时是独立名称正则，不保证与生成时的完整分类完全等价；可能跨组匹配，节点顺序由 Mihomo/provider 决定 |
| 未识别节点仅进入手动选择 | 不保证；手动入口包含全部 provider 节点，地区组采用正则近似匹配 |
| 链式代理 | 支持名称标签与属性一致的快照来源，通过动态过滤维持已有链路；新增链路编号需重新生成，未经快照校验的 provider 不进入前置或落地组 |
| Tailscale | 继续使用显式节点；快照含 Tailscale 时明确拒绝，已有 provider 不触发自动 Tailscale 规则 |
| 节点改名 | 快照不执行 rename；如需规范命名，应使订阅来源本身输出相同的预处理结果，确保生成时与 Mihomo 更新时一致 |

### 失败、限制与凭据

快照请求超时 **10 秒**；只接受 HTTP 200、最多 **2 MiB UTF-8 文本**、**2000 个节点**、每个名称最多 **512 字符**且不重名；YAML 别名展开上限为 20。下载失败、格式错误或超过限制会中止生成，不回退成空节点配置，也不使用旧快照冒充成功。

使用 Sub-Store 的 HTTP API；其 Node 实现先缓冲响应，2 MiB 是**收到响应后的解析上限，不是传输或进程内存硬上限**。仅使用可信的订阅服务。脚本不输出 URL、响应正文、底层请求或解析错误，但 Sub-Store、反向代理等外层日志需自行管理。

含 token 的订阅 URL 会保留在脚本参数及输出 provider 的 `url` 中，header 凭据同样保留；编码不是加密，请优先使用 HTTPS。不要分享完整链接、生成配置或敏感截图。此功能会从 Sub-Store 主机请求用户指定的 HTTP(S) 地址，包括可达的内网地址；不要向不可信用户开放配置生成入口。Mihomo 后续更新的网络位置、权限和缓存均独立于 Sub-Store。

本地预览的限制见 [PREVIEW.md](./PREVIEW.md#provider-only-结构预览)。已用 Mihomo **v1.19.31** 验证 provider-only / 混合模式中，provider 刷新后地区组、前置组、落地组和手动入口更新，而主配置未重新加载；测试隔离了规则集、Geo 数据和连接测速，不代表完整配置或真实订阅的可连接性验收。

## 额外地区组

使用小写地区代码作为参数名，以数量作为参数值。例如：

```text
https://cdn.jsdelivr.net/gh/Lumintian/override-rules@dist/convert.min.js#grouptype=1&us=2&sg=1
```

当订阅中存在对应地区的候选节点时，将生成 `美国额外1`、`美国额外2`、`新加坡额外1`。这些组固定为 `select`，每组都包含对应地区的候选节点，可以分别手动选择不同节点；它们不会对节点进行分片，也不只是引用原有的基础地区组。

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

以下生成规则描述显式节点模式；provider 模式的动态成员、手动入口和统计范围以上节为准。

- 未传参数或值为 `0` 时不生成额外组。负数、小数、非数字或大于 `100` 的值均按 `0` 处理。
- 只要某地区生成了基础地区组或至少一个额外组，该地区节点就不再重复列入 `手动选择`；未生成任何地区组和未识别地区的节点仍保留。没有剩余候选节点时不生成空的 `手动选择` 组。
- 额外组不受 `grouptype` 和 `threshold` 影响。例如美国只有一个候选节点时，默认不生成 `美国节点`，但 `us=2` 仍会生成两个美国额外组。没有对应地区候选节点时不生成空组，即使启用了 `regex=true`。
- 额外组复用基础地区组的节点来源规则：默认枚举当前节点；`regex=true` 时使用相同的地区正则和排除正则。
- 链式代理激活时，地区组的生成资格及枚举成员只依据非落地节点；正则模式会额外按已发现的落地节点名称排除它们。
- 组按地区权重排序，同一地区的基础组在前，额外组按编号排列在后。
- 额外组加入 `选择代理`、通用服务分流列表和 `GLOBAL`。哔哩哔哩和巴哈姆特的地区专用列表也会加入对应地区的额外组。
- 不再生成跨地区的 `自动选择` 和 `故障转移` 组；基础地区组自身的测速或负载均衡仍由 `grouptype` 控制。

这些数量参数只供 JavaScript 动态覆写使用，预生成 YAML 的组合不包含额外地区组。

## 前置地区映射

`front` 对应无字母后缀的默认链路；`front_a` 到 `front_z` 对应 `前置代理A` 到 `前置代理Z`。值为逗号分隔的地区代码：

```text
convert.min.js#front=hk,jp&front_a=sg,us
```

每个前置组直接枚举所选地区的显式非落地节点，不依赖基础地区组、额外地区组或 `threshold`。存在已校验 provider 快照时，还通过地区正则动态引用其非落地节点。仅显式模式的空候选保留 `DIRECT`；动态组无候选时使用 Mihomo 空组回退，详见上面的链式代理边界。

## 动态脚本与静态 YAML

JavaScript 动态覆写基于显式节点或下载快照生成地区、额外及链路组；provider 链路依赖最终名称标签与拨号属性的一致性，Tailscale 仅支持显式节点。预生成 YAML 使用虚拟节点集构建，无法支持依赖真实节点数量的全部动态行为，也不包含订阅下载流程。

无法执行 JavaScript 的客户端可参考[预生成 YAML](./USAGE.md#预生成-yaml)。
