# Mihomo / Sub-Store 覆写规则

![](img/cover.png)

[![](https://data.jsdelivr.com/v1/package/gh/Lumintian/override-rules/badge?style=rounded)](https://www.jsdelivr.com/package/gh/Lumintian/override-rules)

本仓库是面向 **Mihomo + Sub-Store** 的个人覆写规则集合，基于 [powerfullz/override-rules](https://github.com/powerfullz/override-rules) 二次维护，并根据节点管理、链式代理与策略组使用习惯持续调整。

> [!NOTE]
> 本仓库首先服务于个人使用场景，不保证兼容所有 Clash / Mihomo 客户端。目前主要围绕 Sub-Store + Mihomo 维护。

## 快速开始

普通配置按下面两步完成即可。如果希望节点订阅自行更新、同时使用前置代理，直接按本节的 [providerurl 与前置代理完整示例](#providerurl-与前置代理完整示例) 操作。

普通配置的处理顺序：

```text
原始订阅 → rename.min.js → 规范化节点名称 → convert.min.js → Mihomo 配置
```

### 1. 节点重命名

在节点操作中加入：

```text
https://cdn.jsdelivr.net/gh/Lumintian/override-rules@dist/rename.min.js#flag&blgd&bl&blkey=自建+落地&nm&chain
```

重命名脚本用于统一地区名称、国旗、序号、倍率和线路标签。它是节点预处理组件，不是 Mihomo 配置覆写脚本。完整参数和多来源用法见 [Sub-Store 节点预处理](scripts/substore/README.md)。

> [!Tip]
> 参数较长时，可以使用 [Gist 保存重命名预设](scripts/substore/GIST_PRESETS.md)，直接编辑中文前缀和标签数组，无需维护 URL 编码后的长参数串。

### 2. 配置覆写

在配置脚本操作中加入：

```text
https://cdn.jsdelivr.net/gh/Lumintian/override-rules@dist/convert.min.js
```

脚本支持通过 URL Fragment 传入参数：

```text
https://cdn.jsdelivr.net/gh/Lumintian/override-rules@dist/convert.min.js#grouptype=1&fakeip=true&us=2&sg=1
```

动态 JavaScript 覆写会读取真实订阅节点并生成策略组，因此比预生成 YAML 更适合本项目的主要使用方式。完整参数表、地区代码和生成规则见 [JavaScript 动态覆写参数](docs/CONFIGURATION.md)。

> [!TIP]
> 想让日常节点增删由 Mihomo 自行更新，而不是每次重载主配置，可以使用 `providerurl`。下面给出它与前置代理配合的完整流程；不需要链式代理时，省略中转标签、`chain` 和 `front_a` 即可。

### providerurl 与前置代理完整示例

**目标：香港/新加坡节点作为前置，美国自建节点作为最终出口；节点变化由 provider 更新。**

```text
你的设备 → 香港或新加坡的前置节点 → 美国自建落地节点 → 目标网站
```

本例使用 **Sub-Store Node / Docker 后端的 Mihomo 配置快捷脚本**，已验证后端 2.41.0。其他版本或执行入口先看[环境核查](docs/CONFIGURATION.md#环境与入口)。所用 rename / convert 也需包含本功能，修改源码不会自动更新已发布的 `@dist` 文件。

#### 1. 区分节点用途

保留真实连接信息，只按下表整理原始节点名称。若节点来自多个订阅，在各来源完成下面的 rename 后再合并导出一个链接；可能重名时给各来源加不同 `name` 前缀，见[多来源说明](scripts/substore/README.md#多个来源)。

| 原始节点名称示例 | 用途 | 要不要中转标签 |
| --- | --- | --- |
| `香港 线路1`、`香港 线路2` | 前置候选 | 不加 |
| `新加坡 线路1` | 前置候选 | 不加 |
| `美国 自建 落地 中转A` | 经 A 链路连接的最终出口 | 加 `中转A` |

**`中转A` 标记的是“需要前置代理的落地节点”** ； A 是链路编号，不是地区代码；同一条链路可以有多个落地节点。

#### 2. 在节点来源上执行 rename

用下面这条完整链接替换前文“节点重命名”环节的链接，在每个来源的节点处理流程中执行一次；组合订阅不再重复 rename，也不要把它放到主配置覆写操作中：

```text
https://cdn.jsdelivr.net/gh/Lumintian/override-rules@dist/rename.min.js#flag&blgd&bl&blkey=自建+落地+中转A&nm&chain
```

- `chain`：根据 `中转A` 设置 `dialer-proxy: 前置代理A`。
- `blkey=自建+落地+中转A`：让最终名称继续保留这些标签。**仅开启 `chain` 不够。**
- 先保留默认的空格分隔符，不要使用 `sn=` 将标签和编号拼成 `中转A01`。

检查改名后的美国节点，应包含下面两项；其余真实协议、服务器、端口和凭据字段仍须保留：

```yaml
name: 🇺🇸 美国 自建 落地 中转A 01
dialer-proxy: 前置代理A
```

名称前缀和序号可以不同，但 `中转A` 及其对应拨号属性不能丢失。香港、新加坡节点不应带中转标签或 `dialer-proxy`。

#### 3. 导出节点链接

将处理后的订阅/组合订阅导出为 **Mihomo / Clash.Meta YAML 节点订阅**，复制它的下载链接。这个来源只做节点预处理，不执行 convert。打开后应看到非空的 `proxies:` 数组，且名称和属性满足上面的要求；不能是 Base64、协议 URI 列表或只有 `proxy-providers` 的配置。

后面把这个地址填入 `providerurl`。它必须让 **Sub-Store 和 Mihomo 两端都能访问**；新建 provider 默认直连下载。

这时需要区分两个地址：

| 地址 | 用在哪里 |
| --- | --- |
| **节点订阅链接**：rename 之后、convert 之前的导出结果 | 填入 `providerurl`，供 Mihomo 更新节点 |
| **主配置链接**：下一步运行 convert 后的结果 | 导入 Mihomo 客户端 |

不要让 `providerurl` 指回主配置链接，否则会把生成流程绕回自身。

#### 4. 用空模板生成主配置

另建用于主配置生成的 Mihomo 配置，将传给覆写脚本的基础内容设为：

```yaml
proxies: []
```

不要再把节点链接中的同一批节点导入这个模板，否则它们会同时出现在显式 `proxies` 和 provider 中。需要 Tailscale 时，可单独把 Tailscale 节点放在这个模板的 `proxies` 中。

在本机 Node.js 或可信的本地 JavaScript 控制台运行下面代码，**只将 `subscription` 替换为刚导出的节点链接**，然后把输出的完整 URL 填入主配置的快捷脚本操作。下面的地址只是示例，不是实际 Sub-Store API 路径；这段辅助代码本身也不是快捷脚本。

```javascript
const subscription = "https://sub.example.com/nodes.yaml?token=EXAMPLE&target=ClashMeta";
const script = "https://cdn.jsdelivr.net/gh/Lumintian/override-rules@dist/convert.min.js";
console.log(
    `${script}#providerurl=${encodeURIComponent(subscription)}&providerinterval=3600&front_a=hk,sg&grouptype=1`
);
```

不用手动处理订阅 URL 内的 `&`；`encodeURIComponent` 会对整个参数值编码一次。不要使用在线编码网站处理带密钥的链接，编码不是加密。

这组参数的含义：每小时更新节点；A 链路只从香港、新加坡选前置；普通地区组采用测速类型。`grouptype=1` **不会**把 `前置代理A` 变成测速组，它仍是手动选择。若直接启动裸 Mihomo 内核而非由客户端管理端口，可再追加 `&full=true`，见[参数表](docs/CONFIGURATION.md#参数表)。

#### 5. 加载并检查结果

把生成的**主配置**导入客户端后：

1. 在 `前置代理A` 中选择一个香港或新加坡节点。
2. 在 `落地节点A` 中选择美国自建节点。
3. 在 `选择代理`（或某个服务分流组）中选择 `落地节点A`，**不是**直接选择 `前置代理A`。

确认生成的配置里有 `proxy-providers`，而 `proxies` 仍为空（除非你另加了显式节点）。`前置代理A` 不应包含任何中转节点；`落地节点A` 应只包含 A 链路落地节点。新加坡只有一个节点时，即使未生成独立地区组，也不影响它进入前置候选。

> [!WARNING]
> 如果前置组没有候选，Mihomo 会回退为 `COMPATIBLE`（直连），不是阻断连接。使用前先检查候选和真实出口；生成成功不代表节点已连通。

以后同一链路内增删节点、改变序号，由 provider 更新即可。新增 `中转B` 等链路、修改 `front_a` 或重算地区组时，仍需重新生成并加载主配置。若客户端还在频繁自动更新主配置，它仍会触发重载；请把日常节点刷新交给 provider，按需更新主配置。

遇到问题先看[快速排错](docs/CONFIGURATION.md#快速排错)；多链路、已有 provider 和其他边界见 [provider 参数说明](docs/CONFIGURATION.md#节点订阅-provider-与生成时快照)。

## 文档导航

| 文档 | 内容 |
| --- | --- |
| [动态覆写参数](docs/CONFIGURATION.md) | 参数速查、provider 更新规则、快速排错和前置地区映射 |
| [使用场景与行为说明](docs/USAGE.md) | 链式代理、特殊策略组、DNS、QUIC、其他客户端和静态 YAML |
| [Sub-Store 节点预处理](scripts/substore/README.md) | `rename`、`sort`、多来源流程和重命名参数 |
| [Gist 重命名预设](scripts/substore/GIST_PRESETS.md) | 使用可读配置替代过长的重命名脚本 URL |
| [节点排序与命名约定](docs/NODE_ORDERING.md) | 地区、前缀、类别、编号和引用改写规则 |
| [本地开发预览](docs/PREVIEW.md) | 预览器使用方法、输入限制和隐私边界 |
| [自定义专属覆写](docs/HOW_TO_CUSTOMISE.md) | Fork 后修改参数、代理组和分流规则 |
| [贡献指南](docs/HOW_TO_CONTRIBUTE.md) | 开发、验证、提交和发布约定 |
| [架构说明](docs/ARCHITECTURE.md) | 数据流、模块职责和设计决策 |

## 开发

核心源码：

```text
src/                         Mihomo 动态覆写
shared/                      节点排序、地区及引用共享逻辑
scripts/substore/            Sub-Store 重命名与排序
scripts/yaml_generator/      静态 YAML 生成器
scripts/preview/             本地预览器
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

打开 `npm run preview` 启动的 **http://127.0.0.1:8787**，可以直接预览当前源码的节点改名和配置覆写结果。开发工作流和定制方式见[贡献指南](docs/HOW_TO_CONTRIBUTE.md)与[自定义专属覆写](docs/HOW_TO_CUSTOMISE.md)。

> [!IMPORTANT]
> `dist/` 下的 JavaScript 和 YAML 均为自动生成产物。功能修改必须从 TypeScript 源码开始，不要直接编辑或向主分支提交构建产物。

## 发布产物

发布工作流会将 JavaScript、YAML 和清单推送到 `dist` 分支，并创建对应版本的 Release。动态脚本推荐使用 `@dist` 获取最新发布产物；需要固定行为时使用 `@vX.Y.Z`。

静态 YAML 的文件命名和使用限制见[预生成 YAML](docs/USAGE.md#预生成-yaml)。

## 上游与许可证

本项目基于 [powerfullz/override-rules](https://github.com/powerfullz/override-rules) 修改，并继续使用 MIT License。

仓库中的部分规则、图标与数据来自其他开源项目，其版权与许可证归各自项目所有。感谢原项目以及相关规则维护者的工作。
