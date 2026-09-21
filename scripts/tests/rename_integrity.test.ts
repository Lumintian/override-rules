import assert from "node:assert/strict";
import { test } from "node:test";
import { renameNodes } from "../substore/rename";
const named = (...names: string[]) => names.map((name) => ({ name }));
const args = { bl: true, blgd: true, flag: true, nm: true };

test("canonical fixed labels survive another renaming pass", () => {
    const once = renameNodes(named("香港 IPLC 家宽 0.2x", "日本 商宽", "新加坡 核心"), args);
    const twice = renameNodes(once, args);
    assert.deepEqual(twice, once);
});

test("invalid prototype-like format names fall back safely", () => {
    assert.equal(
        renameNodes(named("香港"), { out: "__proto__", in: "constructor" })[0].name,
        "香港 01"
    );
});

test("display names are numbered before concrete dialer references are rewritten", () => {
    const input = [
        { name: "香港入口 1x", server: "front.invalid" },
        { name: "美国落地 2x", server: "exit.invalid", "dialer-proxy": "香港入口 1x" },
    ];
    const before = structuredClone(input);
    const output = renameNodes(input, args);
    assert.equal(output[1]["dialer-proxy"], output[0].name);
    assert.deepEqual(input, before);
});

test("external strategy-group dialers are preserved", () => {
    const output = renameNodes([{ name: "香港", "dialer-proxy": "前置代理" }], args);
    assert.equal(output[0]["dialer-proxy"], "前置代理");
});

test("filtering out a concrete dialer fails rather than silently breaking the chain", () => {
    assert.throws(
        () => renameNodes([{ name: "Unknown" }, { name: "香港", "dialer-proxy": "Unknown" }]),
        /Filter removed dialer-proxy/
    );
});

test("duplicate source names are rejected only when a dialer refers to them", () => {
    assert.equal(renameNodes(named("香港", "香港")).length, 2);
    assert.throws(
        () =>
            renameNodes([
                { name: "香港" },
                { name: "香港" },
                { name: "美国", "dialer-proxy": "香港" },
            ]),
        /Ambiguous dialer-proxy/
    );
});

test("same-category multipliers preserve source order rather than sorting numerically", () => {
    assert.deepEqual(
        renameNodes(named("法国 3x", "法国 2x"), { bl: true }).map((node) => node.name),
        ["法国 3× 01", "法国 2× 01"]
    );
});
