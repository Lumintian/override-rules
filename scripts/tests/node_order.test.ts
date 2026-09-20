import assert from "node:assert/strict";
import { test } from "node:test";
import {
    classifyNode,
    hasSpecialTag,
    numberNodes,
    orderCountries,
    orderNodes,
    readMultiplier,
} from "../../shared/node_order";
import { categoryWeights } from "../../shared/preferences";
import type { NodeOrderMeta } from "../../shared/node_order";

function node(id: string, country: string | null, prefix = "", category = "standard") {
    return { id, country, prefix, category } as NodeOrderMeta & { id: string };
}

const ids = (items: Array<{ id: string }>) => items.map(({ id }) => id);

test("country, prefix and category form stable blocks even with equal weights", () => {
    const input = [
        node("a-low", "香港", "A", "low"),
        node("jp", "日本"),
        node("b-high", "香港", "B", "high"),
        node("a-std-1", "香港", "A"),
        node("sg", "新加坡"),
        node("a-std-2", "香港", "A"),
        node("b-std", "香港", "B"),
    ];
    const original = structuredClone(input);
    assert.deepEqual(ids(orderNodes(input, (item) => item)), [
        "a-std-1",
        "a-std-2",
        "a-low",
        "b-std",
        "b-high",
        "sg",
        "jp",
    ]);
    assert.deepEqual(input, original);
    const equal = {
        countries: { 香港: 1, 新加坡: 1, 日本: 1 },
        prefixes: {},
        categories: categoryWeights,
    };
    assert.deepEqual(ids(orderNodes(input, (item) => item, equal)), [
        "a-std-1",
        "a-std-2",
        "a-low",
        "b-std",
        "b-high",
        "jp",
        "sg",
    ]);
});

test("equal category weights still keep categories together", () => {
    const input = [
        node("l1", "香港", "A", "low"),
        node("s", "香港", "A"),
        node("l2", "香港", "A", "low"),
    ];
    assert.deepEqual(
        ids(
            orderNodes(input, (n) => n, {
                countries: {},
                prefixes: {},
                categories: { standard: 1, tagged: 1, high: 1, low: 1 },
            })
        ),
        ["l1", "l2", "s"]
    );
});

test("prefix preferences are optional and never outrank countries", () => {
    const input = [
        node("a-hk", "香港", "A"),
        node("b-sg", "新加坡", "B"),
        node("b-hk", "香港", "B"),
    ];
    assert.deepEqual(
        ids(
            orderNodes(input, (n) => n, {
                countries: { 香港: 10, 新加坡: 20 },
                prefixes: { B: 1 },
                categories: categoryWeights,
            })
        ),
        ["b-hk", "a-hk", "b-sg"]
    );
});

test("unweighted countries form blocks; unknown nodes stay last in source order", () => {
    const input = [
        node("u1", null, "B", "low"),
        node("vn1", "越南"),
        node("de", "德国"),
        node("fi", "芬兰"),
        node("vn2", "越南"),
        node("u2", null, "A"),
    ];
    assert.deepEqual(ids(orderNodes(input, (n) => n)), ["de", "vn1", "vn2", "fi", "u1", "u2"]);
    assert.deepEqual(
        orderCountries(["越南", "香港", "新加坡", "越南", "芬兰"], (x) => x),
        ["香港", "新加坡", "越南", "越南", "芬兰"]
    );
});

test("prototype-like prefix names are safe and metadata is evaluated once", () => {
    const input = [
        node("a", "香港", "__proto__"),
        node("b", "香港", "constructor"),
        node("c", "香港", "__proto__"),
    ];
    let calls = 0;
    assert.deepEqual(
        ids(
            orderNodes(input, (n) => {
                calls++;
                return n;
            })
        ),
        ["a", "c", "b"]
    );
    assert.equal(calls, input.length);
    assert.deepEqual(
        orderNodes([], (n: NodeOrderMeta) => n),
        []
    );
});

test("billing multipliers are parsed numerically without matching node IDs", () => {
    for (const [name, expected] of [
        ["香港 0.2x", 0.2],
        ["日本 x0.5", 0.5],
        ["US 1.0×", 1],
        ["香港 10.25倍", 10.25],
        ["香港 ˣ²", 2],
        ["香港 ˣ¹⁰", 10],
        ["香港 倍率:0.1", 0.1],
        ["香港 0×", 0],
        ["香港 01", null],
        ["香港 -0.2x", null],
        ["香港 1.2.3x", null],
        ["香港 NaNx", null],
        ["Proxy 02", null],
    ] as const)
        assert.equal(readMultiplier(name), expected, name);
});

test("low multiplier wins over special tags; tags do not match provider substrings", () => {
    assert.equal(classifyNode(0.2, true), "low");
    assert.equal(classifyNode(1, true), "tagged");
    assert.equal(classifyNode(2, false), "high");
    assert.equal(classifyNode(null, false), "standard");
    assert.equal(hasSpecialTag("香港 IPLC"), true);
    assert.equal(hasSpecialTag("香港 家宽"), true);
    assert.equal(hasSpecialTag("Provider Standard"), false);
});

test("exact base names have independent counters; numbering does not reorder", () => {
    const input = [{ name: "香港" }, { name: "香港 0.2×" }, { name: "香港" }];
    assert.deepEqual(
        numberNodes(input).map((n) => n.name),
        ["香港 01", "香港 0.2× 01", "香港 02"]
    );
    assert.deepEqual(
        numberNodes(input, "--", true).map((n) => n.name),
        ["香港--01", "香港 0.2×", "香港--02"]
    );
    assert.equal(input[0].name, "香港");
    assert.equal(numberNodes([{ name: "香港101" }], "", true)[0].name, "香港101");
    assert.equal(
        numberNodes(Array.from({ length: 101 }, () => ({ name: "香港" })))[100].name,
        "香港 101"
    );
    assert.throws(
        () => numberNodes([{ name: "香港" }, { name: "香港" }, { name: "香港 01" }], " ", true),
        /Duplicate/
    );
});

test("hierarchical sorting is idempotent and preserves the node multiset", () => {
    const input = Array.from({ length: 240 }, (_, i) =>
        node(
            String(i),
            ["香港", "新加坡", "越南", null][i % 4],
            ["A", "B", ""][i % 3],
            ["low", "high", "standard", "tagged"][i % 4]
        )
    );
    const sorted = orderNodes(input, (n) => n);
    assert.deepEqual(
        orderNodes(sorted, (n) => n),
        sorted
    );
    assert.equal(new Set(sorted.map((n) => n.id)).size, input.length);
});
