import assert from "node:assert/strict";
import { test } from "node:test";
import { renameNodes } from "../substore/rename";
import { describeName, orderNamedNodes } from "../../shared/display_name";
import { EN, FG, QC, ZH, findRegion } from "../../shared/regions";

const proxies = (names: string[]) =>
    names.map((name, index) => ({ name, server: `test-${index}.invalid`, port: 443 }));
const names = (nodes: Array<{ name: string }>) => nodes.map((node) => node.name);
const args = { flag: true, bl: true, blgd: true, nm: true, clear: true };

test("the reported ten-node regression stays in country blocks with independent numbering", () => {
    assert.deepEqual(
        names(
            renameNodes(
                proxies([
                    "英国 0.2x",
                    "香港 0.2x",
                    "香港 1x",
                    "美国 1x",
                    "美国 1x",
                    "德国 3x",
                    "法国 2x",
                    "法国 3x",
                    "日本 2x",
                    "越南 2x",
                ]),
                args
            )
        ),
        [
            "🇭🇰 香港 01",
            "🇭🇰 香港 0.2× 01",
            "🇯🇵 日本 2× 01",
            "🇺🇸 美国 01",
            "🇺🇸 美国 02",
            "🇬🇧 英国 0.2× 01",
            "🇩🇪 德国 3× 01",
            "🇫🇷 法国 2× 01",
            "🇫🇷 法国 3× 01",
            "🇻🇳 越南 2× 01",
        ]
    );
});

test("country -> explicit provider prefix -> category, not global low-multiplier sinking", () => {
    assert.deepEqual(
        names(
            renameNodes(
                proxies([
                    "A | 香港 0.2x",
                    "B | 新加坡",
                    "B | 香港",
                    "A | 香港 1x",
                    "B | 香港 0.5x",
                ]),
                args
            )
        ),
        [
            "🇭🇰 A | 香港 01",
            "🇭🇰 A | 香港 0.2× 01",
            "🇭🇰 B | 香港 01",
            "🇭🇰 B | 香港 0.5× 01",
            "🇸🇬 B | 新加坡 01",
        ]
    );
});

test("multiple preserved labels compose rather than overwriting each other", () => {
    assert.deepEqual(
        names(
            renameNodes(proxies(["香港 IPLC 家宽 0.2x", "香港 IPLC", "香港 1x", "香港 2x"]), args)
        ),
        ["🇭🇰 香港 01", "🇭🇰 香港 IPLC 01", "🇭🇰 香港 2× 01", "🇭🇰 香港 0.2× IPLC Fam 01"]
    );
});

test("metadata controls sorting even when multiplier display and flags are disabled", () => {
    const input = proxies(["香港 0.2x", "香港 1x", "新加坡", "日本"]);
    const output = renameNodes(input);
    assert.deepEqual(
        output.map((node) => node.server),
        ["test-1.invalid", "test-0.invalid", "test-2.invalid", "test-3.invalid"]
    );
    assert.deepEqual(names(output), ["香港 01", "香港 02", "新加坡 01", "日本 01"]);
});

test("unknown countries are optional, last and stable; information nodes are removed first", () => {
    const input = proxies([
        "Unknown Z",
        "香港 官网",
        "香港",
        "Unknown A",
        "剩余流量 100GB",
        "日本 备用",
        "英属维京群岛",
    ]);
    assert.deepEqual(names(renameNodes(input, { clear: true, nm: true, one: true })), [
        "香港",
        "日本",
        "英属维京群岛",
        "Unknown Z",
        "Unknown A",
    ]);
    assert.deepEqual(names(renameNodes(input, { clear: true, one: true })), [
        "香港",
        "日本",
        "英属维京群岛",
    ]);
});

test("chain tags assign distinct dialer groups without overwriting conflicts", () => {
    const output = renameNodes(
        [{ name: "美国 落地 中转" }, { name: "德国 落地 中转A" }, { name: "日本 普通" }],
        { chain: true, blgd: true }
    );
    assert.equal(output.find((node) => node.name.includes("美国"))?.["dialer-proxy"], "前置代理");
    assert.equal(output.find((node) => node.name.includes("德国"))?.["dialer-proxy"], "前置代理A");
    assert.equal(output.find((node) => node.name.includes("日本"))?.["dialer-proxy"], undefined);

    const replaced = renameNodes([{ name: "台湾 禁止直连" }], {
        chain: true,
        blkey: "禁止直连>中转A",
        one: true,
    });
    assert.equal(replaced[0].name, "台湾 中转A");
    assert.equal(replaced[0]["dialer-proxy"], "前置代理A");

    assert.throws(
        () =>
            renameNodes([{ name: "美国 落地 中转B", "dialer-proxy": "前置代理A" }], {
                chain: true,
            }),
        /dialer-proxy conflict/
    );
    assert.throws(
        () =>
            renameNodes([{ name: "台湾 中转A 禁止直连" }], {
                chain: true,
                blkey: "禁止直连>中转B",
            }),
        /chain tag conflict/
    );
});

