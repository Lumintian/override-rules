import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { get } from "node:http";
import { connect, createServer as createTunnel } from "node:net";
import type { Socket } from "node:net";
import path from "node:path";
import { test } from "node:test";
import { PreviewEngine, resolveMembers } from "../preview/engine";
import { importContent, isPublicAddress, validateImportUrl } from "../preview/import";
import {
    MAX_INPUT_BYTES,
    MAX_NODES,
    parseArguments,
    parseInput,
    validateRequest,
} from "../preview/input";
import { createPreviewServer, PROJECT_ROOT } from "../preview/server";
import type { PreviewRequest, PreviewResult } from "../preview/types";
import { convert, getGroup } from "./helpers";

const content = `剩余流量：示例
套餐到期：示例
🇭🇰 𝐇𝐊 · Plus〔4837/CMI/163 2x〕
🇭🇰 𝐇𝐊 · HKT 禁直连
🇺🇸 𝐔𝐒 · LA〔4837 0.5x〕
🇺🇸 𝐔𝐒 · SJC〔4837 0.5x〕
🇻🇳 𝐕𝐍 · TOT〔Standard 0.1x〕`;
const request: PreviewRequest = {
    content,
    format: "auto",
    rename: true,
    renameArgs: "flag&bl&nm&clear",
    overrideArgs: "us=2",
};
const engine = new PreviewEngine(PROJECT_ROOT);

function copiedSources(): string {
    const root = mkdtempSync(path.join(tmpdir(), "override-preview-"));
    cpSync(path.join(PROJECT_ROOT, "src"), path.join(root, "src"), { recursive: true });
    cpSync(path.join(PROJECT_ROOT, "shared"), path.join(root, "shared"), { recursive: true });
    cpSync(path.join(PROJECT_ROOT, "scripts/substore"), path.join(root, "scripts/substore"), {
        recursive: true,
    });
    return root;
}

test("name input preserves Unicode and notices, ignoring blank lines and BOM", () => {
    const parsed = parseInput("\uFEFF\n剩余流量：示例\r\n\r\n🇭🇰 𝐇𝐊 · BGP\r\n", "auto");
    assert.equal(parsed.namesOnly, true);
    assert.deepEqual(parsed.config.proxies, [{ name: "剩余流量：示例" }, { name: "🇭🇰 𝐇𝐊 · BGP" }]);
});

test("Clash YAML/JSON retains connection metadata, hosts and chain fields", () => {
    const config = {
        proxies: [
            {
                name: "美国 落地",
                type: "ss",
                server: "node.example",
                port: 443,
                password: "test-only",
                "dialer-proxy": "前置代理",
            },
        ],
        hosts: { "test.example": "1.2.3.4" },
    };
    assert.deepEqual(parseInput(JSON.stringify(config), "auto").config, config);
    const yaml = "proxies:\n  - name: 美国 A\n    type: ss\n    port: 443\n";
    assert.equal(parseInput(yaml, "auto").config.proxies![0].port, 443);
    assert.equal(parseInput(yaml, "clash").namesOnly, false);
});

for (const [text, format] of [
    ["", "auto"],
    ["<html>login</html>", "auto"],
    ["vmess://example", "auto"],
    ["proxies: []", "auto"],
    ["proxies: [", "auto"],
    ['{"proxies":[{}]}', "auto"],
    ["proxy-providers: {}", "auto"],
    ["plain names", "clash"],
] as const) {
    test(`invalid input is rejected: ${text.slice(0, 24) || "empty"}`, () =>
        assert.throws(() => parseInput(text, format)));
}

test("input size and node-count limits apply before script execution", () => {
    assert.throws(() => parseInput("x".repeat(MAX_INPUT_BYTES + 1), "names"), /2 MiB/);
    assert.throws(
        () =>
            parseInput(
                Array.from({ length: MAX_NODES + 1 }, (_, i) => `香港 ${i}`).join("\n"),
                "names"
            ),
        /2000/
    );
    assert.throws(() => parseInput("x".repeat(513), "names"), /512/);
    assert.throws(() => validateRequest({ content: "香港" }), /完整/);
});

