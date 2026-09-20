import assert from "node:assert/strict";
import { test } from "node:test";
import { countriesMeta } from "../../src/constants";
import { countryWeights } from "../../shared/preferences";
import {
    describeProxyNode,
    getActiveCountryNames,
    parseCountries,
    parseNodesByLanding,
    parseTailscale,
    sortProxyNodes,
} from "../../src/node_parser";

const nodes = (names: string[]) => names.map((name) => ({ name }));
const names = (items: Array<{ name: string }>) => items.map((node) => node.name);

test("group and direct-node ordering share HK/SG preferences", () => {
    const input = nodes(["美国 01", "台湾 01", "香港 01", "新加坡 01", "日本 01"]);
    assert.deepEqual(names(sortProxyNodes(input)), [
        "香港 01",
        "新加坡 01",
        "台湾 01",
        "日本 01",
        "美国 01",
    ]);
    assert.deepEqual(getActiveCountryNames(parseCountries(input), 1), [
        "香港",
        "新加坡",
        "台湾",
        "日本",
        "美国",
    ]);
    for (const [country, meta] of Object.entries(countriesMeta))
        assert.equal(meta.weight, countryWeights[country]);
});

test("merged candidates cluster regions, provider prefixes and categories without renaming", () => {
    const input = nodes([
        "A | 香港 0.2× 01",
        "A | 美国 01",
        "B | 香港 01",
        "A | 香港 01",
        "B | 新加坡 01",
    ]);
    const before = structuredClone(input);
    const result = sortProxyNodes(input);
    assert.deepEqual(names(result), [
        "A | 香港 01",
        "A | 香港 0.2× 01",
        "B | 香港 01",
        "B | 新加坡 01",
        "A | 美国 01",
    ]);
    assert.deepEqual(input, before);
    for (const node of result) assert.ok(input.includes(node));
});

test("country-bearing provider names cannot put US nodes in HK groups", () => {
    const input = nodes(["香港机场 | 美国 01", "香港机场 | 香港 01", "IPLC 机场 | 新加坡 01"]);
    assert.deepEqual(names(parseCountries(input).美国), ["香港机场 | 美国 01"]);
    assert.equal(describeProxyNode(input[2]).category, "standard");
});

test("existing city aliases and lowercase airport codes remain recognized", () => {
    for (const [name, country] of [
        ["A | 洛杉矶 01", "美国"],
        ["A | 马赛 01", "法国"],
        ["A | muc 01", "德国"],
        ["A | 关西 01", "日本"],
    ]) {
        assert.equal(describeProxyNode({ name }).country, country, name);
    }
});

test("long known names must not fall into short substring country matchers", () => {
    assert.equal(
        parseCountries(nodes(["亚美尼亚", "白俄罗斯", "法罗群岛", "英属维京群岛"])).美国,
        undefined
    );
    assert.deepEqual(
        Object.keys(parseCountries(nodes(["亚美尼亚", "白俄罗斯", "法罗群岛", "英属维京群岛"]))),
        []
    );
    assert.ok(parseCountries(nodes(["马来 01", "Malaysia 02"])).马来西亚);
});

test("unregistered countries sort before unknowns without creating unsupported groups", () => {
    const input = nodes(["unknown-z", "越南 01", "日本 01", "unknown-a", "越南 02"]);
    assert.deepEqual(names(sortProxyNodes(input)), [
        "日本 01",
        "越南 01",
        "越南 02",
        "unknown-z",
        "unknown-a",
    ]);
    assert.deepEqual(Object.keys(parseCountries(input)), ["日本"]);
});

test("sorting preserves landing and Tailscale membership and connection fields", () => {
    const input = [
        { name: "美国 01", "dialer-proxy": "前置代理", server: "test.invalid" },
        { name: "香港 01", type: "ss" },
        { name: "私网", type: "tailscale" },
    ];
    const result = sortProxyNodes(input);
    assert.deepEqual(parseNodesByLanding(result).landingNodes, [input[0]]);
    assert.deepEqual(parseTailscale(result), [input[2]]);
    assert.deepEqual(sortProxyNodes(result), result);
});
