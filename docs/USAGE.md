# 使用场景与行为说明

本页集中说明节点预处理、链式代理、特殊策略组、DNS、QUIC、其他客户端和预生成 YAML。动态覆写参数见 [JavaScript 动态覆写参数](./CONFIGURATION.md)。

## 推荐处理流程

推荐在 Sub-Store 中先规范化节点名称，再执行 Mihomo 配置覆写：

```text
原始订阅 → rename.min.js → 规范化节点名称 → convert.min.js → Mihomo 配置
```

重命名脚本是节点操作，不是 Mihomo 配置覆写。脚本地址、参数和多来源排序方式见 [Sub-Store 节点预处理](../scripts/substore/README.md)。参数较长时可使用 [Gist 重命名预设](../scripts/substore/GIST_PRESETS.md)。

## 链式代理

落地节点可以直接携带 `dialer-proxy: "前置代理"`，也可以由改名脚本的 `chain` 参数根据原始名称写入。带字母标签的节点会形成独立链路：

```text
美国落地 中转A → dialer-proxy: 前置代理A → 生成「前置代理A」和「落地节点A」
德国落地 中转B → dialer-proxy: 前置代理B → 生成「前置代理B」和「落地节点B」
```

覆写脚本只为实际存在的链路生成成对策略组。不同服务可以分别选择「落地节点A」「落地节点B」，从而同时使用不同的落地线路。

可以通过地区参数限制各前置组的入口候选：

```text
convert.min.js#front_a=hk,sg,jp&front_b=uk,de,fr
```

没有配置 `front_a` 等参数时，该前置组使用全部非落地节点；指定地区当前无节点时仍保留 `DIRECT`，避免生成空组。只有落地节点、没有任何非落地节点时不会激活链式模式。

![新增的代理组](../img/dialer-group.png) ![如何配置自建节点](../img/dialer-example.png)

## 特殊策略组

### 静态资源

`静态资源` 组主要承载常见 CDN、对象存储、图片、视频、字体、JavaScript、CSS 等静态资源流量。大部分静态资源域名不设置严格的登录风控或鉴权，可以使用带宽更大、延迟更低但出口 IP 质量一般的节点。

如果订阅中存在低倍率、大带宽节点，可以将静态资源分流到这类节点以降低流量成本。相关思路参考：[我有特别的 Surge 配置和使用技巧](https://blog.skk.moe/post/i-have-my-unique-surge-setup/)。

脚本不再单独识别或生成 `低倍率节点` 策略组；原始节点仍保留。达到 `threshold` 的地区通过对应地区组使用，未生成基础地区组的节点仍可通过 `手动选择` 使用。

Google Play 的国内 CDN 修复和 Steam 国内 CDN / P2P 下载分流已经作为默认规则生效，不再生成独立的“修复”策略组。

### 漏网之鱼

`漏网之鱼` 是规则列表末尾的 `MATCH` 兜底组。广告、静态资源、各服务分流、GFW 列表和国内直连都没有命中时，流量会进入这里。

组内只有 `选择代理` 和 `DIRECT`：默认继续使用当前选择的代理，也可以切换为直连。它不是空组，只是大部分流量已经被前面的规则匹配。

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

不要直接将节点命名为 `Tailscale`，否则可能与策略组名称冲突。

## DNS

脚本默认生成自己的 DNS 配置，并支持：

- Fake-IP / RedirHost
- IPv6
- Fake-IP Filter
- 从上游配置继承部分 DNS Policy

默认开启 Fake-IP。需要使用 RedirHost 时显式传入：

```text
convert.min.js#fakeip=false
```

不同客户端，尤其 OpenClash、Clash Party 等，可能额外接管 DNS、TUN 或域名嗅探配置。排查 DNS 行为时，应同时确认客户端是否进行了二次覆盖。

关于 DNS 泄露测试的常见误解见[《关于 DNS 泄露及其相关误解的说明》](https://blog.l3zc.com/2026/05/dns-leak-misunderstanding/)。

## QUIC

默认阻止 UDP 443，避免部分节点 UDP 质量较差时影响访问体验。如果确定节点 UDP / QUIC 质量正常，可以开启：

```text
convert.min.js#quic=true
```

## 其他客户端

### Clash Party / Sparkle

可以使用动态 JavaScript 覆写：

```text
https://cdn.jsdelivr.net/gh/Lumintian/override-rules@dist/convert.min.js
```

部分客户端不支持向脚本传递参数；需要参数化配置时优先使用 Sub-Store。同时应检查客户端是否额外接管 DNS、SNI 或域名嗅探配置。

### Clash Verge 系

不能直接执行 JavaScript 覆写时，可以使用 Release 或 `dist` 分支生成的 YAML 配置。不过静态 YAML 不能根据真实订阅节点生成最精确的策略组，因此仍优先推荐 Sub-Store 动态覆写。

## 预生成 YAML

源码主分支不跟踪 `dist/` 下的构建产物。发布时 GitHub Actions 会：

1. 构建 JavaScript 覆写。
2. 生成 YAML 组合。
3. 推送到 `dist` 分支。
4. 生成对应版本的 Release 与 `vX.Y.Z` 产物标签。

源码发布标签使用：

```text
src-vX.Y.Z
```

生成产物标签使用：

```text
vX.Y.Z
```

YAML 文件命名格式：

```text
config_gt-{0|1|2}_ipv6-{0|1}_full-{0|1}_keepalive-{0|1}_fakeip-{0|1}_quic-{0|1}_tun-{0|1}.yaml
```

最新发布产物示例：

```text
https://cdn.jsdelivr.net/gh/Lumintian/override-rules@dist/yamls/config_gt-0_ipv6-0_full-1_keepalive-0_fakeip-0_quic-0_tun-0.yaml
```

固定版本示例：

```text
https://cdn.jsdelivr.net/gh/Lumintian/override-rules@vX.Y.Z/yamls/config_gt-0_ipv6-0_full-1_keepalive-0_fakeip-0_quic-0_tun-0.yaml
```

> [!NOTE]
> 静态 YAML 使用虚拟节点集生成，无法完全根据实际订阅进行动态分组。需要动态节点识别时请使用 JavaScript 覆写。
