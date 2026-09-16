/** Names outside this input collection may refer to strategy groups; leave them alone. */
export function rewriteDialerReferences<T extends { name: string; [key: string]: unknown }>(
    original: readonly { name: string }[],
    renamed: readonly { originalName: string; proxy: T }[]
): T[] {
    const counts = new Map<string, number>();
    for (const node of original) counts.set(node.name, (counts.get(node.name) ?? 0) + 1);
    const names = new Map(renamed.map(({ originalName, proxy }) => [originalName, proxy.name]));

    return renamed.map(({ proxy }) => {
        const target = proxy["dialer-proxy"];
        if (typeof target !== "string" || !counts.has(target)) return proxy;
        if (counts.get(target) !== 1) {
            throw new Error(`[override-rules] Ambiguous dialer-proxy target: ${target}`);
        }
        const name = names.get(target);
        if (name === undefined) {
            throw new Error(`[override-rules] Filter removed dialer-proxy target: ${target}`);
        }
        return { ...proxy, "dialer-proxy": name };
    });
}
