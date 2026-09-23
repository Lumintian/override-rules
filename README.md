# Mihomo / Sub-Store 覆写规则

![](img/cover.png)

[![](https://data.jsdelivr.com/v1/package/gh/Lumintian/override-rules/badge?style=rounded)](https://www.jsdelivr.com/package/gh/Lumintian/override-rules)

本仓库是面向 **Mihomo + Sub-Store** 的个人覆写规则集合，基于 [powerfullz/override-rules](https://github.com/powerfullz/override-rules) 二次维护，并根据节点管理、链式代理与策略组使用习惯持续调整。

主要特点：

- 集成 [SukkaW/Surge](https://github.com/SukkaW/Surge)、[217heidai/adblockfilters](https://github.com/217heidai/adblockfilters) 等规则源。
- 使用 GeoSite、GeoIP 及自定义 Rule Provider 进行细粒度分流。
- 自动识别订阅中的国家或地区节点，只生成实际存在的地区策略组。
- 支持 `select`、`url-test`、`load-balance` 三种基础地区策略组，并可按地区添加额外手动组。
- 支持多条链式代理、Tailscale、Fake-IP、TUN、IPv6 和 QUIC 参数化配置。
- 提供与覆写规则配套的 Sub-Store 节点重命名及多来源排序脚本。

> [!NOTE]
> 本仓库首先服务于个人使用场景，不保证兼容所有 Clash / Mihomo 客户端。目前主要围绕 Sub-Store + Mihomo 维护。

## 快速开始

推荐在 Sub-Store 中按以下顺序处理：

```text
原始订阅 → rename.min.js → 规范化节点名称 → convert.min.js → Mihomo 配置
```

### 1. 节点重命名

在节点操作中加入：

```text
https://cdn.jsdelivr.net/gh/Lumintian/override-rules@dist/rename.min.js#flag&blgd&bl&blkey=自建+落地&nm&chain
```

重命名脚本用于统一地区名称、国旗、序号、倍率和线路标签。它是节点预处理组件，不是 Mihomo 配置覆写脚本。完整参数和多来源用法见 [Sub-Store 节点预处理](scripts/substore/README.md)。

参数较长时，可以使用 [Gist 保存重命名预设](scripts/substore/GIST_PRESETS.md)，直接编辑中文前缀和标签数组，无需维护 URL 编码后的长参数串。

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

仅使用节点 provider 时，可在支持异步入口的 **Sub-Store Node / Docker Mihomo 快捷脚本**中设置 `providerurl`：生成时下载快照决定组结构，运行时由 Mihomo provider 更新节点，快照不会写入输出 `proxies`。编码方式、已验证版本和功能降级见 [provider 使用说明](docs/CONFIGURATION.md#节点订阅-provider-与生成时快照)。

## 文档导航

| 文档 | 内容 |
| --- | --- |
| [动态覆写参数](docs/CONFIGURATION.md) | `convert.min.js` 参数、额外地区组和前置地区映射 |
| [使用场景与行为说明](docs/USAGE.md) | 链式代理、特殊策略组、DNS、QUIC、其他客户端和静态 YAML |
| [Sub-Store 节点预处理](scripts/substore/README.md) | `rename`、`sort`、多来源流程和重命名参数 |
| [Gist 重命名预设](scripts/substore/GIST_PRESETS.md) | 使用可读配置替代过长的重命名脚本 URL |
| [节点排序与命名约定](docs/NODE_ORDERING.md) | 地区、前缀、类别、编号和引用改写规则 |
| [本地开发预览](docs/PREVIEW.md) | 预览器使用方法、输入限制和隐私边界 |
| [自定义专属覆写](docs/HOW_TO_CUSTOMISE.md) | Fork 后修改参数、代理组和分流规则 |
| [贡献指南](docs/HOW_TO_CONTRIBUTE.md) | 开发、验证、提交和发布约定 |
| [架构说明](docs/ARCHITECTURE.md) | 数据流、模块职责和设计决策 |

## 常用示例

测速类型的基础地区组，并添加两个美国额外组和一个新加坡额外组：

```text
convert.min.js#grouptype=1&us=2&sg=1
```

使用 RedirHost、IPv6 和 TUN：

```text
convert.min.js#fakeip=false&ipv6=true&tun=true
```

为不同落地链路限制前置地区：

```text
convert.min.js#front_a=hk,sg,jp&front_b=uk,de,fr
```

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
