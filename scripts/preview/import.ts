import { lookup } from "node:dns";
import { get as httpGet } from "node:http";
import { get as httpsGet } from "node:https";
import { BlockList, isIP } from "node:net";
import type { LookupFunction } from "node:net";
import { MAX_INPUT_BYTES } from "./input";

const blocked = new BlockList();
for (const [address, prefix] of [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
] as const)
    blocked.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [
    ["::", 128],
    ["::1", 128],
    ["fc00::", 7],
    ["fe80::", 10],
    ["ff00::", 8],
] as const)
    blocked.addSubnet(address, prefix, "ipv6");

export function isPublicAddress(address: string): boolean {
    const family = isIP(address);
    return family !== 0 && !blocked.check(address, family === 4 ? "ipv4" : "ipv6");
}

export function validateImportUrl(value: string): URL {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new Error("请输入有效的 HTTP(S) 链接。");
    }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
        throw new Error("仅支持不含用户名/密码的 HTTP(S) 链接。");
    }
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    if (
        /^(localhost|.*\.localhost|.*\.local)$/i.test(hostname) ||
        (isIP(hostname) && !isPublicAddress(hostname))
    ) {
        throw new Error("为避免读取本机或内网资源，链接仅允许公网地址。内网配置请直接粘贴。");
    }
    url.hash = "";
    return url;
}

// 校验解析结果，并把该结果直接交给连接使用，避免校验与连接之间再次 DNS 解析。
const publicLookup: LookupFunction = (hostname, options, callback) => {
    lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
        if (
            error ||
            !addresses.length ||
            addresses.some(({ address }) => !isPublicAddress(address))
        ) {
            callback(new Error("DNS_ADDRESS_BLOCKED"), "", 4);
        } else if (options.all) {
            callback(null, addresses);
        } else {
            callback(null, addresses[0].address, addresses[0].family);
        }
    });
};

export async function importContent(value: string): Promise<string> {
    let url = validateImportUrl(value);
    const signal = AbortSignal.timeout(10_000);
    for (let redirects = 0; redirects <= 3; redirects += 1) {
        const response = await new Promise<import("node:http").IncomingMessage>(
            (resolve, reject) => {
                const request = (url.protocol === "https:" ? httpsGet : httpGet)(
                    url,
                    {
                        signal,
                        lookup: publicLookup,
                        headers: {
                            accept: "text/plain, application/yaml, application/json, */*",
                            "accept-encoding": "identity",
                            "user-agent": "override-rules-preview",
                        },
                    },
                    resolve
                );
                request.on("error", (error) =>
                    reject(
                        new Error(
                            error.message === "DNS_ADDRESS_BLOCKED"
                                ? "域名无法解析或指向非公网地址。请检查运行预览服务那台机器的 DNS，或直接粘贴配置。"
                                : "链接读取失败或超过 10 秒，请检查地址、网络和证书。"
                        )
                    )
                );
            }
        );
        const status = response.statusCode ?? 0;
        if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
            response.destroy();
            url = validateImportUrl(new URL(response.headers.location, url).href);
            continue;
        }
        if (status < 200 || status >= 300) {
            response.destroy();
            throw new Error(`链接返回 HTTP ${status}，请确认它直接返回节点文本或 Clash 配置。`);
        }
        if (/text\/html/i.test(response.headers["content-type"] ?? "")) {
            response.destroy();
            throw new Error("链接返回网页，请使用文本或 Clash 配置的原始链接。");
        }
        if (
            response.headers["content-encoding"] &&
            response.headers["content-encoding"] !== "identity"
        ) {
            response.destroy();
            throw new Error("链接未按请求返回未压缩文本，请下载解压后粘贴配置。");
        }
        const chunks: Buffer[] = [];
        let size = 0;
        try {
            for await (const chunk of response) {
                const buffer = Buffer.from(chunk);
                size += buffer.length;
                if (size > MAX_INPUT_BYTES) throw new Error("链接内容超过 2 MiB 限制。");
                chunks.push(buffer);
            }
        } catch {
            response.destroy();
            throw new Error(
                size > MAX_INPUT_BYTES ? "链接内容超过 2 MiB 限制。" : "链接读取中断或超时。"
            );
        }
        return Buffer.concat(chunks).toString("utf8");
    }
    throw new Error("链接重定向超过 3 次，请使用最终的原始链接。");
}
