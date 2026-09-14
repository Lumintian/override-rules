# 贡献指南 (HOW TO CONTRIBUTE)

欢迎来到 `Lumintian/override-rules`！感谢你愿意为本项目贡献代码或新增特性。

本指南用于帮助开发者和 AI 助手快速熟悉项目的开发工作流；如需了解针对 AI Agent 的额外规范，也可参考 [`AGENTS.md`](../AGENTS.md)。

## 🎯 核心架构与原则

- **源文件驱动**：所有核心逻辑均采用 TypeScript 编写，存放在 `src/` 与 `scripts/yaml_generator/` 目录中。
  - `src/main.ts`：JS 动态覆写脚本的核心入口。
  - `scripts/yaml_generator/generator.ts`：YAML 静态覆写文件的生成逻辑。
- **禁止直接修改产物**：根目录下的 `convert.js`、`convert.min.js` 以及 `yamls/` 目录内容属于自动生成的构建产物，并由 GitHub Actions 在发布时处理。不要直接编辑这些产物文件，所有修改应从 `.ts` 源码开始。
- **构建工具链**：项目使用 `esbuild` 进行打包和压缩，通过 `scripts/build.mjs` 生成 JavaScript 覆写产物。

## 🛠️ 开发与构建工作流

在准备提交代码之前，建议按以下步骤验证：

1. 安装依赖：
   ```bash
   npm install
   ```

2. 修改源码。核心逻辑主要位于 `src/` 目录。

3. 格式化并检查代码：
   ```bash
   npm run format
   npm run lint:fix
   npm run typecheck
   ```

4. 构建并生成测试产物：
   - `npm run build`：运行 `scripts/build.mjs`，生成 `convert.js` 与 `convert.min.js`。
   - `npm run generate`：运行 YAML 生成器，更新本地 `yamls/` 目录。
   - `npm run artifacts`：依次执行构建与 YAML 生成。

建议在提交核心逻辑修改前运行 `npm run artifacts`，确认构建与生成过程没有报错。

## 📦 提交与 Pull Request 规范

1. **分离提交**：核心功能、文档和纯格式调整尽量按有意义的逻辑拆分。
2. **文档同步**：新增、删除或修改 URL 参数、策略组或 YAML 组合时，应同步修改 `README.md` 和相关文档。
3. **不要提交构建产物**：PR 中不要包含手工修改的 `convert.js`、`convert.min.js` 或 `yamls/` 文件。
4. **说明行为变化**：涉及节点分类、代理组选择、DNS、TUN 或规则行为变化时，请说明用户可观察到的影响。

## 🚀 发布流程

普通贡献者无需处理版本发布。

项目使用 `src-vX.Y.Z` 作为源码标签，由 GitHub Actions 生成 `dist` 分支、`vX.Y.Z` 产物标签和 GitHub Release。`.npmrc` 已设置 `tag-version-prefix=src-v`，因此项目维护者可以通过：

```bash
npm version patch
npm version minor
npm version major
```

更新版本并触发相应发布流程。

版本发布、强制更新 `dist` 分支及创建 GitHub Release 应由项目维护者执行。

---

如果你在开发中遇到问题，或对某项优化存在疑问，欢迎在 Issues 中讨论。
