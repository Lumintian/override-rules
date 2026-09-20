import { countriesMeta } from "./constants";
import { parseBool, parseNumber } from "./utils";
import type { FeatureFlags, GroupType, ScriptArgs } from "./types";

/**
 * 解析 grouptype 参数。
 * - `grouptype=0`：select
 * - `grouptype=1`：url-test
 * - `grouptype=2`：load-balance
 * - 未指定或非法值时默认使用 1（url-test）
 * @param args - 从外部脚本环境传入的原始参数对象
 * @returns 解析后的代理组类型
 */
function parseGroupType(args: ScriptArgs): GroupType {
    const raw = parseNumber(args.grouptype, 1);
    if (raw === 0 || raw === 1 || raw === 2) return raw;
    return 1;
}

// 防止错误参数生成过多策略组；超出范围的值视为未启用。
const MAX_EXTRA_GROUPS_PER_COUNTRY = 100;
const countryNameByCode: ReadonlyMap<string, string> = new Map(
    Object.entries(countriesMeta).map(([country, meta]) => [meta.code, country])
);

function parseExtraGroupCount(value: unknown): number {
    if (typeof value !== "string" && typeof value !== "number") return 0;
    const text = String(value).trim();
    if (!/^\d+$/.test(text)) return 0;
    const count = Number(text);
    return Number.isSafeInteger(count) && count <= MAX_EXTRA_GROUPS_PER_COUNTRY ? count : 0;
}

function parseFrontCountryNames(args: ScriptArgs): Record<string, string[]> {
    const mappings: Record<string, string[]> = Object.create(null);
    for (const [rawKey, rawValue] of Object.entries(args)) {
        const key = rawKey.toLowerCase();
        const match = key === "front" ? [key, ""] : /^front_([a-z])$/.exec(key);
        if (!match) continue;
        if (typeof rawValue !== "string") {
            throw new Error(`[override-rules] ${rawKey} 必须是逗号分隔的地区代码`);
        }
        const chainId = match[1].toUpperCase();
        const countryNames: string[] = [];
        for (const token of rawValue.split(",").map((item) => item.trim().toLowerCase())) {
            if (!token) continue;
            const country = countryNameByCode.get(token);
            if (!country) {
                throw new Error(`[override-rules] ${rawKey} 包含不支持的地区代码：${token}`);
            }
            if (!countryNames.includes(country)) countryNames.push(country);
        }
        mappings[chainId] = countryNames;
    }
    return mappings;
}

/**
 * 解析传入的脚本参数，并将其转换为内部使用的功能开关（feature flags）。
 * @param args - 从外部脚本环境（如 Substore）传入的原始参数对象
 * @returns 经过解析和类型转换后的功能开关集合 `FeatureFlags`
 */
export function buildFeatureFlags(args: ScriptArgs): FeatureFlags {
    return {
        groupType: parseGroupType(args),
        ipv6Enabled: parseBool(args.ipv6),
        fullConfig: parseBool(args.full),
        keepAliveEnabled: parseBool(args.keepalive),
        fakeIPEnabled: parseBool(args.fakeip, true),
        quicEnabled: parseBool(args.quic),
        regexFilter: parseBool(args.regex),
        tunEnabled: parseBool(args.tun),
        countryThreshold: parseNumber(args.threshold, 2),
        countryExtraCounts: Object.fromEntries(
            Object.entries(countriesMeta).map(([country, meta]) => [
                country,
                parseExtraGroupCount(args[meta.code]),
            ])
        ),
        frontCountryNamesByChain: parseFrontCountryNames(args),
    };
}
