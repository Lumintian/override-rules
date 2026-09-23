# Sub-Store 节点预处理

本目录维护与 Mihomo 覆写配套的两个节点操作：`rename` 负责单个来源的规范化、地区/类别排序和编号；`sort` 负责多个来源合并后的地区/来源/类别排序。两个入口与 `convert` 共享 [`shared/preferences.ts`](../../shared/preferences.ts) 的地区和类别偏好；来源前缀只在合并后的 `sort` / `convert` 阶段参与排序。

完整的算法约定、可配置权重与边界见 [节点排序与命名约定](../../docs/NODE_ORDERING.md)。

## 源码与构建

| 操作 | 源码 | 构建产物 |
| --- | --- | --- |
| 重命名 | `scripts/substore/rename.ts` | `dist/rename.js`、`dist/rename.min.js` |
| 合并后排序 | `scripts/substore/sort.ts` | `dist/sort.js`、`dist/sort.min.js` |
| 配置覆写 | `src/main.ts` | `dist/convert.js`、`dist/convert.min.js` |

```bash
npm run build
```

不要直接修改构建产物。发布工作流会将产物写到 `dist` 分支；功能分支的源码提交不会自动更新已发布的 `@dist` 脚本。

## 单一来源

在 Sub-Store 的节点处理流程中添加脚本操作，先重命名，后进行配置覆写：

```text
原始订阅 → rename.min.js → convert.min.js → Mihomo 配置
```

发布版本的重命名脚本地址：

```text
https://cdn.jsdelivr.net/gh/Lumintian/override-rules@dist/rename.min.js#flag&blgd&bl&nm&clear
```

这组参数保留倍率与常见线路标签，清除明确的信息节点，并将无法识别地区的节点保留在最后。单来源的地区/类别排序默认执行，不再需要 `blpx`。

## 重命名处理顺序

`rename` 一次只处理一个来源，不从原节点名推断服务商，也不把 `|` 当作来源分隔符。处理顺序为：

```text
完整原名称 → 过滤 → 地区/倍率识别 → 标签与 chain → 显式 name 前缀 → 地区/类别排序 → 编号 → 引用改写
```

