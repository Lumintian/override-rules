import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFeatureFlags } from "../../src/args";
import { countriesMeta } from "../../src/constants";
import type { ClashConfig } from "../../src/types";
import { assertValidReferences, convert, getGroup } from "./helpers";

const proxies = [
    { name: "美国 A" },
    { name: "美国 B" },
    { name: "新加坡 A" },
    { name: "新加坡 B" },
    { name: "日本 A" },
    { name: "日本 B" },
];

function extraNames(config: ClashConfig): string[] {
    return (config["proxy-groups"] ?? [])
        .filter((group) => /额外\d+$/.test(group.name))
        .map((group) => group.name);
}

test("extra groups are opt-in and country parameter codes are unique", () => {
    const flags = buildFeatureFlags({});
    assert.ok(Object.values(flags.countryExtraCounts).every((count) => count === 0));
    assert.deepEqual(extraNames(convert({ proxies })), []);
    const codes = Object.values(countriesMeta).map((meta) => meta.code);
    assert.equal(new Set(codes).size, codes.length);
});

for (const [country, meta] of Object.entries(countriesMeta)) {
    test(`${meta.code}=1 creates an independent select group for ${country}`, () => {
        const nodes = [{ name: `${country} A` }, { name: `${country} B` }];
        const result = convert({ proxies: nodes }, { [meta.code]: "1" });
        assert.deepEqual(extraNames(result), [`${country}额外1`]);
        assert.deepEqual(getGroup(result, `${country}额外1`), {
            name: `${country}额外1`,
            type: "select",
            icon: meta.icon,
            proxies: nodes.map((node) => node.name),
        });
        assertValidReferences(result);
    });
}

