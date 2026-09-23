/** Shared protocol between rename output, override classification and Mihomo runtime filters. */
export const FRONT_PROXY_PREFIX = "前置代理";
const TRANSIT_PREFIX = "中转";

/** Be liberal when reading upstream names; provider output must use runtime-compatible labels. */
export function canonicalTransitTag(value: string): string | null {
    const match = value.normalize("NFKC").match(/^中转\s*([A-Za-z])?$/i);
    return match ? `${TRANSIT_PREFIX}${(match[1] ?? "").toUpperCase()}` : null;
}

export function readTransitTags(name: string): string[] {
    return Array.from(
        name.normalize("NFKC").matchAll(/中转\s*([A-Za-z])?(?=$|[^A-Za-z0-9])/gi),
        (match) => `${TRANSIT_PREFIX}${(match[1] ?? "").toUpperCase()}`
    );
}

export function landingChainId(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const match = /^前置代理([A-Z])?$/.exec(value.trim());
    return match ? (match[1] ?? "") : null;
}

export function transitGroups(name: string): string[] {
    return readTransitTags(name).map(
        (tag) => `${FRONT_PROXY_PREFIX}${tag.slice(TRANSIT_PREFIX.length)}`
    );
}

/** No lookaround/backreferences: usable by both JavaScript and Mihomo (Go regexp).
 * Final labels are 中转 / 中转A..Z, without internal spaces or full-width letters.
 * The right boundary prevents bare 中转 from matching 中转A, and A from matching AB/A1.
 */
export const TRANSIT_PATTERN = "中转[A-Za-z]?(?:$|[^A-Za-z0-9])";

export function transitPattern(id: string): string {
    if (!/^[A-Z]?$/.test(id)) throw new Error("Invalid chain identifier");
    return `${TRANSIT_PREFIX}${id}(?:$|[^A-Za-z0-9])`;
}

const CHAIN_MATCHERS = ["", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].map((id) => ({
    id,
    regex: new RegExp(transitPattern(id), "i"),
}));

/** Compare the original-name parser, final-name runtime filters, and the actual dialer property. */
export function hasConsistentTransitIdentity(name: string, dialer: unknown): boolean {
    const tags = [...new Set(readTransitTags(name))];
    const ids = CHAIN_MATCHERS.filter(({ regex }) => regex.test(name)).map(({ id }) => id);
    if (dialer === undefined || dialer === "") return tags.length === 0 && ids.length === 0;
    const id = landingChainId(dialer);
    return (
        id !== null &&
        dialer === `${FRONT_PROXY_PREFIX}${id}` &&
        tags.length === 1 &&
        tags[0] === `${TRANSIT_PREFIX}${id}` &&
        ids.length === 1 &&
        ids[0] === id
    );
}
