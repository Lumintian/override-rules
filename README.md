# Mihomo / Sub-Store 覆写规则

![](img/cover.png)

[![](https://data.jsdelivr.com/v1/package/gh/Lumintian/override-rules/badge?style=rounded)](https://www.jsdelivr.com/package/gh/Lumintian/override-rules)

本仓库是面向 **Mihomo + Sub-Store** 的个人覆写规则集合，基于 [powerfullz/override-rules](https://github.com/powerfullz/override-rules) 进行二次维护，并根据自己的节点管理、链式代理与策略组使用习惯持续调整。

主要特点：

- 集成 [SukkaW/Surge](https://github.com/SukkaW/Surge)、[217heidai/adblockfilters](https://github.com/217heidai/adblockfilters) 等规则源。
- 使用 GeoSite / GeoIP 及自定义 Rule Provider 进行细粒度分流。
- 自动识别订阅中的国家 / 地区节点，并仅生成实际存在的地区策略组。
- 支持 `select`、`url-test`、`load-balance` 三种地区策略组类型。
- 支持低倍率节点、链式代理、Tailscale、Fake-IP、TUN、IPv6 等场景。
- JavaScript 动态覆写优先面向 Sub-Store 使用。

> [!NOTE]
> 本仓库首先服务于个人使用场景，不保证兼容所有 Clash / Mihomo 客户端。目前主要围绕 Sub-Store + Mihomo 进行维护。

## 快速开始

推荐通过 **Sub-Store** 使用 JavaScript 动态覆写：

```text
https://cdn.jsdelivr.net/gh/Lumintian/override-rules/convert.min.js
```

在 Sub-Store 的脚本操作中加入上述脚本即可。

脚本支持通过 URL Fragment 传入参数，例如：

```text
https://cdn.jsdelivr.net/gh/Lumintian/override-rules/convert.min.js#grouptype=1&fakeip=true
```

> [!TIP]
> 动态 JavaScript 覆写会读取实际订阅节点并生成策略组，因此相比预生成 YAML，更适合本仓库的使用方式。

## 支持的参数

| 参数 | 说明 | 默认值 |
| --- | --- | --- |
| `grouptype` | 地区策略组类型：`0=select`、`1=url-test`、`2=load-balance` | `1` |
| `ipv6` | 启用 IPv6 | `false` |
| `full` | 生成完整 Mihomo 配置 | `false` |
| `keepalive` | 启用 TCP Keep Alive | `false` |
| `fakeip` | DNS 使用 Fake-IP；显式传 `false` 时使用 RedirHost | `true` |
| `quic` | 允许 UDP 443 / QUIC 流量 | `false` |
| `regex` | 地区组使用 `include-all + filter` 动态匹配节点 | `false` |
| `tun` | 启用 TUN 模式 | `false` |
| `threshold` | 某地区节点数量低于该值时不生成对应地区组 | `2` |

布尔参数支持 `true / false` 或 `1 / 0`。

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
https://cdn.jsdelivr.net/gh/Lumintian/override-rules@dist/rename.min.js#flag&blgd&bl&blkey=自建+落地&nm
```

该脚本以 [FengNinger/substore_rename_rule](https://github.com/FengNinger/substore_rename_rule) 为初始基础，现由本项目独立维护，后续实现可能随覆写规则演进而与上游不同。源码、基线版本及许可证信息见 [`scripts/substore/`](scripts/substore/README.md)。

### 关于 DNS 泄露的说明

很多人问用了这覆写规则跑 DNS 泄露测试说会泄露，为此我写了一篇文章澄清一些误解，具体请看[「关于 DNS 泄露及其相关误解的说明」](https://blog.l3zc.com/2026/05/dns-leak-misunderstanding/)。

### 关于部分特殊代理组的说明

**静态资源**：包含所有常见静态资源 CDN 域名、对象存储域名。大部分网站的静态资源（如图片、视频、音频、字体、JS、CSS）都有独立域名、不设置风控措施、不设置鉴权，这些静态资源可以使用 IP 不一定干净（例如 IDC 类 IP）、但是带宽更大、延时更低、而且有和大部分主流 CDN（如 Cloudflare、Akamai、Fastly、EdgeCast）在 IXP 有互联的网络出口。一般就实践经验来看，在正常上网中这部分域名产生的流量占据约 70% 左右。如果你在使用商业性质的远端策略服务提供商、且该服务上提供了低倍率节点，你可以将这部分域名分流至低倍率节点以节省流量。[^fn1]

[^fn1]: 来源：[我有特别的 Surge 配置和使用技巧](https://blog.skk.moe/post/i-have-my-unique-surge-setup/)

~~**Play 商店修复**：~~ 修复国行设备因使用`services.googleapis.cn`域名导致的 Google Play 下载应用时的「等待中…」问题。详见：[「Google Play 商店的国内 CDN：从密码学入门到分流策略优化」](https://blog.l3zc.com/2025/03/chinese-cdn-used-by-playstore/)，已经是默认行为。

~~**Steam 修复**：~~ 用于让 Steam 客户端调用国内 CDN 及 P2P 网络下载，节省大量流量，已经是默认行为。

### 关于链式代理的说明

对于使用机场线路配合自行购买的落地机进行链式代理的情况，在 Substore 添加自建节点时，加入`dialer-proxy: "前置代理"`脚本即可自动识别，并新增「前置代理」和「落地节点」两个代理组。

![新增的代理组](img/dialer-group.png) ![如何配置自建节点](img/dialer-example.png)

> [!WARNING]
> 当前所有落地节点共用同一个 `前置代理` 策略组，因此修改前置节点会同时影响所有落地节点。这是目前链式代理实现中准备继续优化的一部分。

## 特殊策略组

### 静态资源

`静态资源` 组主要承载常见 CDN、对象存储、图片、视频、字体、JavaScript、CSS 等静态资源流量。

如果订阅中存在低倍率、大带宽节点，可以将静态资源分流到这类节点以降低流量成本。

相关思路参考：[我有特别的 Surge 配置和使用技巧](https://blog.skk.moe/post/i-have-my-unique-surge-setup/)。

### 低倍率节点

脚本会根据节点名称识别部分低倍率 / 省流节点，并生成 `低倍率节点` 策略组。

当前识别主要依赖名称中的倍率或相关关键字，因此建议在 Sub-Store 中统一倍率命名方式。

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
https://cdn.jsdelivr.net/gh/Lumintian/override-rules/convert.min.js
```

但部分客户端不支持向脚本传递参数；需要参数化配置时优先使用 Sub-Store。

同时请检查客户端是否额外接管 DNS、SNI / 域名嗅探等配置。

### Clash Verge 系

对于不能直接执行 JavaScript 覆写的客户端，可以使用 Release / `dist` 分支生成的 YAML 配置。

不过预生成 YAML 不能像动态脚本一样根据真实订阅中的节点自动生成最精确的策略组，因此仍优先推荐 Sub-Store 动态覆写。

## 预生成 YAML

源码主分支不跟踪 `convert.js`、`convert.min.js` 与 `yamls/` 等构建产物。

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
https://cdn.jsdelivr.net/gh/Lumintian/override-rules/yamls/config_gt-0_ipv6-0_full-1_keepalive-0_fakeip-0_quic-0_tun-0.yaml
```

固定版本：

```text
https://cdn.jsdelivr.net/gh/Lumintian/override-rules@vX.Y.Z/yamls/config_gt-0_ipv6-0_full-1_keepalive-0_fakeip-0_quic-0_tun-0.yaml
```

> [!NOTE]
> 静态 YAML 是使用虚拟节点集生成的，无法完全根据实际订阅进行动态分组。需要动态节点识别时请使用 JavaScript 覆写。

## 开发

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