for (const regex of [false, true]) {
    for (const grouptype of [0, 1, 2]) {
        test(`us=2&sg=1 preserves base groups and creates only select extras (regex=${regex}, grouptype=${grouptype})`, () => {
            const args = { regex, grouptype: String(grouptype) };
            const baseline = convert({ proxies }, args);
            const result = convert({ proxies }, { ...args, us: "2", sg: "1" });
            assert.deepEqual(extraNames(result), ["新加坡额外1", "美国额外1", "美国额外2"]);
            assert.deepEqual(result.proxies, proxies);
            for (const country of ["新加坡", "日本", "美国"]) {
                assert.deepEqual(
                    getGroup(result, `${country}节点`),
                    getGroup(baseline, `${country}节点`)
                );
            }
            for (const [country, count] of [
                ["美国", 2],
                ["新加坡", 1],
            ] as const) {
                for (let index = 1; index <= count; index += 1) {
                    const extra = getGroup(result, `${country}额外${index}`);
                    assert.equal(extra.type, "select");
                    for (const field of ["url", "interval", "tolerance", "strategy"]) {
                        assert.ok(!(field in extra));
                    }
                    if (regex) {
                        assert.equal(extra.proxies, undefined);
                        assert.equal(extra["include-all"], true);
                        assert.equal(extra.filter, countriesMeta[country].pattern);
                        assert.equal(
                            extra["exclude-filter"],
                            countriesMeta[country].excludePattern
                        );
                    } else {
                        assert.deepEqual(extra.proxies, [`${country} A`, `${country} B`]);
                        assert.equal(extra.filter, undefined);
                        assert.equal(extra["include-all"], undefined);
                    }
                }
            }
            const names = result["proxy-groups"]!.map((group) => group.name);
            assert.deepEqual(
                names.filter((name) => /^(新加坡|日本|美国)(节点|额外\d+)$/.test(name)),
                ["新加坡节点", "新加坡额外1", "日本节点", "美国节点", "美国额外1", "美国额外2"]
            );
            assert.equal(new Set(names).size, names.length);
            for (const name of [
                "选择代理",
                "静态资源",
                "ChatGPT",
                "AI服务",
                "哔哩哔哩",
                "巴哈姆特",
                "GLOBAL",
            ]) {
                for (const extra of extraNames(result)) {
                    assert.ok(
                        getGroup(result, name).proxies?.includes(extra),
                        `${name} misses ${extra}`
                    );
                }
            }
            for (const name of ["自动选择", "故障转移"]) {
                assert.deepEqual(getGroup(result, name), getGroup(baseline, name));
            }
            assertValidReferences(result);
        });
    }

    test(`explicit extras bypass threshold but absent countries never create empty groups (regex=${regex})`, () => {
        const result = convert(
            { proxies: [{ name: "美国 A" }] },
            { regex, threshold: "99", us: "2", sg: "1" }
        );
        assert.deepEqual(extraNames(result), ["美国额外1", "美国额外2"]);
        assert.ok(!result["proxy-groups"]?.some((group) => group.name === "美国节点"));
        assertValidReferences(result);
        for (const nodes of [[], [{ name: "未知节点" }], [{ name: "美属 A" }]]) {
            assert.deepEqual(extraNames(convert({ proxies: nodes }, { regex, us: "2" })), []);
        }
    });

    test(`landing detection is shared by base and extra country groups (regex=${regex})`, () => {
        const landingNode = { name: "美国 落地", "dialer-proxy": "前置代理" };
        const result = convert({ proxies: [...proxies, landingNode] }, { regex, us: "2" });
        if (!regex) {
            assert.deepEqual(getGroup(result, "美国额外1").proxies, ["美国 A", "美国 B"]);
        } else {
            assert.equal(getGroup(result, "美国额外1").filter, countriesMeta.美国.pattern);
        }
        assert.ok(getGroup(result, "前置代理").proxies?.includes("美国额外1"));
        assert.ok(getGroup(result, "前置代理").proxies?.includes("美国额外2"));
        assertValidReferences(result);
        const onlyLandingInCountry = convert(
            { proxies: [{ name: "香港 A" }, landingNode] },
            { regex, us: "2" }
        );
        assert.deepEqual(extraNames(onlyLandingInCountry), []);
        // With no non-landing nodes, the existing chain-mode detection stays off.
        const allLanding = convert({ proxies: [landingNode] }, { regex, us: "1" });
        assert.deepEqual(extraNames(allLanding), ["美国额外1"]);
    });

    test(`Taiwan and Hong Kong specialized selectors include matching extras (regex=${regex})`, () => {
        const result = convert(
            {
                proxies: [
                    { name: "台湾 A" },
                    { name: "台湾 B" },
                    { name: "香港 A" },
                    { name: "香港 B" },
                ],
            },
            { regex, tw: "2", hk: "1" }
        );
        assert.deepEqual(getGroup(result, "哔哩哔哩").proxies, [
            "DIRECT",
            "台湾节点",
            "台湾额外1",
            "台湾额外2",
            "香港节点",
            "香港额外1",
        ]);
        assert.deepEqual(getGroup(result, "巴哈姆特").proxies, [
            "台湾节点",
            "台湾额外1",
            "台湾额外2",
            "选择代理",
            "手动选择",
            "DIRECT",
        ]);
        assertValidReferences(result);
    });
}

for (const value of [
    undefined,
    null,
    "",
    " ",
    "0",
    0,
    "-1",
    -1,
    "1.5",
    1.5,
    "2abc",
    "1e2",
    "Infinity",
    Infinity,
    NaN,
    true,
    "101",
    "999999999999999999999",
]) {
    test(`invalid or disabled extra count ${String(value)} (${typeof value}) produces no extras`, () => {
        const result = convert({ proxies }, { us: value, sg: "1" });
        assert.deepEqual(extraNames(result), ["新加坡额外1"]);
        assertValidReferences(result);
    });
}

for (const value of ["2", " 2 ", 2, "02"]) {
    test(`valid extra count ${JSON.stringify(value)} (${typeof value}) is accepted`, () => {
        assert.deepEqual(extraNames(convert({ proxies }, { us: value })), [
            "美国额外1",
            "美国额外2",
        ]);
    });
}

test("maximum extra count is accepted without off-by-one errors", () => {
    const result = convert({ proxies }, { us: "100" });
    const names = extraNames(result);
    assert.equal(names.length, 100);
    assert.equal(names[0], "美国额外1");
    assert.equal(names[99], "美国额外100");
    assertValidReferences(result);
});

test("unknown country parameters and shorthand keys are ignored", () => {
    assert.deepEqual(extraNames(convert({ proxies }, { xx: "2", US: "2", us2: "true" })), []);
});