test("YAML alias expansion is bounded", () => {
    const yaml = "a: &a [1, 2, 3]\nb: &b [*a, *a, *a]\nc: &c [*b, *b, *b]\nproxies: [*c, *c, *c]";
    assert.throws(() => parseInput(yaml, "clash"), /别名/);
});

test("argument parsing handles flags, explicit false, Unicode and plus separators", () => {
    const args = parseArguments("#flag&clear=false&nm=0&blkey=自建+落地&name=Test%20Airport", true);
    assert.equal(args.flag, true);
    assert.equal(args.clear, false);
    assert.equal(args.nm, false);
    assert.equal(args.blkey, "自建+落地");
    assert.equal(args.name, "Test Airport");
    assert.equal(parseArguments("us=2&sg=1&regex=false").us, "2");
    assert.throws(() => parseArguments("flag=maybe", true), /布尔值/);
    assert.throws(() => parseArguments("name=%xx"), /编码/);
    assert.throws(() => parseArguments("__proto__=bad"), /参数名/);
});

test("preview runs the real rename and override sources, with row-level removals", async () => {
    const result = await engine.preview(request);
    assert.deepEqual(result.stats, {
        input: 7,
        output: 5,
        removed: 2,
        groups: result.config["proxy-groups"]!.length,
    });
    assert.equal(result.changes[0].before, "剩余流量：示例");
    assert.equal(result.changes[0].after, null);
    assert.equal(result.changes[1].after, null);
    assert.equal(result.changes[4].country, "美国");
    assert.match(result.changes[4].after!, /美国/);
    assert.equal(getGroup(result.config, "美国额外1").type, "select");
    assert.equal(getGroup(result.config, "美国额外2").type, "select");
    assert.ok(
        result.warnings.some(
            (warning) => warning.includes("未识别") && warning.includes("越南 0.1× 01")
        )
    );
    assert.deepEqual(result.config, convert({ proxies: result.config.proxies }, { us: "2" }));
    assert.ok(result.yaml.includes("proxy-groups:"));
    assert.ok(
        !result.config["proxy-groups"]!.some((group) =>
            ["自动选择", "故障转移"].includes(group.name)
        )
    );
});

test("all-filtered inputs still show removed rows without fabricating survivors", async () => {
    const result = await engine.preview({ ...request, content: "剩余流量：示例\n套餐到期：示例" });
    assert.equal(result.stats.output, 0);
    assert.equal(result.stats.removed, 2);
    assert.ok(result.changes.every((row) => row.after === null));
    assert.ok(result.warnings.some((warning) => warning.includes("没有保留节点")));
});

test("explicit clear=false preserves notices instead of treating the string as truthy", async () => {
    const result = await engine.preview({ ...request, renameArgs: "flag&nm&clear=false" });
    assert.equal(result.stats.output, 7);
    assert.ok(result.changes[0].after !== null);
});

test("duplicate original names remain distinguishable in the rename comparison", async () => {
    const result = await engine.preview({
        ...request,
        content: "香港 A\n香港 A",
        overrideArgs: "",
    });
    assert.equal(result.changes.length, 2);
    assert.deepEqual(
        result.changes.map((row) => row.index),
        [1, 2]
    );
    assert.notEqual(result.changes[0].after, result.changes[1].after);
});

test("disabling rename preserves names and ignores inactive rename arguments", async () => {
    const result = await engine.preview({
        ...request,
        rename: false,
        renameArgs: "flag=invalid",
        content: "香港 A\n香港 B",
        overrideArgs: "grouptype=0",
    });
    assert.ok(result.changes.every((row) => row.before === row.after));
    assert.equal(result.stats.removed, 0);
    assert.equal(getGroup(result.config, "香港节点").type, "select");
});

test("regex members include real matching candidates and preserve explicit GLOBAL groups", async () => {
    const result = await engine.preview({
        ...request,
        rename: false,
        content: JSON.stringify({
            proxies: [
                { name: "美国 A" },
                { name: "美国 B" },
                { name: "美国 落地", "dialer-proxy": "前置代理" },
            ],
        }),
        overrideArgs: "us=1&regex=true",
    });
    assert.deepEqual(result.members["美国额外1"], ["美国 A", "美国 B", "美国 落地"]);
    assert.ok(result.members.GLOBAL.includes("美国额外1"));
    assert.ok(result.warnings.some((warning) => warning.includes("落地")));
    const enumResult = await engine.preview({
        ...request,
        rename: false,
        content: JSON.stringify({ proxies: result.config.proxies }),
        overrideArgs: "us=1",
    });
    assert.deepEqual(enumResult.members["美国额外1"], ["美国 A", "美国 B"]);
});

