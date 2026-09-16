import { categoryWeights, countryWeights, prefixWeights } from "./preferences";
import type { NodeCategory } from "./preferences";

export interface NodeOrderMeta {
    country: string | null;
    prefix: string;
    category: NodeCategory;
}

export interface OrderPreferences {
    countries: Readonly<Record<string, number>>;
    prefixes: Readonly<Record<string, number>>;
    categories: Readonly<Record<NodeCategory, number>>;
}

const defaults: OrderPreferences = {
    countries: countryWeights,
    prefixes: prefixWeights,
    categories: categoryWeights,
};

/** Missing/invalid weights sort last. Never subtract Infinity from Infinity. */
function weight(weights: Readonly<Record<string, number>>, key: string): number {
    const value = Object.prototype.hasOwnProperty.call(weights, key) ? weights[key] : undefined;
    return typeof value === "number" && Number.isFinite(value) ? value : Infinity;
}

function compareWeight(a: number, b: number): number {
    return a === b ? 0 : a < b ? -1 : 1;
}

/** Group first, then sort whole blocks; equal weights must not interleave blocks. */
function orderedBlocks<T>(
    items: readonly T[],
    keyOf: (item: T) => string,
    weights: Readonly<Record<string, number>>
): T[][] {
    const groups = new Map<string, T[]>();
    for (const item of items) {
        const key = keyOf(item);
        const group = groups.get(key);
        if (group) group.push(item);
        else groups.set(key, [item]);
    }
    return [...groups.entries()]
        .map(([key, values], index) => ({ values, index, weight: weight(weights, key) }))
        .sort((a, b) => compareWeight(a.weight, b.weight) || a.index - b.index)
        .map(({ values }) => values);
}

export function orderCountries<T>(
    items: readonly T[],
    countryOf: (item: T) => string,
    weights: Readonly<Record<string, number>> = countryWeights
): T[] {
    return orderedBlocks(items, countryOf, weights).flat();
}

/**
 * Country -> prefix -> category -> original order. Describe each item exactly once.
 * Unknown countries are retained at the end in source order. No names are changed.
 */
export function orderNodes<T>(
    items: readonly T[],
    describe: (item: T) => NodeOrderMeta,
    preferences: OrderPreferences = defaults
): T[] {
    const known: Array<{ item: T; meta: NodeOrderMeta }> = [];
    const unknown: T[] = [];
    for (const item of items) {
        const meta = describe(item);
        if (meta.country === null) unknown.push(item);
        else known.push({ item, meta });
    }
    const ordered = orderedBlocks(known, ({ meta }) => meta.country!, preferences.countries)
        .flatMap((country) => orderedBlocks(country, ({ meta }) => meta.prefix, preferences.prefixes))
        .flatMap((prefix) =>
            orderedBlocks(prefix, ({ meta }) => meta.category, preferences.categories)
        )
        .flatMap((category) => category.map(({ item }) => item));
    return ordered.concat(unknown);
}

/** Read billing metadata before rendering. Missing is not the same as explicit 1x. */
export function readMultiplier(name: string): number | null {
    const match = name
        .normalize("NFKC")
        .match(
            /(?:^|[^A-Za-z0-9.+-])(?:(\d+(?:\.\d+)?)\s*(?:[x×]|倍)|(?:倍率\s*[:：=]?\s*|[x×]\s*)(\d+(?:\.\d+)?))(?=$|[^A-Za-z0-9.])/i
        );
    if (!match) return null;
    const value = Number(match[1] ?? match[2]);
    return Number.isFinite(value) && value >= 0 ? value : null;
}

export function hasSpecialTag(name: string): boolean {
    return /家宽|商宽|自建|落地|专线|游戏|实验|核心|边缘|高级|购物|(?:^|[^A-Za-z])(?:IPLC|IEPL|Fam|Biz|Self|Landing|Kern|Edge|Pro|Exp|Game|Buy|Zx|LB)(?=$|[^A-Za-z])/i.test(
        name
    );
}

/** Low multipliers take precedence over tags, but only inside its country/prefix block. */
export function classifyNode(multiplier: number | null, tagged: boolean): NodeCategory {
    if (multiplier !== null && multiplier < 1) return "low";
    if (tagged) return "tagged";
    if (multiplier !== null && multiplier > 1) return "high";
    return "standard";
}

/** Number exact final base names independently without regrouping the array. */
export function numberNodes<T extends { name: string }>(
    items: readonly T[],
    separator = " ",
    omitSingleton = false
): T[] {
    const totals = new Map<string, number>();
    const counters = new Map<string, number>();
    const names = new Set<string>();
    for (const item of items) totals.set(item.name, (totals.get(item.name) ?? 0) + 1);
    return items.map((item) => {
        const index = (counters.get(item.name) ?? 0) + 1;
        counters.set(item.name, index);
        const name =
            omitSingleton && totals.get(item.name) === 1
                ? item.name
                : `${item.name}${separator}${String(index).padStart(2, "0")}`;
        if (names.has(name)) {
            throw new Error(`[override-rules] Duplicate generated name: ${name}; change sn or name`);
        }
        names.add(name);
        return { ...item, name };
    });
}
