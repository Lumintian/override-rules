/*!
 * override-rules: sort a merged Sub-Store collection without renaming its nodes.
 * SPDX-License-Identifier: MIT
 * Region data attribution: see shared/regions.ts and scripts/substore/LICENSE.
 */
import { orderNamedNodes } from "../../shared/display_name";

interface NamedProxy {
    name: string;
    [key: string]: unknown;
}

/** Place this after merging individually renamed subscriptions, before provider export. */
export function operator(proxies: NamedProxy[]): NamedProxy[] {
    return orderNamedNodes(proxies);
}

(globalThis as Record<string, unknown>).operator = operator;