test("unsupported regex simulation is reported rather than presented as real behavior", () => {
    const warnings: string[] = [];
    const members = resolveMembers(
        {
            proxies: [{ name: "香港 A" }],
            "proxy-groups": [{ name: "test", type: "select", "include-all": true, filter: "[" }],
        },
        warnings
    );
    assert.deepEqual(members.test, []);
    assert.equal(warnings.length, 1);
});

test("source edits and compile-error recovery work without restarting the engine", async (t) => {
    const root = copiedSources();
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const local = new PreviewEngine(root);
    const input = { ...request, content: "美国 A\n美国 B", rename: false, overrideArgs: "" };
    const before = await local.preview(input);
    const file = path.join(root, "src/args.ts");
    const original = readFileSync(file, "utf8");
    writeFileSync(
        file,
        original.replace("parseNumber(args.grouptype, 1)", "parseNumber(args.grouptype, 0)")
    );
    const after = await local.preview(input);
    assert.notEqual(after.revision, before.revision);
    assert.equal(getGroup(after.config, "美国节点").type, "select");
    writeFileSync(file, "invalid TypeScript {");
    await assert.rejects(() => local.preview(input));
    writeFileSync(file, original);
    assert.equal(getGroup((await local.preview(input)).config, "美国节点").type, "url-test");
    writeFileSync(path.join(root, "scripts/substore/rename.ts"), "invalid TypeScript {");
    await local.preview(input);
});

test("script execution itself is covered by the VM timeout", async (t) => {
    const root = copiedSources();
    t.after(() => rmSync(root, { recursive: true, force: true }));
    writeFileSync(
        path.join(root, "src/main.ts"),
        "(globalThis as any).main = () => { while (true) {} };"
    );
    await assert.rejects(
        () => new PreviewEngine(root).preview({ ...request, rename: false }),
        /timed out/
    );
});

for (const url of [
    "file:///etc/passwd",
    "ftp://example.com/file",
    "http://localhost/",
    "http://127.0.0.1/",
    "http://2130706433/",
    "http://10.0.0.1/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "https://user:pass@example.com/",
]) {
    test(`unsafe import target is rejected: ${url}`, () =>
        assert.throws(() => validateImportUrl(url)));
}

test("public URLs are allowed while private DNS addresses are rejected", async () => {
    assert.equal(validateImportUrl("https://example.com/nodes.txt#ignored").hash, "");
    for (const address of [
        "127.0.0.1",
        "10.1.2.3",
        "192.168.1.1",
        "::1",
        "::ffff:192.168.1.1",
        "fe80::1",
        "fc00::1",
    ])
        assert.equal(isPublicAddress(address), false, address);
    assert.equal(isPublicAddress("1.1.1.1"), true);
    assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
    await assert.rejects(() => importContent("http://127.0.0.1/"), /公网/);
});