来源前缀只来自 `name` 参数。详细边界与编号规则见 [节点排序与命名约定](../../docs/NODE_ORDERING.md#rename规范化单来源排序独立编号)。

## 多个来源

各来源分别使用不同的 `name` 前缀，推荐包含明确的竖线分隔：

```text
rename.min.js#name=机场A%20%7C&flag&blgd&bl&nm&clear
rename.min.js#name=机场B%20%7C&flag&blgd&bl&nm&clear
```

合并后如果要直接导出 provider，或需要先查看规范化后的全局顺序，在节点操作末尾追加：

```text
https://cdn.jsdelivr.net/gh/Lumintian/override-rules@dist/sort.min.js
```

`sort` 只调整数组顺序，不重复编号、不删除节点、不改连接字段。若合并后的集合会立即交给 `convert.min.js`，convert 本身会执行同样的全局排序，无须为了覆写结果额外运行 `sort`。不要用再次运行 `rename` 来代替合并后的纯排序。

如果之前隐藏了倍率或线路标签，`sort` 无法在序列化后的名字中恢复这些信息；多来源排序推荐保留 `bl&blgd`。

## 保存参数预设

当 `blkey`、中文前缀或多来源参数使脚本 URL 过长时，可以使用 Secret Gist 保存可读的参数预设，再由包装脚本调用本项目发布的 `rename.min.js`。这样无需反复编辑 URL 编码后的长参数串，也可以在同一个 Gist 中维护多套配置。

完整模板、Sub-Store 链接格式、缓存方式和安全边界见 [使用 Gist 保存 Sub-Store 重命名预设](./GIST_PRESETS.md)。

## 重命名参数

| 参数 | 作用 |
| --- | --- |
| `in=zh/en/flag/quan` | 指定原节点名地区格式；不传时自动识别 |
| `out=zh/en/flag/quan` | 指定输出地区格式；默认中文 |
| `flag` | 在名称前添加国旗；纯国旗输出不重复添加 |
| `blgd` | 保留常见线路标签；家宽规范为 `Fam`，多个标签可以同时保留 |
| `bl` | 保留数值倍率；1 与 1.0 都不显示倍率标签 |
| `blkey=A+B>C` | 保留关键词，也可按规则替换；多个命中分别保留。`中转` 与 `中转A..Z` 按完整中转标签精确匹配，互不误命中 |
| `nx` | 仅保留倍率为 1 或未标倍率的节点 |
| `blnx` | 仅保留明确倍率大于 1 的节点 |
| `nm` | 保留无法识别地区的节点并置底；未开启则移除 |
| `one` | 某个完整 baseName 只有一个节点时省略 01 |
| `name=名称` | 显式添加来源前缀；多来源推荐 `name=机场A%20%7C`。未传时不会从原节点名推断或保留来源前缀 |
| `nf` | 将 name 前缀放在国旗之前，不改变排序身份 |
| `fgf=` | 名称字段分隔符，默认空格 |
| `sn=` | baseName 与序号的分隔符，默认空格 |
| `clear` | 清理套餐、到期、剩余流量、官网等明确的信息节点 |
| `chain` | 按原名称或 `blkey` 输出标签中的“中转”或“中转A..Z”写入 `dialer-proxy: 前置代理` 或对应字母组；同一名称出现多个不同中转标签、标签映射冲突或已有不同引用时明确报错 |
| `blpx` | 已无须传入；新排序始终执行，此参数不再控制排序 |
| `blockquic=on/off` | 显式设置 block-quic；不传时保留原字段 |

rename 阶段按“地区 → 类别”逐层成块，同层级保持源顺序；多个来源合并后，sort / convert 再按“地区 → 显式来源前缀 → 类别”排序。类别默认是普通 1 倍 / 未标倍率、特殊标签、高倍率、低倍率。

编号按完整 baseName 独立计数，例如 `香港 01`、`香港 02` 与 `香港 0.2× 01`。这是显示序号，不是永久节点标识。

## 为动态 provider 保留链路身份

rename 与 override 共同使用 [`shared/chain_tags.ts`](../../shared/chain_tags.ts) 定义的 `中转 / 中转A…Z` → `前置代理 / 前置代理A…Z` 映射。标签标记需要前置代理的落地节点，不是前置候选。

`chain` 根据原始名或替换标签设置 `dialer-proxy`，**不自动保留最终名称的标签**。如果输出要作为动态 provider 来源，必须同时保留对应 `blkey`：

```text
rename.min.js#chain&blkey=中转+中转A+中转B
```

按实际链路补齐到 Z；不要将标签替换为其他词，也不要用空编号分隔符把 `中转A` 拼成 `中转A01`。最终标签应无内部空格，字母使用半角；默认空格分隔符适用。override 会校验快照最终名称与拨号属性的一致性，运行时使用相同标签动态分组，而不依赖易变的编号。

保证每次 provider 更新仍从同一预处理流程输出；只在生成主配置时修改快照名称不会影响 Mihomo 后续下载。更新边界及混合模式见 [provider 链式代理](../../docs/CONFIGURATION.md#provider-链式代理)。

## 上游基线与许可证

重命名实现及地区名称数据从以下版本开始独立维护：

- 上游仓库：<https://github.com/FengNinger/substore_rename_rule>
- 初始文件：<https://github.com/FengNinger/substore_rename_rule/blob/63f7a3c63374db789234ea0828bc89ea1640a3db/rename.js>
- 初始提交：`63f7a3c63374db789234ea0828bc89ea1640a3db`
- 上游作者及版权：Copyright © 2025 FengNinger
- 许可证：MIT，完整文本见 [`LICENSE`](./LICENSE)

上游仅作为来源与历史基线；本项目不承诺持续原样同步，其实现、参数及输出约定可能独立变化。
