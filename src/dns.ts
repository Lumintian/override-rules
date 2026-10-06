import type { DnsConfig, DnsPolicyValue, SnifferConfig } from "./types";

/**
 * 默认的 Fake-IP 排除项：复用 GeoSite 通用分类，仅保留必要的设备兼容项。
 * 命中时返回真实 IP；是否直连或代理仍由路由规则决定。
 */
const FAKE_IP_FILTER = [
    "geosite:private",
    "geosite:connectivity-check",
    "geosite:category-ntp",
    "geosite:category-stun",
    "Mijia Cloud",
];

/**
 * 嗅探器配置。
 */
export const snifferConfig: SnifferConfig = {
    sniff: {
        TLS: {
            ports: [443, 8443],
        },
        HTTP: {
            ports: [80, 8080, 8880],
        },
        QUIC: {
            ports: [443, 8443],
        },
    },
    "override-destination": false,
    enable: true,
    "force-dns-mapping": true,
    "skip-domain": ["Mijia Cloud", "dlg.io.mi.com", "+.push.apple.com"],
};

/**
 * 构建 DNS 配置的输入参数类型。
 */
interface BuildDnsConfigInput {
    mode: "redir-host" | "fake-ip";
    ipv6Enabled: boolean;
    fakeIpFilter?: string[];
}

/** 支持从上游配置继承的 DNS Policy 字段。 */
const DNS_POLICY_FIELDS = ["nameserver-policy", "proxy-server-nameserver-policy"] as const;

/** 判断值是否为非数组对象。 */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 读取仅包含字符串的数组，过滤格式错误的上游字段。 */
function getStringList(value: unknown): string[] | undefined {
    return Array.isArray(value) && value.every((item) => typeof item === "string")
        ? value
        : undefined;
}

/** 合并两个字符串列表并移除重复值，保留当前配置的优先顺序。 */
function mergeStringLists(current: string[] | undefined, upstream: unknown): string[] | undefined {
    const upstreamList = getStringList(upstream);
    if (!current && !upstreamList) return undefined;

    return [...new Set([...(current ?? []), ...(upstreamList ?? [])])];
}

/** 合并 DNS Policy，仅保留 Mihomo 支持的字符串或字符串数组值。 */
function mergeDnsPolicies(
    current: Record<string, DnsPolicyValue> | undefined,
    upstream: unknown
): Record<string, DnsPolicyValue> | undefined {
    if (!isRecord(upstream)) return current;

    const upstreamPolicy: Record<string, DnsPolicyValue> = {};
    for (const [key, value] of Object.entries(upstream)) {
        if (typeof value === "string") {
            upstreamPolicy[key] = value;
        } else if (getStringList(value)) {
            upstreamPolicy[key] = value as string[];
        }
    }

    return { ...(current ?? {}), ...upstreamPolicy };
}

/** 仅合并允许继承的上游 DNS 字段，同时保留脚本控制字段的优先级。 */
function inheritDnsFields(generated: DnsConfig, upstream?: DnsConfig): DnsConfig {
    if (!isRecord(upstream)) return generated;

    const merged = { ...generated };

    for (const field of DNS_POLICY_FIELDS) {
        const policy = mergeDnsPolicies(merged[field], upstream[field]);
        if (policy) merged[field] = policy;
    }

    const fakeIpFilter = mergeStringLists(merged["fake-ip-filter"], upstream["fake-ip-filter"]);
    if (fakeIpFilter) merged["fake-ip-filter"] = fakeIpFilter;

    return merged;
}

/**
 * 构建 Clash DNS 配置对象。
 * @param {BuildDnsConfigInput} params - 构建参数
 * @param {('redir-host'|'fake-ip')} params.mode - DNS 增强模式
 * @param {boolean} params.ipv6Enabled - 是否启用 IPv6
 * @param {string[]=} params.fakeIpFilter - fake-ip 过滤域名列表（可选）
 * @returns {DnsConfig} DNS 配置对象
 */
function buildDnsConfig({ mode, ipv6Enabled, fakeIpFilter }: BuildDnsConfigInput): DnsConfig {
    const config: DnsConfig = {
        enable: true,
        ipv6: ipv6Enabled,
        "prefer-h3": false,
        "enhanced-mode": mode,
        nameserver: ["https://cloudflare-dns.com/dns-query", "https://dns.google/dns-query"],
        "respect-rules": true,
        "direct-nameserver": ["tls://223.5.5.5"],
        "direct-nameserver-follow-policy": true,
        "proxy-server-nameserver": ["tls://223.5.5.5"],
        "default-nameserver": ["tls://223.5.5.5"],
        "nameserver-policy": {
            "geosite:cn": ["https://doh.pub/dns-query", "https://dns.alidns.com/dns-query"],
        },
    };

    if (fakeIpFilter) {
        config["fake-ip-filter-mode"] = "blacklist";
        config["fake-ip-filter"] = fakeIpFilter;
    }

    return config;
}

/**
 * 构建 DNS 配置的输入参数类型（外部接口）。
 */
export interface BuildDnsInput {
    fakeIPEnabled: boolean;
    ipv6Enabled: boolean;
    /** 上游订阅提供的 DNS 配置，将按字段规则继承或融合。 */
    upstreamDns?: DnsConfig;
}

/**
 * 根据 fakeIP 和 IPv6 开关生成最终 DNS 配置。
 * @param {BuildDnsInput} params - 构建参数
 * @param {boolean} params.fakeIPEnabled - 是否启用 fake-ip 模式
 * @param {boolean} params.ipv6Enabled - 是否启用 IPv6
 * @param {DnsConfig} params.upstreamDns - 上游 DNS 配置（可选）
 * @returns {DnsConfig} DNS 配置对象
 */
export function buildDns({ fakeIPEnabled, ipv6Enabled, upstreamDns }: BuildDnsInput): DnsConfig {
    const generated = fakeIPEnabled
        ? buildDnsConfig({ mode: "fake-ip", ipv6Enabled, fakeIpFilter: FAKE_IP_FILTER })
        : buildDnsConfig({ mode: "redir-host", ipv6Enabled });

    return inheritDnsFields(generated, upstreamDns);
}
