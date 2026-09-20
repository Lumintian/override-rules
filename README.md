# Mihomo / Sub-Store 覆写规则

![](img/cover.png)

[![](https://data.jsdelivr.com/v1/package/gh/Lumintian/override-rules/badge?style=rounded)](https://www.jsdelivr.com/package/gh/Lumintian/override-rules)

本仓库是面向 **Mihomo + Sub-Store** 的个人覆写规则集合，基于 [powerfullz/override-rules](https://github.com/powerfullz/override-rules) 进行二次维护，并根据自己的节点管理、链式代理与策略组使用习惯持续调整。

主要特点：

- 集成 [SukkaW/Surge](https://github.com/SukkaW/Surge)、[217heidai/adblockfilters](https://github.com/217heidai/adblockfilters) 等规则源。
- 使用 GeoSite / GeoIP 及自定义 Rule Provider 进行细粒度分流。
- 自动识别订阅中的国家 / 地区节点，并仅生成实际存在的地区策略组。
- 支持 `select`、`url-test`、`load-balance` 三种基础地区策略组类型，并可按地区添加多个独立的手动选择组。
- 支持链式代理、Tailscale、Fake-IP、TUN、IPv6 等场景。
- JavaScript 动态覆写优先面向 Sub-Store 使用。

> [!NOTE]
> 本仓库首先服务于个人使用场景，不保证兼容所有 Clash / Mihomo 客户端。目前主要围绕 Sub-Store + Mihomo 进行维护。

## 快速开始

推荐通过 **Sub-Store** 使用 JavaScript 动态覆写：

```text
https://cdn.jsdelivr.net/gh/Lumintian/override-rules@dist/convert.min.js
```

在 Sub-Store 的脚本操作中加入上述脚本即可。

脚本支持通过 URL Fragment 传入参数，例如：

```text
https://cdn.jsdelivr.net/gh/Lumintian/override-rules@dist/convert.min.js#grouptype=1&fakeip=true
```

> [!TIP]
> 动态 JavaScript 覆写会读取实际订阅节点并生成策略组，因此相比预生成 YAML，更适合本仓库的使用方式。

## 支持的参数

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

### 额外地区组

使用小写地区代码作为参数名，以数量为参数值。例如：

```text
https://cdn.jsdelivr.net/gh/Lumintian/override-rules@dist/convert.min.js#grouptype=1&us=2&sg=1
```

当订阅中存在对应地区的候选节点时，将生成 `美国额外1`、`美国额外2`、`新加坡额外1`。这些组全部固定为 `select`，每组都包含对应地区的候选节点，可以分别手动选择不同节点，供不同服务使用；不是对地区节点进行分片，也不是只引用原有的 `美国节点` 等基础组。

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

- 未传参数或值为 `0` 时不生成额外组。负数、小数、非数字或大于 `100` 的值均按 `0` 处理；数量上限用于防止误配置生成过多策略组。
- 只要某地区生成了基础地区组或至少一个额外组，该地区节点就不再重复列入 `手动选择`；未生成任何地区组和未识别地区的节点仍保留。没有剩余候选节点时不生成空的 `手动选择` 组。
- 额外组不受 `grouptype` 和 `threshold` 影响。例如美国只有一个候选节点时，默认不生成 `美国节点`，但 `us=2` 仍会生成两个美国额外组。没有对应地区候选节点时不生成空组，即使启用了 `regex=true`。
- 额外组复用基础地区组的节点来源规则：默认枚举当前节点；`regex=true` 时使用相同的地区正则和排除正则。链式代理激活时，生成资格及枚举成员只依据非落地节点；正则模式会额外按已发现的落地节点名称排除它们。
- 组按地区权重排序，同一地区的基础组在前，额外组按编号排列在后。
- 额外组加入 `选择代理`、通用服务分流列表和 `GLOBAL`。每个「前置代理X」直接枚举由 `front_x` 选定地区的非落地节点，不依赖地区组或额外组。哔哩哔哩和巴哈姆特的地区专用列表也会加入对应地区的额外组。
- 不再生成跨地区的 `自动选择` 和 `故障转移` 组；可在 `选择代理` 中直接选用地区组、额外手动组、启用时的落地组或 `手动选择`。基础地区组自身的测速 / 负载均衡仍由 `grouptype` 控制。

这些数量参数供 JavaScript 动态覆写使用，预生成 YAML 的组合不包含额外地区组。

## 补充说明

### Sub-Store 节点名称预处理

本项目维护一套与 Mihomo 覆写配套的 [Sub-Store 节点重命名脚本](scripts/substore/README.md)，用于预先统一节点的地区名称、国旗、序号、倍率及线路标签。稳定的命名约定能提高地区识别准确度，并为后续联动家宽、自建和落地策略组提供基础。

```text
原始订阅 → rename.min.js → 规范化节点名称 → convert.min.js → Mihomo 配置
```

> [!IMPORTANT]
> 重命名脚本是 Sub-Store 节点预处理组件，不是 Mihomo 覆写脚本。请依次执行节点重命名与配置覆写。

发布版本：

```text
https://cdn.jsdelivr.net/gh/Lumintian/override-rules@dist/rename.min.js
```

推荐参数组合：

```text
https://cdn.jsdelivr.net/gh/Lumintian/override-rules@dist/rename.min.js#flag&blgd&bl&blkey=自建+落地&nm&chain
```

`chain` 会识别原节点名称中的「中转」和「中转A..Z」，分别写入 `dialer-proxy: 前置代理` 和 `dialer-proxy: 前置代理A..Z`。

该脚本以 [FengNinger/substore_rename_rule](https://github.com/FengNinger/substore_rename_rule) 为初始基础，现由本项目独立维护，后续实现可能随覆写规则演进而与上游不同。源码、基线版本及许可证信息见 [`scripts/substore/`](scripts/substore/README.md)。

### 关于 DNS 泄露的说明

很多人问用了这覆写规则跑 DNS 泄露测试说会泄露，为此我写了一篇文章澄清一些误解，具体请看[「关于 DNS 泄露及其相关误解的说明」](https://blog.l3zc.com/2026/05/dns-leak-misunderstanding/)。

### 关于部分特殊代理组的说明

**静态资源**：包含所有常见静态资源 CDN 域名、对象存储域名。大部分网站的静态资源（如图片、视频、音频、字体、JS、CSS）都有独立域名、不设置风控措施、不设置鉴权，这些静态资源可以使用 IP 不一定干净（例如 IDC 类 IP）、但是带宽更大、延时更低、而且有和大部分主流 CDN（如 Cloudflare、Akamai、Fastly、EdgeCast）在 IXP 有互联的网络出口。一般就实践经验来看，在正常上网中这部分域名产生的流量占据约 70% 左右。如果你在使用商业性质的远端策略服务提供商、且该服务上提供了低倍率节点，你可以将这部分域名分流至低倍率节点以节省流量。[^fn1]

[^fn1]: 来源：[我有特别的 Surge 配置和使用技巧](https://blog.skk.moe/post/i-have-my-unique-surge-setup/)

~~**Play 商店修复**：~~ 修复国行设备因使用`services.googleapis.cn`域名导致的 Google Play 下载应用时的「等待中…」问题。详见：[「Google Play 商店的国内 CDN：从密码学入门到分流策略优化」](https://blog.l3zc.com/2025/03/chinese-cdn-used-by-playstore/)，已经是默认行为。

~~**Steam 修复**：~~ 用于让 Steam 客户端调用国内 CDN 及 P2P 网络下载，节省大量流量，已经是默认行为。

### 关于链式代理的说明

落地节点可以直接携带 `dialer-proxy: "前置代理"`，也可以先由改名脚本的 `chain` 参数根据名称写入。带字母标签的节点会形成独立链路：

```text
美国落地 中转A → dialer-proxy: 前置代理A → 生成「前置代理A」和「落地节点A」
德国落地 中转B → dialer-proxy: 前置代理B → 生成「前置代理B」和「落地节点B」
```

覆写脚本仅为实际存在的链路生成成对策略组。不同服务可以分别选择「落地节点A」「落地节点B」，从而同时使用不同的落地线路。

可以通过地区参数限制各前置组的入口候选：

```text
convert.min.js#front_a=hk,sg,jp&front_b=uk,de,fr
```

没有配置 `front_a` 等参数时，该前置组使用全部非落地节点；指定地区当前无节点时仍保留 `DIRECT`，避免生成空组。只有落地节点、没有任何非落地节点时不会激活链式模式。

![新增的代理组](img/dialer-group.png) ![如何配置自建节点](img/dialer-example.png)

## 特殊策略组

### 静态资源

`静态资源` 组主要承载常见 CDN、对象存储、图片、视频、字体、JavaScript、CSS 等静态资源流量。

如果订阅中存在低倍率、大带宽节点，可以将静态资源分流到这类节点以降低流量成本。

相关思路参考：[我有特别的 Surge 配置和使用技巧](https://blog.skk.moe/post/i-have-my-unique-surge-setup/)。

脚本不再单独识别或生成 `低倍率节点` 策略组；原始节点仍保留。达到 `threshold` 的地区通过对应地区组使用，未生成基础地区组的节点仍可通过 `手动选择` 使用。

### 漏网之鱼

`漏网之鱼` 是规则列表末尾的 `MATCH` 兜底组。广告、静态资源、各服务分流、GFW 列表和国内直连都没命中时，流量会进入这里。

组内只有 `选择代理` 和 `DIRECT`：默认继续走你选的代理，也可以改成直连。它不是空组；看起来很少被点到，是因为大部分流量已经被前面的规则吃掉了。

### AI 服务

AI 流量按以下优先级分流：

1. `XAI`：匹配 `GEOSITE,xai` 以及域名关键字 `grok`。
2. `ChatGPT`：匹配 `GEOSITE,openai`。
3. `AI服务`：通过 `GEOSITE,category-ai-!cn` 承接其余海外 AI 服务。

具体服务规则位于通用 AI 分类规则之前，避免 XAI 和 ChatGPT 流量被 `AI服务` 提前匹配。

### Tailscale

检测到 `tailscale` 类型节点后，脚本会生成对应策略组、TUN 配置及相关分流规则。

示例：

```yaml
proxies:
  - name: "Tailscale出口"
    type: tailscale
    auth-key: tskey-auth-xxxxxxxx
    control-url: https://controlplane.tailscale.com
    ephemeral: true
    udp: true
```

注意不要直接将节点命名为 `Tailscale`，否则可能与策略组名称冲突。

## DNS

脚本默认生成自己的 DNS 配置，并支持：

- Fake-IP / RedirHost
- IPv6
- Fake-IP Filter
- 从上游配置继承部分 DNS Policy

默认开启 Fake-IP：

```text
#fakeip=true
```

如果需要使用 RedirHost：

```text
#fakeip=false
```

需要注意：不同客户端（尤其 OpenClash、Clash Party 等）可能还会额外接管 DNS、TUN 或域名嗅探配置。排查 DNS 行为时，应同时确认客户端侧是否进行了二次覆盖。

## QUIC

默认会阻止 UDP 443，以避免部分节点 UDP 质量较差时影响访问体验。

如果确定节点 UDP / QUIC 质量正常，可以开启：

```text
#quic=true
```

## 其他客户端

### Clash Party / Sparkle

可以使用动态 JavaScript 覆写：

```text
https://cdn.jsdelivr.net/gh/Lumintian/override-rules@dist/convert.min.js
```

但部分客户端不支持向脚本传递参数；需要参数化配置时优先使用 Sub-Store。

同时请检查客户端是否额外接管 DNS、SNI / 域名嗅探等配置。

### Clash Verge 系

对于不能直接执行 JavaScript 覆写的客户端，可以使用 Release / `dist` 分支生成的 YAML 配置。

不过预生成 YAML 不能像动态脚本一样根据真实订阅中的节点自动生成最精确的策略组，因此仍优先推荐 Sub-Store 动态覆写。

## 预生成 YAML

源码主分支不跟踪 `dist/` 下的构建产物。

发布时通过 GitHub Actions：

1. 构建 JavaScript 覆写。
2. 生成 YAML 组合。
3. 推送到 `dist` 分支。
4. 生成对应版本的 Release 与 `vX.Y.Z` 产物标签。

源码发布标签使用：

```text
src-vX.Y.Z
```

生成产物对应：

```text
vX.Y.Z
```

YAML 文件命名格式：

```text
config_gt-{0|1|2}_ipv6-{0|1}_full-{0|1}_keepalive-{0|1}_fakeip-{0|1}_quic-{0|1}_tun-{0|1}.yaml
```

例如：

```text
https://cdn.jsdelivr.net/gh/Lumintian/override-rules@dist/yamls/config_gt-0_ipv6-0_full-1_keepalive-0_fakeip-0_quic-0_tun-0.yaml
```

固定版本：

```text
https://cdn.jsdelivr.net/gh/Lumintian/override-rules@vX.Y.Z/yamls/config_gt-0_ipv6-0_full-1_keepalive-0_fakeip-0_quic-0_tun-0.yaml
```

> [!NOTE]
> 静态 YAML 是使用虚拟节点集生成的，无法完全根据实际订阅进行动态分组。需要动态节点识别时请使用 JavaScript 覆写。

## 开发

### 本地快速预览

```bash
npm run preview
```

打开 **http://127.0.0.1:8787**，粘贴逐行节点名称，或导入返回名称文本 / Clash YAML / JSON 的公网链接。页面直接执行当前改名和覆写源码，提供名称对照、策略组卡片、模拟手动选择及配置查看；源码保存后自动更新，无须先构建产物。

工具只监听回环地址，不新增第三方依赖，不保存订阅，不执行真实测速。也可以在远端运行，通过 SSH 隧道访问：

```bash
# 远端：运行 npm run preview
# 本机：将本地 8788 转发到远端预览服务的 8787
ssh -N -L 127.0.0.1:8788:127.0.0.1:8787 user@server
```

然后在本机打开 **http://127.0.0.1:8788**。链接下载与 DNS 解析由运行预览服务的机器完成。

输入限制、隐私边界及使用方法见 [本地开发预览](docs/PREVIEW.md)。

### 源码与命令

源码位于 `src/`：

```text
src/
├── args.ts
├── constants.ts
├── dns.ts
├── main.ts
├── node_parser.ts
├── proxy_groups.ts
├── rule_providers.ts
├── rules.ts
├── selectors.ts
├── tun.ts
├── types.ts
└── utils.ts
```

常用命令：

```bash
npm install
npm run typecheck
npm run lint
npm test
npm run preview
npm run build
npm run artifacts
```

进一步自定义请阅读：

- [如何自定义专属覆写规则](docs/HOW_TO_CUSTOMISE.md)
- [贡献指南](docs/HOW_TO_CONTRIBUTE.md)
- [架构说明](docs/ARCHITECTURE.md)

## 上游与许可证

本项目基于 [powerfullz/override-rules](https://github.com/powerfullz/override-rules) 修改，并继续使用 MIT License。

仓库中的部分规则、图标与数据来自其他开源项目，其版权与许可证归各自项目所有。

感谢原项目以及相关规则维护者的工作。
