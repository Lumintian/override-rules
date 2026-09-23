import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import vm from "node:vm";
import { buildSync } from "esbuild";
import { parse, stringify } from "yaml";
import { main } from "../../src/main";
import {
    downloadSnapshot,
    prepareProvider,
    SNAPSHOT_MAX_BYTES,
    SNAPSHOT_TIMEOUT_MS,
} from "../../src/proxy_providers";
import type { SnapshotRuntime } from "../../src/proxy_providers";
import type { ClashConfig, ProxyNode, ScriptArgs } from "../../src/types";
import { parseArguments } from "../preview/input";
import { assertValidReferences, convert, getGroup } from "./helpers";

const url = "https://subscription.example/provider?token=SECRET%2Fencoded&target=mihomo";
const node = (name: string): ProxyNode => ({
    name,
    type: "ss",
    server: "node.example",
    port: 443,
    cipher: "aes-128-gcm",
    password: "test-only",
});
const snapshot = [node("香港 A"), node("香港 B"), node("美国 A"), node("Unknown")];
const code = buildSync({
    entryPoints: [path.resolve(__dirname, "../../src/main.ts")],
    bundle: true,
    write: false,
    platform: "neutral",
    format: "iife",
}).outputFiles[0].text;

async function shortcut(config: ClashConfig, args: ScriptArgs, get: SnapshotRuntime["get"]) {
    const sandbox = {
        $arguments: args,
        $substore: { env: { isNode: true }, http: { get } },
        ProxyUtils: { yaml: { safeLoad: parse, safeDump: stringify } },
        URL,
        Buffer,
        input: stringify(config),
        result: "",
    };
    // Mirrors the verified Sub-Store Mihomo shortcut contract: run script then await main(config).
    await vm.runInNewContext(
        `(async () => { ${code}\nresult = ProxyUtils.yaml.safeDump(await main(ProxyUtils.yaml.safeLoad(input))); })()`,
        sandbox
    );
    return parse(sandbox.result) as ClashConfig;
}

const success: SnapshotRuntime["get"] = async () => ({
    statusCode: 200,
    body: stringify({ proxies: snapshot }),
});

function allExplicitReferences(config: ClashConfig): string[] {
    return (config["proxy-groups"] ?? []).flatMap((group) => group.proxies ?? []);
}

test("provider-only input is synchronous without providerurl, preserving all definitions and reachability", () => {
    const config: ClashConfig = {
        "proxy-providers": {
            remote: {
                type: "http",
                url,
                interval: 123,
                header: { Authorization: ["secret"] },
                override: { udp: true },
            },
            local: { type: "file", path: "./local.yaml" },
            inline: { type: "inline", payload: [node("美国 inline")] },
        },
    };
    const result = convert(config, { us: "2" });
    assert.deepEqual(result["proxy-providers"], config["proxy-providers"]);
    assert.deepEqual(result.proxies, []);
    assert.deepEqual(getGroup(result, "手动选择").use, ["remote", "local", "inline"]);
    assert.ok(getGroup(result, "选择代理").proxies!.includes("手动选择"));
    assert.deepEqual(getGroup(result, "GLOBAL").use, ["remote", "local", "inline"]);
    assert.ok(!result["proxy-groups"]!.some((group) => group.name === "美国额外1"));
    assertValidReferences(result);
});

test("URL parameter downloads a delayed YAML snapshot; only provider references survive", async () => {
    const args = parseArguments(
        `providerurl=${encodeURIComponent(url)}&providerinterval=7200&us=2`
    ) as ScriptArgs;
    let called = false;
    const result = await shortcut({}, args, async (options) => {
        called = true;
        assert.equal(options.url, url);
        assert.equal(options.timeout, SNAPSHOT_TIMEOUT_MS);
        assert.equal(options.headers["User-Agent"], "clash.meta");
        await new Promise((resolve) => setTimeout(resolve, 15));
        return success(options);
    });
    assert.ok(called);
    assert.deepEqual(result.proxies, []);
    const provider = result["proxy-providers"]!["override-provider"];
    assert.equal(provider.url, url);
    assert.equal(provider.interval, 7200);
    assert.equal(provider.proxy, "DIRECT");
    assert.equal(getGroup(result, "香港节点").type, "url-test");
    assert.equal(getGroup(result, "美国额外2").type, "select");
    assert.ok(!result["proxy-groups"]!.some((group) => group.name === "美国节点"));
    for (const name of ["香港节点", "美国额外1", "美国额外2"]) {
        const group = getGroup(result, name);
        assert.deepEqual(group.use, ["override-provider"]);
        assert.ok(group.filter);
        assert.equal(group["include-all"], undefined);
    }
    assert.ok(snapshot.every(({ name }) => !allExplicitReferences(result).includes(name)));
    assertValidReferences(result);
});

