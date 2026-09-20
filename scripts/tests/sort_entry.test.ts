import assert from "node:assert/strict";
import { test } from "node:test";
import { operator } from "../substore/sort";
import { renameNodes } from "../substore/rename";

test("collection operator sorts merged sources while preserving independent names and credentials", () => {
    const a = renameNodes(
        [
            { name: "美国 1x", password: "fixture-a" },
            { name: "香港 0.2x", password: "fixture-b" },
            { name: "香港 1x", password: "fixture-c" },
        ],
        { name: "A |", flag: true, bl: true }
    );
    const b = renameNodes([{ name: "香港 1x" }, { name: "新加坡 1x" }], {
        name: "B |",
        flag: true,
    });
    const merged = [...a, ...b];
    const before = structuredClone(merged);
    const sorted = operator(merged);
    assert.deepEqual(
        sorted.map((node) => node.name),
        [
            "🇭🇰 A | 香港 01",
            "🇭🇰 A | 香港 0.2× 01",
            "🇭🇰 B | 香港 01",
            "🇸🇬 B | 新加坡 01",
            "🇺🇸 A | 美国 01",
        ]
    );
    assert.deepEqual(merged, before);
    for (const node of sorted) assert.ok(merged.includes(node));
    assert.deepEqual(operator(sorted), sorted);
});

test("sort-only never drops unknown nodes, renumbers names or rewrites dialer-proxy", () => {
    const input = [{ name: "Unmatched 83", "dialer-proxy": "existing-proxy" }, { name: "香港 99" }];
    assert.deepEqual(operator(input), [input[1], input[0]]);
    assert.deepEqual(operator([]), []);
});
