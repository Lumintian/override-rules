# Sub-Store 节点重命名脚本

该目录包含本项目维护的 **Sub-Store 节点预处理组件**。它以 FengNinger 的重命名脚本为初始基础，并将根据本项目的地区识别、倍率、家宽、自建和落地节点约定独立演进。

```text
原始订阅 → rename.min.js → 规范化节点名称 → convert.min.js → Mihomo 配置
```

重命名脚本与 Mihomo 覆写脚本是两个独立执行阶段，但在同一项目中维护并使用相同版本发布，避免命名输出与策略组识别规则逐渐失配。

## 源码与构建产物

- 项目源码：`scripts/substore/rename.ts`
- 本地构建产物：`dist/rename.js`、`dist/rename.min.js`
- 发布位置：`dist` 分支根目录

执行以下命令可同时构建 Mihomo 覆写脚本和节点重命名脚本：

```bash
npm run build
```

不要直接修改生成的 `dist/rename.js` 或 `dist/rename.min.js`；功能调整应在 `rename.ts` 中进行。

## 使用

在 Sub-Store 的节点处理流程中添加“脚本操作”，使用发布后的压缩版本：

```text
https://cdn.jsdelivr.net/gh/Lumintian/override-rules@dist/rename.min.js
```

推荐从以下参数组合开始：

```text
https://cdn.jsdelivr.net/gh/Lumintian/override-rules@dist/rename.min.js#flag&blgd&bl&blkey=自建+落地&nm
```

该组合使用默认中文地区名，在名称前添加国旗，保留常见线路标签、倍率以及`自建`、`落地`标记，并保留无法识别地区的节点。

常用参数：

| 参数 | 作用 |
| --- | --- |
| `in=zh/en/flag/quan` | 指定原节点名的地区格式；不传时自动识别 |
| `out=zh/en/flag/quan` | 指定输出地区格式；默认中文 |
| `flag` | 在节点名称前添加国旗 |
| `blgd` | 保留并规范常见倍率、`IPLC`、`IEPL`、家宽、游戏等标签；中文“家宽”会规范为 `Fam` |
| `bl` | 从原名称中提取并保留倍率 |
| `blkey=A+B>C` | 保留指定关键词，也可将关键词替换为新名称 |
| `nm` | 保留无法识别地区的节点；默认会移除这些节点 |
| `one` | 单一节点地区不显示 `01` 序号 |
| `name=名称` | 添加自定义名称前缀 |
| `nf` | 将 `name=` 指定的前缀放在最前面 |
| `fgf=` | 设置名称字段之间的分隔符；默认空格 |
| `sn=` | 设置地区与序号之间的分隔符；默认空格 |
| `clear` | 移除套餐、到期、流量等信息类节点 |
| `blpx` | 按保留的倍率或线路标签进行分组排序，需要配合保留参数 |
| `blockquic=on/off` | 设置节点的 `block-quic` 字段 |

若使用 `in=flag`，不要在本脚本之前执行会移除或重复添加国旗的节点操作。

## 上游基线与许可证

本项目从以下版本开始独立维护：

- 上游仓库：<https://github.com/FengNinger/substore_rename_rule>
- 初始文件：<https://github.com/FengNinger/substore_rename_rule/blob/63f7a3c63374db789234ea0828bc89ea1640a3db/rename.js>
- 初始提交：[`63f7a3c63374db789234ea0828bc89ea1640a3db`](https://github.com/FengNinger/substore_rename_rule/commit/63f7a3c63374db789234ea0828bc89ea1640a3db)
- 上游作者及版权：Copyright © 2025 FengNinger
- 许可证：MIT，完整文本见 [`LICENSE`](./LICENSE)

上游仅作为来源与历史基线；本项目不会承诺持续原样同步，其实现、参数及输出约定可能独立变化。