test("provider filters accept renamed/new nodes without enumerating snapshot names or rebuilding groups", async () => {
    const result = await shortcut({}, { providerurl: url, us: "1", regex: "false" }, success);
    const group = getGroup(result, "美国额外1");
    const include = new RegExp(group.filter!.replace("(?i)", ""), "i");
    const exclude = new RegExp(group["exclude-filter"]!.replace("(?i)", ""), "i");
    assert.ok(include.test("US New 99"));
    assert.ok(exclude.test("美属萨摩亚"));
    assert.deepEqual(group.proxies, []);
    assert.equal(getGroup(result, "手动选择").filter, undefined);
});

test("mixed input keeps explicit landings/Tailscale and uses validated provider fronts", async () => {
    const explicit = [
        node("美国 explicit"),
        { ...node("日本 landing"), "dialer-proxy": "前置代理A" },
        { name: "tail-node", type: "tailscale" },
    ];
    const result = await shortcut(
        { proxies: explicit },
        { providerurl: url, front_a: "hk", regex: "true", tun: "true" },
        success
    );
    assert.deepEqual(
        new Set(result.proxies!.map((item) => item.name)),
        new Set(explicit.map((item) => item.name))
    );
    assert.deepEqual(getGroup(result, "美国节点").proxies, ["美国 explicit"]);
    assert.deepEqual(getGroup(result, "前置代理A").proxies, []);
    assert.deepEqual(getGroup(result, "前置代理A").use, ["override-provider"]);
    assert.ok(getGroup(result, "前置代理A")["exclude-filter"]?.includes("中转"));
    assert.deepEqual(getGroup(result, "落地节点A").proxies, ["日本 landing"]);
    assert.deepEqual(getGroup(result, "Tailscale").proxies, ["tail-node"]);
    assert.ok(!allExplicitReferences(result).includes("香港 A"));
    assertValidReferences(result);
});

test("generated names and normalized cache paths cannot overwrite existing providers", () => {
    const config: ClashConfig = {
        "proxy-providers": {
            "override-provider": { type: "file", path: "./old.yaml" },
            occupied: {
                type: "file",
                path: "/mihomo-home/proxy_providers/./x/../override-provider-2.yaml",
            },
        },
    };
    const original = JSON.stringify(config);
    const prepared = prepareProvider(config, { providerurl: url });
    assert.ok(prepared["proxy-providers"]!["override-provider-3"]);
    assert.equal(JSON.stringify(config), original);
});

test("same URL reuses provider, preserving its interval, path and request headers", async () => {
    const config: ClashConfig = {
        "proxy-providers": {
            original: {
                type: "http",
                url,
                interval: 4321,
                path: "./original.yaml",
                header: { Authorization: ["Bearer private"], "User-Agent": ["mihomo/custom"] },
            },
        },
    };
    const result = await shortcut(
        config,
        { providerurl: url, providerinterval: "3600" },
        async (options) => {
            assert.equal(options.headers.Authorization, "Bearer private");
            assert.equal(options.headers["User-Agent"], "mihomo/custom");
            return { statusCode: 200, body: JSON.stringify({ proxies: snapshot }) };
        }
    );
    assert.deepEqual(result["proxy-providers"], config["proxy-providers"]);
    assert.deepEqual(getGroup(result, "香港节点").use, ["original"]);
});

test("same-source transformations are rejected rather than using inaccurate snapshot counts", () => {
    assert.throws(
        () =>
            prepareProvider(
                {
                    "proxy-providers": {
                        original: { type: "http", url, override: { "additional-prefix": "US " } },
                    },
                },
                { providerurl: url }
            ),
        /过滤或 override/
    );
});

