/*!
 * override-rules 的 Sub-Store 节点重命名脚本
 *
 * Based on: https://github.com/FengNinger/substore_rename_rule
 * Baseline: https://github.com/FengNinger/substore_rename_rule/blob/63f7a3c63374db789234ea0828bc89ea1640a3db/rename.js
 * Copyright (c) 2025 FengNinger
 * SPDX-License-Identifier: MIT
 *
 * 本项目基于上述版本独立维护此派生脚本，后续实现可能与上游不同。
 * 完整 MIT 许可证及来源说明见 scripts/substore/LICENSE 与 README.md。
 */

import { classifyNode, hasSpecialTag, numberNodes, orderNodes, readMultiplier } from "../../shared/node_order";
import { rewriteDialerReferences } from "../../shared/node_references";
import type { NodeOrderMeta } from "../../shared/node_order";
import { FG, findRegion, regionNames, splitPrefix } from "../../shared/regions";
import type { NameFormat } from "../../shared/regions";

/**
 * URL Fragment 参数仍使用原有名称，本次不整体改造参数体系。
 * in/out: cn(zh), us(en), quan, gq(flag); 未指定 in 时自动识别。
 * name/nf: 名称前缀 / 前缀放在国旗之前。已有 "提供商 | 地区" 的前缀会保留。
 * fgf/sn: 名称字段 / 编号分隔符，默认空格。
 * flag/one: 添加国旗 / 单个 baseName 不显示 01。
 * bl/blgd/blkey: 保留倍率 / 固定标签 / 自定义标签（+ 分隔，> 替换）。
 * nx/blnx: 仅保留 1x 或未标倍率 / 仅保留 >1x；倍率按数值判断。
 * clear/nm: 清理信息节点 / 保留无法识别地区的节点并置底。
 * blpx: 不再需要，排序默认执行；权重在 shared/preferences.ts 中统一配置。
 * blockquic: on/off 显式设置 block-quic；不传则保留节点现有字段。
 */
interface RenameArgs {
    [key: string]: string | boolean | undefined;
}

interface RenameProxy {
    name: string;
    "block-quic"?: string;
    [key: string]: unknown;
}

declare const $arguments: RenameArgs;

const formats: Record<string, NameFormat> = {
    cn: "cn", zh: "cn", us: "us", en: "us", quan: "quan", gq: "gq", flag: "gq",
};

// Only information markers: "备用", "测试" and "群岛" can be real node names.
const informationName = /剩余|已用|套餐|到期|有效期|下次重置|重置时间|官网|官址|官方网站|订阅地址|联系客服|工单|(?:^|\b)(?:USED|TOTAL|EXPIRE|EMAIL)(?:\b|$)|^流量\s*[:：]/i;
const keya = /港|Hong|HK|新加坡|SG|Singapore|日本|Japan|JP|美国|United States|US|韩|土耳其|TR|Turkey|Korea|KR|🇸🇬|🇭🇰|🇯🇵|🇺🇸|🇰🇷|🇹🇷/i;
const keyb = /(((1|2|3|4)\d)|(香港|Hong|HK) 0[5-9]|((新加坡|SG|Singapore|日本|Japan|JP|美国|United States|US|韩|土耳其|TR|Turkey|Korea|KR) 0[3-9]))/i;

// Preserve the existing alias coverage; replace directly to avoid stateful /g.test().
const aliases: Record<string, RegExp> = {
    GB: /UK/g,
    "B-G-P": /BGP/g,
    "Russia Moscow": /Moscow/g,
    "Korea Chuncheon": /Chuncheon|Seoul/g,
    "Hong Kong": /Hongkong|HONG KONG/gi,
    "United Kingdom London": /London|Great Britain/g,
    "Dubai United Arab Emirates": /United Arab Emirates/g,
    "Taiwan TW 台湾 🇹🇼": /(台|Tai\s?wan|TW).*?🇨🇳|🇨🇳.*?(台|Tai\s?wan|TW)/g,
    "United States": /USA|Los Angeles|San Jose|Silicon Valley|Michigan/g,
    澳大利亚: /澳洲|墨尔本|悉尼|土澳|(深|沪|呼|京|广|杭)澳/g,
    德国: /(深|沪|呼|京|广|杭)德(?!.*(I|线))|法兰克福|滬德/g,
    香港: /(深|沪|呼|京|广|杭)港(?!.*(I|线))/g,
    日本: /(深|沪|呼|京|广|杭|中|辽)日(?!.*(I|线))|东京|大坂/g,
    新加坡: /狮城|(深|沪|呼|京|广|杭)新/g,
    美国: /(深|沪|呼|京|广|杭)美|波特兰|芝加哥|哥伦布|纽约|硅谷|俄勒冈|西雅图|芝加哥/g,
    波斯尼亚和黑塞哥维那: /波黑共和国/g,
    印尼: /印度尼西亚|雅加达/g,
    印度: /孟买/g,
    阿联酋: /迪拜|阿拉伯联合酋长国/g,
    孟加拉国: /孟加拉/g,
    捷克: /捷克共和国/g,
    台湾: /新台|新北|台(?!.*线)/g,
    Taiwan: /Taipei/g,
    韩国: /春川|韩|首尔/g,
    Japan: /Tokyo|Osaka/g,
    英国: /伦敦/g,
    India: /Mumbai/g,
    Germany: /Frankfurt/g,
    Switzerland: /Zurich/g,
    俄罗斯: /莫斯科/g,
    土耳其: /伊斯坦布尔/g,
    泰国: /泰國|曼谷/g,
    法国: /巴黎/g,
    G: /\d\s?GB/gi,
    Esnc: /esnc/gi,
};

