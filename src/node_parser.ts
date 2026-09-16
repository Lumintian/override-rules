import { countriesMeta } from "./constants";
import type { ProxyNode } from "./types";
import { describeName } from "../shared/display_name";
import { classifyNode, hasSpecialTag, orderCountries, orderNodes, readMultiplier } from "../shared/node_order";
import type { NodeOrderMeta } from "../shared/node_order";
import { splitPrefix } from "../shared/regions";

const COUNTRY_MATCHERS = Object.entries(countriesMeta).map(([country, meta]) => ({
    country,
    regex: new RegExp(meta.pattern.replace(/^\(\?i\)/, ""), "i"),
    exclude: meta.excludePattern ? new RegExp(meta.excludePattern, "i") : null,
}));

/** Parse canonical names first; preserve the override's existing city/airport aliases. */
export function describeProxyNode(node: ProxyNode): NodeOrderMeta {
    const meta = describeName(node.name || "");
    // The inherited renamer catalogue uses 马来; the group registry uses 马来西亚.
    if (meta.country === "马来") return { ...meta, country: "马来西亚" };
    if (meta.country !== null) return meta;

    const { prefix, body } = splitPrefix(node.name || "");
    for (const { country, regex, exclude } of COUNTRY_MATCHERS) {
        const match = regex.exec(body);
        if (!match || exclude?.test(body)) continue;
        const inferredPrefix = body.slice(0, match.index)
            .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "")
            .replace(/^[\s|_-]+|[\s|_-]+$/g, "");
        const labels = body.slice(match.index + match[0].length);
        return {
            country,
            prefix: prefix || inferredPrefix,
            category: classifyNode(readMultiplier(labels), hasSpecialTag(labels)),
        };
    }
    return meta;
}

/** Sort only: retain node identity, connection fields and final names. */
export function sortProxyNodes(nodes: readonly ProxyNode[]): ProxyNode[] {
    return orderNodes(nodes, describeProxyNode);
}

export function parseTailscale(nodes: ProxyNode[]): ProxyNode[] {
    return (nodes || []).filter((proxy) => proxy.type === "tailscale");
}

/** Existing chain semantics: nodes dialing through 前置代理 belong to the landing list. */
export function parseNodesByLanding(nodes: ProxyNode[]): {
    landingNodes: ProxyNode[];
    nonLandingNodes: ProxyNode[];
} {
    const landingNodes: ProxyNode[] = [];
    const nonLandingNodes: ProxyNode[] = [];
    for (const node of nodes || []) {
        if (!node.name) continue;
        if (node["dialer-proxy"] === "前置代理") landingNodes.push(node);
        else nonLandingNodes.push(node);
    }
    return { landingNodes, nonLandingNodes };
}

/** Only registered countries generate groups; other known regions still sort correctly. */
export function parseCountries(nodes: ProxyNode[]): Record<string, ProxyNode[]> {
    const countryNodes: Record<string, ProxyNode[]> = Object.create(null);
    for (const node of nodes) {
        const { country } = describeProxyNode(node);
        if (country === null || !Object.prototype.hasOwnProperty.call(countriesMeta, country)) continue;
        (countryNodes[country] ??= []).push(node);
    }
    return countryNodes;
}

export function getActiveCountryNames(
    countryNodes: Record<string, ProxyNode[]>,
    minCount: number
): string[] {
    const names = Object.entries(countryNodes)
        .filter(([, nodes]) => nodes.length >= minCount)
        .map(([country]) => country);
    return orderCountries(names, (country) => country);
}