for (const providerurl of [
    "",
    "file:///tmp/secret",
    "https://u:secret@example.com/",
    "https://example.com/#token",
    "not a url",
    "https://example.com/ bad",
]) {
    test(
        "invalid provider URL is rejected without reflecting credentials: " +
            providerurl.split(":")[0],
        () => {
            assert.throws(
                () => prepareProvider({}, { providerurl }),
                (error: Error) =>
                    !error.message.includes("secret") && error.message.includes("providerurl")
            );
        }
    );
}
for (const interval of ["", "59", "604801", "1.5", "NaN"]) {
    test(`invalid provider interval: ${interval}`, () =>
        assert.throws(
            () => prepareProvider({}, { providerurl: url, providerinterval: interval }),
            /providerinterval/
        ));
}

test("missing APIs fail clearly, but legacy explicit mode needs no HTTP/YAML APIs", () => {
    assert.throws(() => convert({}, { providerurl: url }), /Sub-Store Node/);
    assert.ok(convert({ proxies: [node("美国 A")] }).proxies!.length);
    assert.throws(() => convert({}, { providerinterval: "60" }), /一起使用/);
    assert.throws(() => main({ "proxy-providers": {} }), /proxy-providers/);
    assert.throws(() => main({ proxies: "invalid" as unknown as ProxyNode[] }), /proxies/);
    assert.throws(() => main({ proxies: [] }, {}, snapshot), /快照必须关联/);
    assert.throws(
        () =>
            prepareProvider({ proxies: "invalid" as unknown as ProxyNode[] }, { providerurl: url }),
        /未下载快照/
    );
});

const failures: Array<[string, SnapshotRuntime["get"]]> = [
    [
        "network failure",
        async () => {
            throw new Error(url);
        },
    ],
    [
        "timeout",
        async () => {
            throw new Error(`timeout ${url}`);
        },
    ],
    ["HTTP error", async () => ({ statusCode: 403, body: "SECRET" })],
    ["empty", async () => ({ statusCode: 200, body: "" })],
    ["HTML", async () => ({ statusCode: 200, body: "<html>SECRET</html>" })],
    ["invalid YAML", async () => ({ statusCode: 200, body: "proxies: [SECRET" })],
    ["empty nodes", async () => ({ statusCode: 200, body: "proxies: []" })],
    ["Base64", async () => ({ statusCode: 200, body: "c3M6Ly9TRUNSRVQ=" })],
    [
        "oversized UTF-8",
        async () => ({ statusCode: 200, body: "中".repeat(SNAPSHOT_MAX_BYTES / 2) }),
    ],
    ["bad node", async () => ({ statusCode: 200, body: '{"proxies":[{"name":"SECRET"}]}' })],
    [
        "duplicate names",
        async () => ({
            statusCode: 200,
            body: JSON.stringify({ proxies: [node("SECRET"), node("SECRET")] }),
        }),
    ],
    [
        "chain node without a matching final-name label",
        async () => ({
            statusCode: 200,
            body: JSON.stringify({ proxies: [{ ...node("SECRET"), "dialer-proxy": "前置代理" }] }),
        }),
    ],
    [
        "Tailscale",
        async () => ({
            statusCode: 200,
            body: JSON.stringify({ proxies: [{ ...node("SECRET"), type: "tailscale" }] }),
        }),
    ],
    [
        "too many nodes",
        async () => ({
            statusCode: 200,
            body: JSON.stringify({
                proxies: Array.from({ length: 2001 }, (_, i) => node(String(i))),
            }),
        }),
    ],
];
for (const [label, get] of failures) {
    test(`snapshot ${label} aborts generation without leaking credentials`, async () => {
        await assert.rejects(
            () => shortcut({}, { providerurl: url }, get),
            (error: Error) =>
                error.message.includes("[override-rules]") &&
                !error.message.includes("SECRET") &&
                !error.message.includes("subscription.example")
        );
    });
}

test("parser exceptions are sanitized and YAML alias expansion is bounded", async () => {
    await assert.rejects(
        downloadSnapshot(url, {
            get: success,
            byteLength: Buffer.byteLength,
            parseYaml: () => {
                throw new Error("SECRET");
            },
        }),
        (error: Error) => !error.message.includes("SECRET")
    );
    await assert.rejects(
        () =>
            shortcut({}, { providerurl: url }, async () => ({
                statusCode: 200,
                body: "a: &a [1,2,3]\nb: &b [*a,*a,*a]\nc: &c [*b,*b,*b]\nproxies: [*c,*c,*c]",
            })),
        /别名/
    );
});