const fixedTags: Array<[RegExp, string]> = [
    [/\bIPLC\b/i, "IPLC"], [/\bIEPL\b/i, "IEPL"], [/核心|\bKern\b/i, "Kern"],
    [/边缘|\bEdge\b/i, "Edge"], [/高级|\bPro\b/i, "Pro"], [/标准|\bStd\b/i, "Std"], [/实验|\bExp\b/i, "Exp"],
    [/商宽|\bBiz\b/i, "Biz"], [/家宽|\bFam\b/i, "Fam"], [/游戏|\bgame\b/i, "Game"],
    [/购物|\bBuy\b/i, "Buy"], [/专线|\bZx\b/i, "Zx"], [/\bLB\b/, "LB"], [/cloudflare|\bCF\b/i, "CF"],
    [/\budp\b/i, "UDP"], [/\bgpt\b/i, "GPT"], [/\budpn\b/i, "UDPN"],
    [/自建|\bself\b/i, "自建"], [/落地|\blanding\b/i, "落地"],
];

function enabled(value: string | boolean | undefined): boolean {
    return value === true || value === "" || (typeof value === "string" && /^(true|1|on)$/i.test(value));
}

function text(value: string | boolean | undefined, fallback = ""): string {
    if (typeof value !== "string") return fallback;
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function customTags(name: string, expression: string): string[] {
    return expression.split("+").flatMap((rule) => {
        const [match, ...replacement] = rule.split(">");
        if (!match || !name.includes(match)) return [];
        return [replacement.length ? replacement.join(">") : match];
    }).filter(Boolean);
}

export function renameNodes(proxies: readonly RenameProxy[], args: RenameArgs = {}): RenameProxy[] {
    const separator = text(args.fgf, " ");
    const prefix = text(args.name);
    const readFormat = (value: string): NameFormat | undefined =>
        Object.prototype.hasOwnProperty.call(formats, value) ? formats[value] : undefined;
    const output = readFormat(text(args.out)) ?? "cn";
    const input = readFormat(text(args.in));
    const entries: Array<{ proxy: RenameProxy; meta: NodeOrderMeta; originalName: string }> = [];

    for (const original of proxies) {
        const split = splitPrefix(original.name);
        const rawName = split.body;
        const nodePrefix = prefix || (split.prefix ? `${split.prefix} |` : "");
        if (enabled(args.clear) && informationName.test(rawName)) continue;
        const multiplier = readMultiplier(rawName);
        if (enabled(args.nx) && multiplier !== null && multiplier !== 1) continue;
        if (enabled(args.blnx) && !(multiplier !== null && multiplier > 1)) continue;
        if (enabled(args.key) && !(keya.test(rawName) && /2|4|6|7/i.test(rawName))) continue;

        let normalized = rawName;
        for (const [replacement, regex] of Object.entries(aliases)) {
            normalized = normalized.replace(regex, () => replacement);
        }
        const region = findRegion(rawName, input) ?? findRegion(normalized, input);
        if (!region && !enabled(args.nm)) continue;

        // Sort metadata is captured before any display option can discard it.
        const meta: NodeOrderMeta = {
            country: region?.country ?? null,
            prefix: nodePrefix.replace(/[\s|]+$/g, ""),
            category: classifyNode(multiplier, hasSpecialTag(rawName)),
        };
        const proxy = { ...original };
        const blockQuic = text(args.blockquic);
        if (blockQuic === "on" || blockQuic === "off") proxy["block-quic"] = blockQuic;

        if (region) {
            const labels = customTags(rawName, text(args.blkey));
            if ((enabled(args.bl) || (enabled(args.blgd) && /ˣ/.test(rawName))) && multiplier !== null && multiplier !== 1) {
                labels.push(`${multiplier}×`);
            }
            if (enabled(args.blgd)) {
                labels.push(...fixedTags.filter(([regex]) => regex.test(rawName)).map(([, label]) => label));
            }
            const flag = enabled(args.flag) && output !== "gq" ? FG[region.regionIndex] : "";
            const leading = enabled(args.nf) ? [nodePrefix, flag] : [flag, nodePrefix];
            proxy.name = [...leading, regionNames[output][region.regionIndex], ...new Set(labels)]
                .filter(Boolean).join(separator);
        } else {
            proxy.name = [nodePrefix, rawName].filter(Boolean).join(separator);
        }
        entries.push({ proxy, meta, originalName: original.name });
    }

    let ordered = orderNodes(entries, ({ meta }) => meta);
    if (enabled(args.key)) {
        const numbered = numberNodes(ordered.map(({ proxy }) => proxy), text(args.sn, " "));
        ordered = ordered.filter((_, index) => !keyb.test(numbered[index].name));
    }
    const numbered = numberNodes(
        ordered.map(({ proxy }) => proxy), text(args.sn, " "), enabled(args.one)
    );
    return rewriteDialerReferences(
        proxies,
        ordered.map(({ originalName }, index) => ({ originalName, proxy: numbered[index] }))
    );
}

function operator(proxies: RenameProxy[]): RenameProxy[] {
    const args = typeof $arguments === "undefined" ? {} : $arguments;
    return renameNodes(proxies, args);
}

(globalThis as Record<string, unknown>).operator = operator;
