import assert from "node:assert/strict";
import path from "node:path";
import vm from "node:vm";
import { buildSync } from "esbuild";
import type { ClashConfig, ProxyGroup } from "../../src/types";

const code = buildSync({
    entryPoints: [path.resolve(__dirname, "../../src/main.ts")],
    bundle: true,
    write: false,
    platform: "neutral",
    format: "iife",
}).outputFiles[0].text;

export function convert(config: ClashConfig, args: Record<string, unknown> = {}): ClashConfig {
    const sandbox: {
        $arguments: Record<string, unknown>;
        main?: (config: ClashConfig) => ClashConfig;
    } = { $arguments: args };
    vm.runInNewContext(code, sandbox);
    assert.equal(typeof sandbox.main, "function");
    // Normalize VM objects to this realm for strict deep equality assertions.
    return JSON.parse(JSON.stringify(sandbox.main!(config))) as ClashConfig;
}

export function getGroup(config: ClashConfig, name: string): ProxyGroup {
    const group = config["proxy-groups"]?.find((item) => item.name === name);
    assert.ok(group, `Missing proxy group: ${name}`);
    return group;
}

export function assertValidReferences(config: ClashConfig): void {
    const names = new Set([
        "DIRECT",
        "REJECT",
        "REJECT-DROP",
        ...(config.proxies ?? []).map((node) => node.name),
        ...(config["proxy-groups"] ?? []).map((group) => group.name),
    ]);
    for (const group of config["proxy-groups"] ?? []) {
        for (const provider of group.use ?? []) {
            assert.ok(
                Object.hasOwn(config["proxy-providers"] ?? {}, provider),
                `${group.name} references missing provider: ${provider}`
            );
        }
        for (const name of group.proxies ?? []) {
            assert.ok(names.has(name), `${group.name} references missing proxy: ${name}`);
            assert.notEqual(name, group.name, `${group.name} references itself`);
        }
    }
}
