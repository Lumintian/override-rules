import { parseDocument } from "yaml";
import type { ClashConfig, ProxyNode } from "../../src/types";
import { getProxyProviders } from "../../src/proxy_providers";
import type { InputFormat, PreviewRequest } from "./types";

export const MAX_INPUT_BYTES = 2 * 1024 * 1024;
export const MAX_NODES = 2000;
const BOOLEAN_RENAME_ARGS = new Set([
    "nx",
    "bl",
    "nf",
    "key",
    "blgd",
    "blpx",
    "blnx",
    "one",
    "debug",
    "clear",
    "flag",
    "nm",
]);

export function parseArguments(text: string, rename = false): Record<string, string | boolean> {
    if (text.length > 8192) throw new Error("参数过长，请限制在 8192 字符内。");
    const args: Record<string, string | boolean> = Object.create(null);
    for (const part of text.trim().replace(/^#/, "").split("&")) {
        if (!part) continue;
        const separator = part.indexOf("=");
        let key: string;
        let value: string;
        try {
            key = decodeURIComponent(separator < 0 ? part : part.slice(0, separator));
            // 不使用 URLSearchParams：blkey 的 + 是关键词分隔符，不是空格。
            value = decodeURIComponent(separator < 0 ? "true" : part.slice(separator + 1));
        } catch {
            throw new Error("参数包含无效的百分号编码。");
        }
        if (!/^[a-z][a-z0-9_]*$/i.test(key)) {
            throw new Error("参数名须以英文字母开头，只能包含字母、数字和下划线。");
        }
        if (rename && BOOLEAN_RENAME_ARGS.has(key)) {
            if (!["", "true", "false", "1", "0"].includes(value.toLowerCase())) {
                throw new Error(`${key} 需要布尔值 true/false 或 1/0。`);
            }
            args[key] = ["", "true", "1"].includes(value.toLowerCase());
        } else {
            args[key] = value;
        }
    }
    return args;
}

export function parseInput(
    content: string,
    format: InputFormat
): { config: ClashConfig; namesOnly: boolean } {
    if (Buffer.byteLength(content) > MAX_INPUT_BYTES) throw new Error("输入超过 2 MiB 限制。");
    const text = content.replace(/^\uFEFF/, "").trim();
    if (!text) throw new Error("请先输入节点名称或 Clash 配置。");
    if (/^\s*(?:<!doctype\s+html|<html\b)/i.test(text)) {
        throw new Error("输入是网页，不是节点名称或 Clash 配置。");
    }
    if (/^(?:ss|ssr|vmess|vless|trojan|hysteria2?|tuic):\/\//im.test(text)) {
        throw new Error("第一版不解析协议订阅，请使用节点名称文本或 Clash YAML/JSON。");
    }
    const isConfig =
        format === "clash" ||
        (format === "auto" &&
            (/^[{[]/.test(text) || /^\s*(?:["']?proxies["']?|proxy-providers)\s*:/m.test(text)));
    let config: ClashConfig;
    if (isConfig) {
        const doc = parseDocument(text);
        if (doc.errors.length)
            throw new Error(`Clash 配置解析失败（${doc.errors[0].code}），请检查 YAML/JSON 格式。`);
        let value: unknown;
        try {
            value = doc.toJS({ maxAliasCount: 20 });
        } catch {
            throw new Error("Clash 配置包含过多别名引用。");
        }
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            throw new Error("Clash 配置必须是对象。");
        }
        config = value as ClashConfig;
        const hasProviders = Object.keys(getProxyProviders(config)).length > 0;
        if (
            (config.proxies !== undefined && !Array.isArray(config.proxies)) ||
            (config.proxies === undefined && !hasProviders)
        ) {
            throw new Error("Clash 配置必须包含 proxies 数组或非空 proxy-providers。");
        }
        config.proxies ??= [];
    } else {
        config = {
            proxies: text
                .split(/\r?\n/)
                .map((name) => name.trim())
                .filter(Boolean)
                .map((name) => ({ name })),
        };
    }
    if (!config.proxies!.length && !Object.keys(getProxyProviders(config)).length) {
        throw new Error("未找到节点或 provider。");
    }
    if (config.proxies!.length > MAX_NODES) throw new Error(`预览最多支持 ${MAX_NODES} 个节点。`);
    for (const node of config.proxies!) {
        if (
            !node ||
            typeof node !== "object" ||
            typeof node.name !== "string" ||
            !node.name.trim()
        ) {
            throw new Error("每个节点都必须有非空的字符串 name。");
        }
        if (node.name.length > 512) throw new Error("单个节点名称不能超过 512 字符。");
    }
    // 只保留 JSON 数据，避免 YAML 特殊对象跨越执行边界。
    return { config: JSON.parse(JSON.stringify(config)) as ClashConfig, namesOnly: !isConfig };
}

export function validateRequest(value: unknown): PreviewRequest {
    if (!value || typeof value !== "object") throw new Error("请求格式无效。");
    const data = value as Partial<PreviewRequest>;
    if (
        typeof data.content !== "string" ||
        typeof data.rename !== "boolean" ||
        typeof data.renameArgs !== "string" ||
        typeof data.overrideArgs !== "string" ||
        !["auto", "names", "clash"].includes(data.format ?? "")
    ) {
        throw new Error("请提供完整的输入、格式和脚本参数。");
    }
    return data as PreviewRequest;
}

export function duplicateNames(nodes: ProxyNode[]): string[] {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const { name } of nodes) {
        if (seen.has(name)) duplicates.add(name);
        seen.add(name);
    }
    return [...duplicates];
}
