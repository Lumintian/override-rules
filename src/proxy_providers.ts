import { SPEEDTEST_URL } from "./constants";
import { hasConsistentTransitIdentity } from "../shared/chain_tags";
import type { ClashConfig, ProxyNode, ProxyProvider, ScriptArgs } from "./types";

export const SNAPSHOT_MAX_BYTES = 2 * 1024 * 1024;
export const SNAPSHOT_MAX_NODES = 2000;
export const SNAPSHOT_TIMEOUT_MS = 10000;

function fail(message: string): never {
    // Never include subscription URLs, response bodies, or transport/parser errors.
    throw new Error(`[override-rules] ${message}`);
}

export function getProxyProviders(config: ClashConfig): Record<string, ProxyProvider> {
    const providers = config["proxy-providers"];
    if (providers === undefined) return {};
    if (!providers || typeof providers !== "object" || Array.isArray(providers)) {
        fail("proxy-providers 必须是 provider 定义映射。");
    }
    for (const [name, provider] of Object.entries(providers)) {
        if (
            !name.trim() ||
            !provider ||
            typeof provider !== "object" ||
            !["http", "file", "inline"].includes(provider.type) ||
            (provider.type === "http" && (typeof provider.url !== "string" || !provider.url)) ||
            (provider.type === "file" && (typeof provider.path !== "string" || !provider.path)) ||
            (provider.type === "inline" && !Array.isArray(provider.payload))
        ) {
            fail("proxy-providers 包含无效定义，请检查 type、url、path 或 payload。");
        }
    }
    return providers;
}

function normalizePath(path: string): string {
    const parts: string[] = [];
    for (const part of path.replace(/\\/g, "/").split("/")) {
        if (!part || part === ".") continue;
        if (part === ".." && parts.length && parts.at(-1) !== "..") parts.pop();
        else parts.push(part);
    }
    return parts.join("/");
}

/** Plan before downloading; no URL decoding here: Sub-Store has already decoded the fragment. */
export function prepareProvider(config: ClashConfig, args: ScriptArgs): ClashConfig {
    if (config.proxies !== undefined && !Array.isArray(config.proxies)) {
        fail("proxies 必须是数组或省略，未下载快照。");
    }
    let url: URL;
    try {
        url = new URL(args.providerurl!);
    } catch {
        fail("providerurl 必须是完整的 HTTP(S) 订阅 URL，参数值需使用 encodeURIComponent 编码。");
    }
    if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.hash ||
        /[\s\u0000-\u001f\u007f]/.test(args.providerurl!)
    ) {
        fail("providerurl 仅支持不含用户名、密码、Fragment 或空白的 HTTP(S) URL。");
    }
    const interval = args.providerinterval === undefined ? 3600 : Number(args.providerinterval);
    if (!Number.isSafeInteger(interval) || interval < 60 || interval > 604800) {
        fail("providerinterval 必须是 60–604800 秒的整数。");
    }
    const providers = getProxyProviders(config);
    // Reusing the same URL avoids subscribing to the same source twice. Do not change user options.
    const existing = Object.values(providers).find(
        (provider) => provider.type === "http" && provider.url === args.providerurl
    );
    if (existing) {
        if (
            ["filter", "exclude-filter", "exclude-type", "override"].some(
                (key) => existing[key] !== undefined
            )
        ) {
            fail(
                "与 providerurl 同源的已有 provider 含过滤或 override；暂不支持其快照统计，请移除 providerurl 或使用未变换的来源。"
            );
        }
        return config;
    }
    const paths = Object.values(providers)
        .map((provider) => provider.path)
        .filter((path): path is string => typeof path === "string")
        .map(normalizePath);
    // Mihomo's working directory is unknown here. Treat absolute-path suffixes conservatively.
    const pathTaken = (path: string) =>
        paths.some(
            (used) => used === normalizePath(path) || used.endsWith(`/${normalizePath(path)}`)
        );
    let name = "override-provider";
    let path = `./proxy_providers/${name}.yaml`;
    for (let suffix = 2; Object.hasOwn(providers, name) || pathTaken(path); suffix++) {
        name = `override-provider-${suffix}`;
        path = `./proxy_providers/${name}.yaml`;
    }
    return {
        ...config,
        "proxy-providers": {
            ...providers,
            [name]: {
                type: "http",
                url: args.providerurl,
                path,
                interval,
                // Avoid downloading the subscription through a group that depends on this provider.
                proxy: "DIRECT",
                header: { "User-Agent": ["clash.meta"] },
                "health-check": { enable: true, url: SPEEDTEST_URL, interval: 300 },
            },
        },
    };
}

