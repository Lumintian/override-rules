# 项目开发约定

修改前阅读 `docs/HOW_TO_CUSTOMISE.md`；涉及运行行为时同时查阅 `docs/CONFIGURATION.md`、`docs/USAGE.md`。以下约定优先于局部实现习惯。

## 把节点预处理与配置生成视为一条流水线

```text
订阅 → rename（名称与属性）→ sort（多来源排序）→ override（分组与引用）→ Mihomo
                           shared/ 定义跨阶段共同语义
```

**rename、sort 和 override 不是彼此独立的工具。** 节点名称中的地区、倍率、标签、前缀和编号，以及 `dialer-proxy` 等属性，共同构成阶段之间的数据契约。修改其中一端，必须检查下游识别、排序、组成员和引用是否仍然正确，并补充端到端测试，不能只证明单个函数能运行。

## 源码与执行边界

| 位置 | 职责 |
| --- | --- |
| `shared/` | 跨阶段的地区身份、命名、排序、节点引用与链路标签契约 |
| `scripts/substore/rename.ts`、`sort.ts` | 订阅节点预处理 |
| `src/main.ts` | 同步生成核心 `main()`；可选异步部署入口 `runMain()` |
| `src/proxy_providers.ts` | provider 合并、快照下载、内容及链路一致性校验 |
| `src/node_parser.ts`、`proxy_groups.ts`、`selectors.ts` | 分类、策略组及候选引用 |
| `scripts/preview/` | 离线结构预览，不等于 Sub-Store 或 Mihomo 实际运行 |
| `scripts/yaml_generator/` | 静态 YAML 组合生成 |

- 新增异步操作前验证实际脚本宿主会等待返回值及其可用 API，不假定浏览器 `fetch()` 存在。当前下载路径限定为已验证契约的 Sub-Store Node Mihomo 快捷脚本。
- 请求失败或内容不合法必须明确中止；设定超时、大小与解析限制，说明限制作用在哪一层。错误和日志不得泄露订阅 URL、token、header 凭据或响应正文。
