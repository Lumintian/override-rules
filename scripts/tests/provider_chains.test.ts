import assert from "node:assert/strict";
import { test } from "node:test";
import { renameNodes } from "../substore/rename";
import { main } from "../../src/main";
import {
    downloadSnapshot,
    prepareProvider,
    validateSnapshotChains,
} from "../../src/proxy_providers";
import {
    hasConsistentTransitIdentity,
    transitPattern,
    TRANSIT_PATTERN,
} from "../../shared/chain_tags";
import type { ClashConfig, ProxyGroup, ProxyNode, ScriptArgs } from "../../src/types";
import { assertValidReferences, getGroup } from "./helpers";

const url = "https://example.com/chain-provider?token=PRIVATE";
const node = (name: string, id?: string): ProxyNode => ({
    name,
    type: "ss",
    server: "node.example",
    port: 443,
    cipher: "aes-128-gcm",
    password: "test-only",
    ...(id !== undefined && { "dialer-proxy": `前置代理${id}` }),
});
const provider = "override-provider";
function generate(
    snapshot: ProxyNode[],
    input: ClashConfig = {},
    args: ScriptArgs = {}
): ClashConfig {
    const allArgs = { providerurl: url, ...args };
    return main(prepareProvider(input, allArgs), allArgs, snapshot);
}
function dynamic(group: ProxyGroup, nodes: ProxyNode[]): string[] {
    const match = (pattern: string, name: string) =>
        new RegExp(pattern.replace(/^\(\?i\)/, ""), pattern.startsWith("(?i)") ? "i" : "").test(
            name
        );
    return nodes
        .map(({ name }) => name)
        .filter(
            (name) =>
                (!group.filter || match(group.filter, name)) &&
                (!group["exclude-filter"] || !match(group["exclude-filter"], name))
        );
}
function assertNoSnapshotReferences(config: ClashConfig, snapshot: ProxyNode[]): void {
    const references = config["proxy-groups"]!.flatMap((group) => group.proxies ?? []);
    assert.ok(snapshot.every(({ name }) => !references.includes(name)));
    assertValidReferences(config);
}