test("local HTTP API serves the UI and enforces host, origin, token and input validation", async (t) => {
    let imports = 0;
    const { server, token } = createPreviewServer({
        importer: async () => {
            imports += 1;
            return "香港 A\n香港 B";
        },
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    t.after(
        () =>
            new Promise<void>((resolve) => {
                server.close(() => resolve());
                server.closeAllConnections();
            })
    );
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;
    const page = await fetch(base);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.ok(html.includes(token));
    assert.ok(html.includes("rename-help"));
    assert.ok(html.includes("tab-icon"));
    assert.ok(html.includes('viewBox="0 0 5 5"'));
    assert.equal(html.includes("不上传第三方"), false);
    assert.equal(html.includes("当前示例含 clear"), false);
    assert.equal(html.includes("extra-preset"), false);
    assert.equal(page.headers.get("cache-control"), "no-store");
    assert.match(page.headers.get("content-security-policy")!, /frame-ancestors 'none'/);
    assert.equal((await fetch(`${base}/app.js`)).status, 200);
    assert.equal((await fetch(`${base}/app.css`)).status, 200);
    assert.equal((await fetch(`${base}/favicon.svg`)).status, 200);
    assert.equal((await fetch(`${base}/package.json`)).status, 404);
    assert.equal((await fetch(`${base}/api/revision`)).status, 403);
    const headers = { "x-preview-token": token, "content-type": "application/json" };
    assert.equal(
        (
            await fetch(`${base}/api/revision`, {
                headers: { ...headers, origin: "https://example.com" },
            })
        ).status,
        403
    );
    const invalidHostStatus = await new Promise<number | undefined>((resolve, reject) => {
        get(
            `${base}/api/revision`,
            { headers: { ...headers, host: "evil.example" } },
            (response) => {
                response.resume();
                resolve(response.statusCode);
            }
        ).on("error", reject);
    });
    assert.equal(invalidHostStatus, 403);
    assert.equal((await fetch(`${base}/api/revision`, { headers })).status, 200);
    assert.equal(
        (await fetch(`${base}/api/preview`, { method: "POST", headers, body: "{}" })).status,
        400
    );
    const imported = await fetch(`${base}/api/import`, {
        method: "POST",
        headers,
        body: JSON.stringify({ url: "https://example.com/nodes.txt" }),
    });
    const loaded = (await imported.json()) as { content: string };
    const response = await fetch(`${base}/api/preview`, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...request, content: loaded.content }),
    });
    assert.equal(response.status, 200);
    assert.equal(((await response.json()) as PreviewResult).stats.output, 2);
    assert.equal(imports, 1);
});

test("SSH-style TCP forwarding works with a different local port and preserves origin checks", async (t) => {
    const { server, token } = createPreviewServer();
    const sockets = new Set<Socket>();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const remote = server.address();
    assert.ok(remote && typeof remote === "object");
    const tunnel = createTunnel((client) => {
        const upstream = connect(remote.port, "127.0.0.1");
        for (const socket of [client, upstream]) {
            sockets.add(socket);
            socket.on("close", () => sockets.delete(socket));
        }
        client.on("error", () => upstream.destroy());
        upstream.on("error", () => client.destroy());
        client.pipe(upstream).pipe(client);
    });
    t.after(async () => {
        for (const socket of sockets) socket.destroy();
        server.closeAllConnections();
        await Promise.all([
            new Promise<void>((resolve) => server.close(() => resolve())),
            new Promise<void>((resolve) => tunnel.close(() => resolve())),
        ]);
    });
    await new Promise<void>((resolve) => tunnel.listen(0, "127.0.0.1", resolve));
    const local = tunnel.address();
    assert.ok(local && typeof local === "object");
    assert.notEqual(local.port, remote.port);
    const base = `http://127.0.0.1:${local.port}`;
    assert.equal((await fetch(base)).status, 200);
    assert.equal((await fetch(`${base}/app.js`)).status, 200);
    assert.equal((await fetch(`${base}/app.css`)).status, 200);
    const headers = { "x-preview-token": token, "content-type": "application/json", origin: base };
    assert.equal((await fetch(`${base}/api/revision`, { headers })).status, 200);
    const response = await fetch(`${base}/api/preview`, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...request, content: "香港 A\n香港 B" }),
    });
    assert.equal(response.status, 200);
    assert.equal(((await response.json()) as PreviewResult).stats.output, 2);
    assert.equal(
        (
            await fetch(`${base}/api/revision`, {
                headers: { ...headers, origin: `http://127.0.0.1:${remote.port}` },
            })
        ).status,
        403
    );
});

test("shared weights hot-reload into preview node and group order", async (t) => {
    const root = copiedSources();
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const local = new PreviewEngine(root);
    const input = { ...request, content: "香港 A\n新加坡 A", rename: false, overrideArgs: "threshold=1" };
    const before = await local.preview(input);
    const file = path.join(root, "shared/preferences.ts");
    writeFileSync(file, readFileSync(file, "utf8").replace("新加坡: 20", "新加坡: 5"));
    const after = await local.preview(input);
    assert.notEqual(after.revision, before.revision);
    assert.deepEqual(after.config.proxies!.map((node) => node.name), ["新加坡 A", "香港 A"]);
    assert.deepEqual(getGroup(after.config, "手动选择").proxies, ["新加坡 A", "香港 A"]);
});
