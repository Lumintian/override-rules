# 使用 Gist 保存 Sub-Store 重命名预设

当 `rename.min.js` 的 Fragment 参数包含较长的 `blkey`、中文前缀或多套来源配置时，可以使用一个 Secret Gist 托管预设包装脚本。Sub-Store 只需引用 Gist 的 Raw 地址，不再需要维护经过 URL 编码的长参数串。

执行流程：

```text
Sub-Store → Gist 预设包装脚本 → rename.min.js → 重命名后的节点
```

包装脚本只保存个人参数；实际重命名仍由本项目发布的 `rename.min.js` 完成。

## 包装脚本

新建一个 Secret Gist，例如 `rename-preset.js`，粘贴以下内容。日常只需修改文件顶部的“预设”部分。

```javascript
/*
 * 只需要编辑这一部分
 */
const 默认预设 = "r";

const 预设 = {
    r: {
        说明: "自建-R",
        名称前缀: "自建-R |",
        输出格式: "中文",
        显示国旗: true,
        保留标签: ["Legend", "Zouter", "Dmit", "Azure", "V6", "中转A"],
        其他参数: {
            // bl: true,
            // blgd: true,
            // nm: true,
            // chain: true,
        },
    },

    landing: {
        说明: "落地节点",
        名称前缀: "落地 |",
        输出格式: "中文",
        显示国旗: true,
        保留标签: ["家宽", "落地", "中转"],
        其他参数: {
            blgd: true,
        },
    },
};

/*
 * 一般不需要修改以下部分
 */
const 上游脚本 =
    "https://cdn.jsdelivr.net/gh/Lumintian/override-rules@dist/rename.min.js";

async function operator(proxies = [], targetPlatform, context) {
    const 外部参数 = typeof $arguments === "undefined" ? {} : { ...$arguments };
    const 预设名称 = String(外部参数.preset || 默认预设);
    delete 外部参数.preset;

    const 当前预设 = 预设[预设名称];
    if (!当前预设) {
        throw new Error(
            `找不到重命名预设：${预设名称}；可用预设：${Object.keys(预设).join(", ")}`
        );
    }

    const 参数 = {
        ...(当前预设.其他参数 || {}),
        name: 当前预设.名称前缀 || "",
        out: 当前预设.输出格式 === "英文" ? "en" : "zh",
        flag: 当前预设.显示国旗 === true,
        blkey: (当前预设.保留标签 || []).join("+"),
        ...外部参数,
    };

    const response = await $substore.http.get({
        url: 上游脚本,
        timeout: 10000,
    });
    const statusCode = Number(response.statusCode || 0);
    const source = String(response.body || "");

    if (statusCode < 200 || statusCode >= 300) {
        throw new Error(`下载 rename.min.js 失败，HTTP ${statusCode}`);
    }
    if (!source.trim() || /^\s*</.test(source)) {
        throw new Error("rename.min.js 返回了空内容或 HTML 页面");
    }

    const wrapperOperator = globalThis.operator;
    let renameOperator;
    try {
        renameOperator = new Function(
            "$arguments",
            `${source}\nreturn globalThis.operator;`
        )(参数);
    } finally {
        globalThis.operator = wrapperOperator;
    }

    if (typeof renameOperator !== "function") {
        throw new Error("未能从 rename.min.js 获取 operator");
    }
    return await renameOperator(proxies, targetPlatform, context);
}

globalThis.operator = operator;
```

`保留标签` 使用数组书写，包装脚本会自动转换为 `blkey=A+B+C`。`其他参数` 可填写[重命名参数](./README.md#重命名参数)中的参数；URL 中临时传入的参数优先于 Gist 预设。

## 在 Sub-Store 中使用

使用不包含 Gist 版本哈希的 Raw 地址，以便编辑后始终读取最新内容：

```text
https://gist.githubusercontent.com/用户名/GIST_ID/raw/rename-preset.js#preset=r#noCache
```

切换另一套预设时只需修改短名称：

```text
https://gist.githubusercontent.com/用户名/GIST_ID/raw/rename-preset.js#preset=landing#noCache
```

如果只有一套配置，可以省略 `preset`，由 `默认预设` 决定：

```text
https://gist.githubusercontent.com/用户名/GIST_ID/raw/rename-preset.js#noCache
```

第一个 Fragment 保存包装脚本参数；第二个 `#noCache` 是 Sub-Store 的附加选项，用于避免继续使用旧的 Gist 脚本缓存。

## 更新与安全边界

- `@dist` 会跟随本项目最新发布产物。需要固定行为时，可将 `上游脚本` 改为版本地址，例如 `@vX.Y.Z/rename.min.js`。
- GitHub 的 Secret Gist 是“不在公开列表展示”，不是需要身份验证的私有存储。任何获得 Raw 地址的人都能读取内容。
- Gist 中只应保存名称前缀、标签和开关等非敏感设置；不要写入订阅地址、访问令牌、密码或其他凭据。
- 包装脚本会下载并执行 `上游脚本`。应只使用可信发布地址，不要替换为来源不明的脚本。
- GitHub 的 `/blob/` 地址返回 HTML 页面，不能作为脚本地址。应使用 Gist Raw、GitHub Raw 或 jsDelivr 地址。