test("rename output drives all 27 provider chains without snapshot-name references", async () => {
    const ids = ["", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
    const landing = renameNodes(
        ids.map((id) => node(`美国 中转${id}`)),
        {
            chain: true,
            blkey: ids.map((id) => `中转${id}`).join("+"),
            flag: true,
        }
    );
    const snapshot = [node("香港 front 01"), node("香港 front 02"), ...landing];
    // Exercise the download validator, not just direct construction of the synchronous core.
    const downloaded = await downloadSnapshot(url, {
        get: async () => ({ statusCode: 200, body: JSON.stringify({ proxies: snapshot }) }),
        parseYaml: JSON.parse,
        byteLength: Buffer.byteLength,
    });
    const config = generate(downloaded, {}, { us: "2", front: "hk", front_a: "hk" });
    assert.deepEqual(config.proxies, []);
    assert.ok(
        !config["proxy-groups"]!.some(
            ({ name }) => name.startsWith("美国节点") || name.startsWith("美国额外")
        ),
        "landings do not count toward regional/extra groups"
    );
    for (const id of ids) {
        const front = getGroup(config, `前置代理${id}`);
        const landingGroup = getGroup(config, `落地节点${id}`);
        assert.deepEqual(front.use, [provider]);
        assert.deepEqual(landingGroup.use, [provider]);
        assert.deepEqual(front.proxies, [], "DIRECT must not precede dynamic fronts");
        assert.deepEqual(landingGroup.proxies, []);
        assert.deepEqual(dynamic(front, snapshot), ["香港 front 01", "香港 front 02"]);
        assert.deepEqual(
            dynamic(landingGroup, snapshot),
            landing
                .filter((item) => item["dialer-proxy"] === `前置代理${id}`)
                .map(({ name }) => name)
        );
    }
    assert.deepEqual(dynamic(getGroup(config, "香港节点"), snapshot), [
        "香港 front 01",
        "香港 front 02",
    ]);
    assertNoSnapshotReferences(config, snapshot);
});

test("runtime filters survive renumbering, prefix changes and additions within known chains", () => {
    const original = [
        node("香港 old front"),
        node("美国 中转 old", ""),
        node("香港 中转A old", "A"),
        node("美国 中转B old", "B"),
    ];
    const config = generate(
        original,
        {},
        { threshold: "1", hk: "1", front: "hk", front_a: "hk", front_b: "us", front_z: "sg" }
    );
    const updated = [
        node("Airport2 香港 front 99"),
        node("US front 20"),
        node("日本 new front"),
        node("US new 中转 88", ""),
        node("香港 new 中转A 55", "A"),
        node("US new 中转B 44", "B"),
        node("美属萨摩亚 front"),
    ];
    assert.deepEqual(dynamic(getGroup(config, "前置代理"), updated), ["Airport2 香港 front 99"]);
    assert.deepEqual(dynamic(getGroup(config, "前置代理A"), updated), ["Airport2 香港 front 99"]);
    assert.deepEqual(dynamic(getGroup(config, "前置代理B"), updated), ["US front 20"]);
    assert.deepEqual(dynamic(getGroup(config, "落地节点"), updated), ["US new 中转 88"]);
    assert.deepEqual(dynamic(getGroup(config, "落地节点A"), updated), ["香港 new 中转A 55"]);
    assert.deepEqual(dynamic(getGroup(config, "香港额外1"), updated), ["Airport2 香港 front 99"]);
    assert.ok(!config["proxy-groups"]!.some(({ name }) => name === "前置代理C"));
    assert.equal(getGroup(config, "手动选择").filter, undefined);
    assert.deepEqual(getGroup(config, "GLOBAL").use, [provider]);
    assertNoSnapshotReferences(config, original);
});

test("explicit landings can use provider-only fronts and dynamic landings can use explicit fronts", () => {
    const snapshot = [node("香港 front")];
    const explicitLanding = node("美国 self-hosted", "A");
    const mixed = generate(snapshot, { proxies: [explicitLanding] }, { front_a: "hk" });
    assert.deepEqual(mixed.proxies, [explicitLanding]);
    assert.deepEqual(getGroup(mixed, "落地节点A").proxies, [explicitLanding.name]);
    assert.deepEqual(dynamic(getGroup(mixed, "前置代理A"), snapshot), ["香港 front"]);
    assertNoSnapshotReferences(mixed, snapshot);

    const explicitFront = node("香港 explicit front");
    const landing = [node("美国 中转A", "A")];
    const reverse = generate(landing, { proxies: [explicitFront] }, { front_a: "hk" });
    assert.deepEqual(getGroup(reverse, "前置代理A").proxies, [explicitFront.name]);
    assert.deepEqual(getGroup(reverse, "落地节点A").proxies, []);
    assert.deepEqual(getGroup(reverse, "落地节点A").use, [provider]);
    assert.deepEqual(dynamic(getGroup(reverse, "前置代理A"), landing), []);
    assertNoSnapshotReferences(reverse, landing);
});

test("empty mapped fronts and all-landing snapshots never recycle landings as fronts", () => {
    const snapshot = [node("美国 中转A", "A")];
    const config = generate(snapshot, {}, { front_a: "sg", us: "1" });
    assert.deepEqual(dynamic(getGroup(config, "前置代理A"), snapshot), []);
    assert.deepEqual(getGroup(config, "前置代理A").proxies, []);
    assert.ok(!config["proxy-groups"]!.some(({ name }) => name === "美国额外1"));
    assertValidReferences(config);
});

test("unvalidated providers stay reachable but cannot join any front or landing chain", () => {
    const unknown = {
        type: "http" as const,
        url: "https://unknown.example/",
        override: { "dialer-proxy": "前置代理A" },
    };
    const snapshot = [node("香港 front"), node("美国 中转A", "A")];
    const config = generate(snapshot, { "proxy-providers": { unknown } });
    assert.deepEqual(config["proxy-providers"]!.unknown, unknown);
    assert.deepEqual(getGroup(config, "前置代理A").use, [provider]);
    assert.deepEqual(getGroup(config, "落地节点A").use, [provider]);
    assert.deepEqual(getGroup(config, "手动选择").use, ["unknown", provider]);
    const noSnapshot = main({
        proxies: [node("explicit landing", "A")],
        "proxy-providers": { unknown },
    });
    assert.deepEqual(getGroup(noSnapshot, "前置代理A").proxies, ["DIRECT"]);
    assert.equal(getGroup(noSnapshot, "前置代理A").use, undefined);
});

test("snapshot provider selection is exact and cannot validate a differently transformed duplicate URL", () => {
    const args = { providerurl: url };
    const input: ClashConfig = {
        "proxy-providers": {
            verified: { type: "http", url },
            transformed: { type: "http", url, override: { "dialer-proxy": "前置代理A" } },
        },
    };
    const config = main(prepareProvider(input, args), args, [
        node("香港 front"),
        node("美国 中转A", "A"),
    ]);
    assert.deepEqual(getGroup(config, "前置代理A").use, ["verified"]);
    assert.throws(() => main(input, {}, [node("香港 front")]), /关联 providerurl/);
});

for (const [name, dialer] of [
    ["PRIVATE", "前置代理A"],
    ["PRIVATE 中转A", undefined],
    ["PRIVATE 中转A", "前置代理B"],
    ["PRIVATE 中转", "前置代理A"],
    ["PRIVATE 中转A", "前置代理"],
    ["PRIVATE 中转 中转A", "前置代理A"],
    ["PRIVATE 中转AA", "前置代理A"],
    ["PRIVATE 中转A01", "前置代理A"],
    ["PRIVATE 中转 A", "前置代理A"],
    ["PRIVATE 中转Ａ", "前置代理A"],
    ["PRIVATE 中转A", " 前置代理A "],
    ["PRIVATE", "arbitrary-node"],
] as const) {
    test(`snapshot chain identity rejects mismatches (${name.replace("PRIVATE", "test")}, ${dialer})`, () => {
        assert.throws(
            () => validateSnapshotChains([{ ...node(name), "dialer-proxy": dialer }]),
            (error: Error) =>
                error.message.includes("链路标签") && !error.message.includes("PRIVATE")
        );
    });
}

test("existing rename settings are preserved; stripped/replaced tags require fixing the source, not the snapshot", () => {
    const input = [node("美国 中转A")];
    const dropped = renameNodes(input, { chain: true, one: true });
    assert.equal(dropped[0].name, "美国");
    assert.throws(() => validateSnapshotChains(dropped), /最终名称/);
    const replaced = renameNodes(input, { chain: true, blkey: "中转A>线路A", one: true });
    assert.throws(() => validateSnapshotChains(replaced), /最终名称/);
    for (const args of [
        { flag: true },
        { out: "en" },
        { fgf: "|", sn: "-" },
        { name: "Airport", nf: true },
        { one: true },
    ]) {
        const retained = renameNodes(input, { ...args, chain: true, blkey: "中转+中转A" });
        validateSnapshotChains(retained);
        assert.ok(hasConsistentTransitIdentity(retained[0].name, retained[0]["dialer-proxy"]));
    }
});

test("shared runtime patterns use exact canonical tag boundaries, not snapshots or JS-only lookaround", () => {
    for (const id of ["", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"]) {
        const pattern = transitPattern(id);
        assert.ok(!pattern.includes("(?="));
        assert.ok(!pattern.includes("(?!"));
        const matcher = new RegExp(pattern, "i");
        assert.ok(matcher.test(`香港 中转${id} 01`));
        assert.ok(!matcher.test(`香港 中转${id}X 01`));
        assert.ok(new RegExp(TRANSIT_PATTERN, "i").test(`香港 中转${id} 01`));
    }
    assert.ok(hasConsistentTransitIdentity("香港 中转a 01", "前置代理A"));
    assert.ok(hasConsistentTransitIdentity("香港 中转A 中转A 01", "前置代理A"));
});