/** Reuse the selected provider's request headers so authenticated sources see the same request. */
export function snapshotHeaders(config: ClashConfig, url: string): Record<string, string> {
    const provider = Object.values(getProxyProviders(config)).find(
        (item) => item.type === "http" && item.url === url
    )!;
    const headers: Record<string, string> = Object.create(null);
    if (provider.header !== undefined) {
        if (
            !provider.header ||
            typeof provider.header !== "object" ||
            Array.isArray(provider.header)
        ) {
            fail("快照 provider 的 header 必须是映射。");
        }
        for (const [key, values] of Object.entries(provider.header)) {
            if (!Array.isArray(values) || values.length !== 1 || typeof values[0] !== "string") {
                fail("快照暂仅支持每个 header 为单个字符串的数组。");
            }
            headers[key] = values[0];
        }
    }
    if (!Object.keys(headers).some((key) => key.toLowerCase() === "user-agent")) {
        headers["User-Agent"] = "clash.meta";
    }
    return headers;
}

export interface SnapshotRuntime {
    get(options: { url: string; timeout: number; headers: Record<string, string> }): Promise<{
        statusCode: number;
        body: unknown;
    }>;
    parseYaml(text: string): unknown;
    byteLength(text: string): number;
}

/** Only Mihomo-compatible YAML/JSON { proxies: [...] }; never URI/Base64 conversion. */
export async function downloadSnapshot(
    url: string,
    runtime: SnapshotRuntime,
    headers: Record<string, string> = { "User-Agent": "clash.meta" }
): Promise<ProxyNode[]> {
    let response: Awaited<ReturnType<SnapshotRuntime["get"]>>;
    try {
        response = await runtime.get({
            url,
            timeout: SNAPSHOT_TIMEOUT_MS,
            headers,
        });
    } catch {
        fail("订阅快照下载失败或超时（10 秒），未生成配置；请检查订阅地址和网络。");
    }
    if (response.statusCode !== 200) fail("订阅快照 HTTP 状态不是 200，未生成配置。");
    if (typeof response.body !== "string" || response.body.length === 0) {
        fail("订阅快照为空或不是文本，未生成配置。");
    }
    if (
        response.body.length > SNAPSHOT_MAX_BYTES ||
        runtime.byteLength(response.body) > SNAPSHOT_MAX_BYTES
    ) {
        fail("订阅快照超过 2 MiB，未生成配置。");
    }
    if (!response.body.trim()) fail("订阅快照为空，未生成配置。");
    let value: unknown;
    try {
        value = runtime.parseYaml(response.body);
    } catch {
        fail("订阅快照 YAML/JSON 不合法或别名过多，未生成配置。");
    }
    const nodes = (value as ClashConfig | null)?.proxies;
    if (!Array.isArray(nodes) || !nodes.length || nodes.length > SNAPSHOT_MAX_NODES) {
        fail("订阅快照必须包含 1–2000 个节点的 proxies 数组；不支持网页、URI 或 Base64 订阅。");
    }
    const names = new Set<string>();
    for (const node of nodes) {
        if (node?.type === "tailscale") {
            fail("provider 快照暂不支持 Tailscale；请改用显式 proxies。");
        }
        if (
            !node ||
            typeof node !== "object" ||
            typeof node.name !== "string" ||
            !node.name.trim() ||
            node.name.length > 512 ||
            typeof node.type !== "string" ||
            !node.type.trim() ||
            typeof node.server !== "string" ||
            !node.server.trim() ||
            !Number.isInteger(node.port) ||
            node.port! < 1 ||
            node.port! > 65535 ||
            names.has(node.name)
        ) {
            fail("订阅快照节点缺少有效 name/type/server/port、名称过长或重名，未生成配置。");
        }
        names.add(node.name);
    }
    validateSnapshotChains(nodes);
    return nodes;
}

/** Snapshots and future provider updates must keep the same rename/override identity contract. */
export function validateSnapshotChains(nodes: ProxyNode[]): void {
    if (nodes.some((node) => !hasConsistentTransitIdentity(node.name, node["dialer-proxy"]))) {
        fail(
            "快照链路标签与 dialer-proxy 不一致：最终名称须保留规范的中转/中转A..Z 标签，并对应前置代理/前置代理A..Z；请检查 rename 的 chain、blkey 和分隔符。暂不支持其他拨号目标。"
        );
    }
}

// These APIs are injected by Sub-Store's Node Mihomo shortcut runner, not browser fetch.
declare const $substore: {
    env: { isNode?: boolean };
    http: { get: SnapshotRuntime["get"] };
};
declare const ProxyUtils: {
    yaml: { safeLoad(text: string, options: { maxAliasCount: number }): unknown };
};

export function subStoreRuntime(): SnapshotRuntime {
    if (
        typeof $substore === "undefined" ||
        !$substore.env?.isNode ||
        typeof $substore.http?.get !== "function" ||
        typeof ProxyUtils === "undefined" ||
        typeof ProxyUtils.yaml?.safeLoad !== "function" ||
        typeof Buffer === "undefined"
    ) {
        fail(
            "providerurl 需要支持异步 main 的 Sub-Store Node Mihomo 快捷脚本及 HTTP/YAML API；此环境不可下载快照。"
        );
    }
    return {
        get: (options) => $substore.http.get(options),
        parseYaml: (text) => ProxyUtils.yaml.safeLoad(text, { maxAliasCount: 20 }),
        byteLength: (text) => Buffer.byteLength(text, "utf8"),
    };
}