test("source objects and connection fields are preserved, and unspecified block-quic is untouched", () => {
    const input = [
        {
            name: "香港 1x",
            type: "ss",
            server: "test.invalid",
            port: 443,
            password: "fixture",
            "dialer-proxy": "前置代理",
            "block-quic": "on",
        },
    ];
    const before = structuredClone(input);
    const output = renameNodes(input, args);
    assert.deepEqual(input, before);
    assert.notEqual(output[0], input[0]);
    assert.equal(output[0]["dialer-proxy"], "前置代理");
    assert.equal(output[0]["block-quic"], "on");
    assert.equal(renameNodes(input, { blockquic: "off" })[0]["block-quic"], "off");
});

test("numeric 1.0 equals 1; nx and blnx use parsed billing multipliers", () => {
    const input = proxies(["香港 1.0x", "香港 1x", "香港", "香港 0.2x", "香港 2x", "香港 ˣ³"]);
    assert.deepEqual(names(renameNodes(input, { nx: true, bl: true })), [
        "香港 01",
        "香港 02",
        "香港 03",
    ]);
    assert.deepEqual(names(renameNodes(input, { blnx: true, bl: true })), [
        "香港 2× 01",
        "香港 3× 01",
    ]);
    assert.equal(renameNodes(input, { nm: "false", nx: "false" }).length, 6);
});

test("nf, flag, output language and separators do not alter sorting identity", () => {
    const input = proxies(["日本 2x", "香港 0.2x", "香港 1x", "新加坡"]);
    const order = ["test-2.invalid", "test-1.invalid", "test-3.invalid", "test-0.invalid"];
    for (const out of ["cn", "en", "quan", "flag"]) {
        for (const nf of [true, false]) {
            const output = renameNodes(input, {
                ...args,
                name: "A |",
                out,
                nf,
                fgf: "--",
                sn: "::",
            });
            assert.deepEqual(
                output.map((node) => node.server),
                order
            );
        }
    }
});

test("singletons omit numbering by exact baseName, including empty and multicharacter separators", () => {
    assert.deepEqual(
        names(
            renameNodes(proxies(["香港", "香港", "香港 0.2x"]), { bl: true, one: true, sn: "--" })
        ),
        ["香港--01", "香港--02", "香港 0.2×"]
    );
    assert.deepEqual(names(renameNodes(proxies(["香港"]), { one: true, sn: "" })), ["香港"]);
});

test("custom tags are local to each node and can preserve multiple replacements", () => {
    assert.deepEqual(
        names(renameNodes(proxies(["香港 GPT NF", "香港"]), { blkey: "GPT>AI+NF>Netflix" })),
        ["香港 AI Netflix 01", "香港 01"]
    );
    assert.deepEqual(
        names(renameNodes(proxies(["Hongkong GPT", "Hongkong"]), { blkey: "GPT>AI" })),
        ["香港 AI 01", "香港 01"]
    );
});

test("operator calls do not leak region detection or regex state", () => {
    const input = proxies(["Tokyo", "London", "Hongkong"]);
    assert.deepEqual(renameNodes(input, { out: "en" }), renameNodes(input, { out: "en" }));
    assert.equal(names(renameNodes(proxies(["香港"]), { out: "en" }))[0], "HK 01");
    assert.equal(names(renameNodes(proxies(["香港"]), { out: "cn" }))[0], "香港 01");
});

test("the inherited region catalogue round-trips every output format", () => {
    assert.equal(EN.length, ZH.length);
    assert.equal(EN.length, QC.length);
    assert.equal(new Set(EN).size, EN.length);
    for (let i = 0; i < EN.length; i++) {
        for (const name of [EN[i], ZH[i], QC[i], FG[i]]) {
            assert.equal(findRegion(name)?.regionIndex, i, name);
        }
    }
    assert.equal(findRegion("BGP")?.country, undefined);
    assert.equal(findRegion("INDIA")?.country, "印度");
});

test("sort-only merge corrects independently renamed source arrays without renumbering", () => {
    const a = renameNodes(proxies(["日本", "香港 0.2x", "香港"]), { ...args, name: "A |" });
    const b = renameNodes(proxies(["香港", "新加坡"]), { ...args, name: "B |", nf: true });
    const merged = [...a, ...b];
    const original = structuredClone(merged);
    const result = orderNamedNodes(merged);
    assert.deepEqual(names(result), [
        "🇭🇰 A | 香港 01",
        "🇭🇰 A | 香港 0.2× 01",
        "B | 🇭🇰 香港 01",
        "B | 🇸🇬 新加坡 01",
        "🇯🇵 A | 日本 01",
    ]);
    assert.deepEqual(merged, original);
    assert.deepEqual(orderNamedNodes(result), result);
    for (const item of result) assert.ok(merged.includes(item));
});

test("provider names and flags do not contaminate country, category or prefix identity", () => {
    assert.deepEqual(describeName("🇭🇰 IPLC 机场 | 香港 01"), {
        country: "香港",
        prefix: "IPLC 机场",
        category: "standard",
    });
    assert.deepEqual(describeName("香港机场 | 🇺🇸 美国 0.2× IPLC 01"), {
        country: "美国",
        prefix: "香港机场",
        category: "low",
    });
    assert.deepEqual(describeName("🇭🇰 A 香港 01"), {
        country: "香港",
        prefix: "A",
        category: "standard",
    });
});
