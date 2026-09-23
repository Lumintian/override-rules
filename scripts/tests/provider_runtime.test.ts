import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { stringify } from "yaml";
import { main } from "../../src/main";
import { prepareProvider } from "../../src/proxy_providers";
import type { ProxyNode } from "../../src/types";

// Opt-in only: no automatic binary downloads, Internet subscription access or production controller.
for (const mixed of [false, true])
    test(
        `Mihomo refreshes provider regions and chains without reloading (${mixed ? "mixed" : "provider-only"})`,
        { skip: !process.env.MIHOMO_BIN, timeout: 30000 },
        async (t) => {
            const node = (name: string): ProxyNode => ({
                name,
                type: "ss",
                server: "127.0.0.1",
                port: 9,
                cipher: "aes-128-gcm",
                password: "test-only",
            });
            const landing = (name: string, id: string): ProxyNode => ({
                ...node(name),
                "dialer-proxy": `前置代理${id}`,
            });
            const initial = [
                node("香港 old A"),
                node("香港 old B"),
                node("美国 old"),
                landing("美国 old 中转 01", ""),
                landing("香港 old 中转A 01", "A"),
                landing("美国 old 中转B 01", "B"),
                landing("德国 old 中转Z 01", "Z"),
            ];
            const explicit = mixed ? [landing("台湾 explicit landing", "E")] : [];
            let nodes = initial;
            const source = createServer((_request, response) =>
                response.end(stringify({ proxies: nodes }))
            );
            source.listen(0, "127.0.0.1");
            await once(source, "listening");
            t.after(() => source.close());
            const sourceAddress = source.address();
            assert.ok(sourceAddress && typeof sourceAddress === "object");
            const portProbe = createServer();
            portProbe.listen(0, "127.0.0.1");
            await once(portProbe, "listening");
            const address = portProbe.address();
            assert.ok(address && typeof address === "object");
            await new Promise<void>((resolve) => portProbe.close(() => resolve()));
            const controller = `http://127.0.0.1:${address.port}`;
            const root = await mkdtemp(path.join(tmpdir(), "override-mihomo-"));
            t.after(() => rm(root, { recursive: true, force: true }));
            const args = {
                providerurl: `http://127.0.0.1:${sourceAddress.port}/provider.yaml`,
                grouptype: "0",
                us: "1",
                front: "hk",
                front_a: "hk",
                front_b: "us",
                front_e: "hk",
                front_z: "sg",
            };
            const config = main(prepareProvider({ proxies: explicit }, args), args, initial);
            const providerName = Object.keys(config["proxy-providers"]!)[0];
            config["proxy-providers"]![providerName]["health-check"] = { enable: false };
            // Isolate proxy-provider/group behavior from unrelated geodata/rule downloads and TUN privileges.
            const text = stringify({
                ...config,
                "external-controller": `127.0.0.1:${address.port}`,
                rules: ["MATCH,选择代理"],
                "rule-providers": {},
                "geox-url": {},
                "geodata-mode": false,
                dns: { enable: false },
                tun: { enable: false },
                sniffer: { enable: false },
            });
            const file = path.join(root, "config.yaml");
            await writeFile(file, text);
            const child = spawn(process.env.MIHOMO_BIN!, ["-d", root, "-f", file], {
                stdio: ["ignore", "pipe", "pipe"],
            });
            let log = "";
            child.stdout.on("data", (data) => {
                log = (log + data).slice(-8000);
            });
            child.stderr.on("data", (data) => {
                log = (log + data).slice(-8000);
            });
            child.on("error", (error) => {
                log += error.message;
            });
            t.after(async () => {
                if (child.exitCode === null && child.pid) {
                    const exited = once(child, "exit");
                    child.kill();
                    await exited;
                }
            });
            async function members(name: string): Promise<string[]> {
                const response = await fetch(`${controller}/proxies/${encodeURIComponent(name)}`, {
                    signal: AbortSignal.timeout(1000),
                });
                if (!response.ok) throw new Error(`controller status ${response.status}`);
                return ((await response.json()) as { all: string[] }).all;
            }
            async function waitFor(expected: string): Promise<string[]> {
                for (let attempt = 0; attempt < 100; attempt++) {
                    try {
                        const all = await members("香港节点");
                        if (all.includes(expected)) return all;
                    } catch {
                        /* wait for startup/provider initialization */
                    }
                    if (child.exitCode !== null) break;
                    await delay(100);
                }
                assert.fail(`Mihomo did not expose expected members. ${log}`);
            }
            assert.deepEqual(await waitFor("香港 old A"), ["香港 old A", "香港 old B"]);
            for (const name of ["前置代理", "前置代理A", ...(mixed ? ["前置代理E"] : [])]) {
                assert.deepEqual(await members(name), ["香港 old A", "香港 old B"]);
                const state = (await (
                    await fetch(`${controller}/proxies/${encodeURIComponent(name)}`)
                ).json()) as { now: string };
                assert.equal(
                    state.now,
                    "香港 old A",
                    "front must not default to DIRECT ahead of provider candidates"
                );
            }
            assert.deepEqual(await members("前置代理B"), ["美国 old"]);
            assert.deepEqual(await members("落地节点"), ["美国 old 中转 01"]);
            assert.deepEqual(await members("落地节点A"), ["香港 old 中转A 01"]);
            assert.deepEqual(await members("落地节点B"), ["美国 old 中转B 01"]);
            assert.deepEqual(
                await members("前置代理Z"),
                ["COMPATIBLE"],
                "empty mappings use Mihomo's fallback, never landings"
            );
            if (mixed) assert.deepEqual(await members("落地节点E"), ["台湾 explicit landing"]);
            nodes = [
                node("香港 new A"),
                node("香港 new B"),
                node("日本 new"),
                node("US new"),
                node("美属萨摩亚 new"),
                node("unknown new"),
                landing("Airport2 US 中转 99", ""),
                landing("Airport2 香港 中转A 88", "A"),
                landing("Airport2 香港 extra 中转A 55", "A"),
                landing("Airport2 US 中转B 77", "B"),
                landing("Airport2 德国 中转Z 66", "Z"),
            ];
            const refreshed = await fetch(`${controller}/providers/proxies/${providerName}`, {
                method: "PUT",
                signal: AbortSignal.timeout(3000),
            });
            assert.ok(refreshed.ok, `provider refresh failed: ${log}`);
            assert.deepEqual(await waitFor("香港 new A"), ["香港 new A", "香港 new B"]);
            assert.deepEqual(
                await members("美国额外1"),
                ["US new"],
                "include/exclude filters apply to updated provider names"
            );
            assert.deepEqual(await members("前置代理"), ["香港 new A", "香港 new B"]);
            assert.deepEqual(await members("前置代理A"), ["香港 new A", "香港 new B"]);
            assert.deepEqual(await members("前置代理B"), ["US new"]);
            assert.deepEqual(await members("落地节点"), ["Airport2 US 中转 99"]);
            assert.deepEqual(await members("落地节点A"), [
                "Airport2 香港 中转A 88",
                "Airport2 香港 extra 中转A 55",
            ]);
            assert.deepEqual(await members("落地节点B"), ["Airport2 US 中转B 77"]);
            if (mixed) {
                assert.deepEqual(await members("前置代理E"), ["香港 new A", "香港 new B"]);
                assert.deepEqual(await members("落地节点E"), ["台湾 explicit landing"]);
            }
            assert.deepEqual(
                await members("手动选择"),
                [...explicit, ...nodes].map((item) => item.name)
            );
            assert.ok((await members("选择代理")).includes("手动选择"));
            assert.ok((await members("GLOBAL")).includes("unknown new"));
            const missing = await fetch(`${controller}/proxies/${encodeURIComponent("日本节点")}`);
            assert.equal(missing.status, 404, "new countries must not magically create new groups");
            const missingChain = await fetch(
                `${controller}/proxies/${encodeURIComponent("前置代理C")}`
            );
            assert.equal(missingChain.status, 404, "chain topology is fixed at generation time");
            nodes = nodes.filter((item) => item["dialer-proxy"] !== "前置代理A");
            const removed = await fetch(`${controller}/providers/proxies/${providerName}`, {
                method: "PUT",
                signal: AbortSignal.timeout(3000),
            });
            assert.ok(removed.ok);
            assert.deepEqual(
                await members("落地节点A"),
                ["COMPATIBLE"],
                "removing members does not remove the generated chain group"
            );
            assert.deepEqual(await members("前置代理A"), ["香港 new A", "香港 new B"]);
            assert.equal(
                await readFile(file, "utf8"),
                text,
                "main config was not rewritten/reloaded"
            );
        }
    );
