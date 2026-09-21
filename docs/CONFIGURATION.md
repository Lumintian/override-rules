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
| `regex` | 基础及额外地区组使用 `include-all + filter` 动态匹配节点 | `false` |
| `tun` | 启用 TUN 模式 | `false` |
| `threshold` | 某地区节点数量低于该值时不生成基础地区组；不影响额外地区组 | `2` |
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

生成规则：

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

每个前置组直接枚举所选地区的非落地节点，不依赖基础地区组、额外地区组或 `threshold`。如果映射地区当前没有候选节点，组内至少保留 `DIRECT`，避免生成空组。

## 动态脚本与静态 YAML

JavaScript 动态覆写会读取真实订阅节点，因此可以准确生成地区组、额外组和链式代理组。预生成 YAML 使用虚拟节点集构建，无法支持依赖真实节点数量的全部动态行为。

无法执行 JavaScript 的客户端可参考[预生成 YAML](./USAGE.md#预生成-yaml)。
