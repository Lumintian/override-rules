import { classifyNode, hasSpecialTag, orderNodes, readMultiplier } from "./node_order";
import type { NodeOrderMeta } from "./node_order";
import { findRegion, splitPrefix } from "./regions";

/** Boundary adapter for already-rendered names, never used by the sorting engine. */
export function describeName(name: string): NodeOrderMeta {
    const { prefix, body } = splitPrefix(name);
    const match = findRegion(body);
    if (!match) return { country: null, prefix, category: "standard" };
    const inferredPrefix = body.slice(0, match.index)
        .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "")
        .replace(/^[\s|_-]+|[\s|_-]+$/g, "");
    const labels = body.slice(match.index + match.text.length);
    return {
        country: match.country,
        prefix: prefix || inferredPrefix,
        category: classifyNode(readMultiplier(labels), hasSpecialTag(labels)),
    };
}

/** Safe to run after merging subscriptions: does not rename, number or mutate nodes. */
export function orderNamedNodes<T extends { name?: string }>(nodes: readonly T[]): T[] {
    return orderNodes(nodes, (node) => describeName(node.name ?? ""));
}
