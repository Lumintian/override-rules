import assert from "node:assert/strict";
import { test } from "node:test";
import { main } from "../../src/main";
import type { ClashConfig, ProxyGroup } from "../../src/types";

function group(config: ClashConfig, name: string): ProxyGroup {
    const found = config["proxy-groups"]?.find((item) => item.name === name);
    assert.ok(found, `Missing group ${name}`);
    return found;
}

const input: ClashConfig = {
    proxies: [
        { name: "A | 美国 01", type: "ss" },
        { name: "A | 香港 0.2× 01", type: "ss" },
        { name: "B | 香港 01", type: "ss" },
        { name: "A | 香港 01", type: "ss" },
        { name: "B | 新加坡 01", type: "ss" },
    ],
};
const expected = ["A | 香港 01", "A | 香港 0.2× 01", "B | 香港 01", "B | 新加坡 01", "A | 美国 01"];

test("override orders the merged proxies, manual, country, extra and GLOBAL node candidates", () => {
    const before = structuredClone(input);
    const output = main(input, { threshold: "1", hk: "1", sg: "1" });
    assert.deepEqual(
        output.proxies?.map((node) => node.name),
        expected
    );
    assert.deepEqual(group(output, "手动选择").proxies, expected);
    assert.deepEqual(group(output, "香港节点").proxies, expected.slice(0, 3));
    assert.deepEqual(group(output, "香港额外1").proxies, expected.slice(0, 3));
    assert.deepEqual(group(output, "新加坡额外1").proxies, [expected[3]]);
    const global = group(output, "GLOBAL");
    assert.equal(global["include-all"], undefined);
    assert.deepEqual(
        global.proxies?.filter((name) => expected.includes(name)),
        expected
    );
    assert.deepEqual(input, before);
});

test("front and landing candidate lists retain sorted order without changing dialers", () => {
    const config: ClashConfig = {
        proxies: [
            { name: "A | 美国 落地 01", "dialer-proxy": "前置代理" },
            { name: "A | 新加坡 01" },
            { name: "A | 香港 落地 01", "dialer-proxy": "前置代理" },
            { name: "A | 香港 01" },
        ],
    };
    const output = main(config, { threshold: "1" });
    assert.deepEqual(group(output, "落地节点").proxies, ["A | 香港 落地 01", "A | 美国 落地 01"]);
    const nodeNames = config.proxies!.map((node) => node.name);
    assert.deepEqual(
        group(output, "前置代理").proxies?.filter((name) => nodeNames.includes(name)),
        ["A | 香港 01", "A | 新加坡 01"]
    );
    for (const node of output.proxies!) assert.ok(config.proxies!.includes(node));
});

test("multiple landing chains use independent region-mapped front groups", () => {
    const config: ClashConfig = {
        proxies: [
            { name: "A | 香港 01" },
            { name: "A | 新加坡 01" },
            { name: "B | 美国 01" },
            { name: "美国 落地 A", "dialer-proxy": "前置代理A" },
            { name: "德国 落地 B", "dialer-proxy": "前置代理B" },
        ],
    };
    const output = main(config, { threshold: "1", front_a: "hk,sg", front_b: "us" });
    assert.deepEqual(group(output, "落地节点A").proxies, ["美国 落地 A"]);
    assert.deepEqual(group(output, "落地节点B").proxies, ["德国 落地 B"]);
    assert.deepEqual(group(output, "前置代理A").proxies, [
        "A | 香港 01",
        "A | 新加坡 01",
        "DIRECT",
    ]);
    assert.deepEqual(group(output, "前置代理B").proxies, ["B | 美国 01", "DIRECT"]);
    assert.ok(!group(output, "美国节点").proxies?.includes("美国 落地 A"));
    assert.deepEqual(group(output, "选择代理").proxies?.slice(0, 2), ["落地节点A", "落地节点B"]);
});

test("regex country groups explicitly exclude discovered landing node names", () => {
    const output = main(
        {
            proxies: [{ name: "美国 入口" }, { name: "美国 落地 .*", "dialer-proxy": "前置代理A" }],
        },
        { threshold: "1", regex: "true" }
    );
    assert.ok((group(output, "美国节点")["exclude-filter"] ?? "").includes("美国 落地 \\.\\*"));
});

test("invalid front country codes fail explicitly", () => {
    assert.throws(() => main(input, { front_a: "hk,unknown" }), /front_a.*unknown/);
});

test("all generated explicit references remain valid and STABLE membership is retained", () => {
    const output = main(input, { threshold: "1", hk: "2" });
    const valid = new Set([
        "DIRECT",
        "REJECT",
        "REJECT-DROP",
        ...expected,
        ...output["proxy-groups"]!.map((g) => g.name),
    ]);
    for (const g of output["proxy-groups"]!) {
        for (const name of g.proxies ?? []) {
            assert.ok(valid.has(name), `${g.name}: ${name}`);
            assert.notEqual(g.name, name);
        }
    }
    assert.deepEqual(group(output, "稳定代理").proxies, [
        "选择代理",
        ...group(output, "选择代理").proxies!,
    ]);
});

test("per-call arguments do not leak and regex groups remain explicitly dynamic", () => {
    assert.equal(group(main(input, { grouptype: "0" }), "香港节点").type, "select");
    assert.equal(group(main(input), "香港节点").type, "url-test");
    const output = main(input, { regex: "true", hk: "1" });
    assert.equal(group(output, "香港节点")["include-all"], true);
    assert.equal(group(output, "香港额外1").proxies, undefined);
    assert.deepEqual(group(output, "手动选择").proxies, expected);
});

test("hosts, inherited DNS and infrastructure options survive ordering unchanged", () => {
    const config: ClashConfig = {
        ...input,
        hosts: { "service.lan": "192.0.2.10" },
        dns: {
            enable: true,
            ipv6: false,
            "prefer-h3": false,
            "enhanced-mode": "fake-ip",
            nameserver: [],
            fallback: [],
            "nameserver-policy": { "+.example.test": "192.0.2.53" },
            "fake-ip-filter": ["+.example.test"],
        },
    };
    const original = structuredClone(config);
    const output = main(config, { full: "true", ipv6: "true", tun: "true" });
    assert.deepEqual(output.hosts, config.hosts);
    assert.deepEqual(output.dns?.["nameserver-policy"], config.dns?.["nameserver-policy"]);
    assert.ok(output.dns?.["fake-ip-filter"]?.includes("+.example.test"));
    assert.equal(output["mixed-port"], 7890);
    assert.equal(output.tun?.enable, true);
    assert.equal(output.ipv6, true);
    assert.deepEqual(config, original);
});

test("empty proxies are accepted but missing proxies still produces the documented error", () => {
    assert.deepEqual(main({ proxies: [] }).proxies, []);
    assert.throws(() => main({}), /proxies/);
});
