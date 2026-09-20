import { sourceRevision } from "./revision";
import path from "node:path";
import vm from "node:vm";
import { build } from "esbuild";
import { stringify } from "yaml";
import type { ClashConfig, ProxyNode } from "../../src/types";
import { duplicateNames, parseArguments, parseInput } from "./input";
import type { NameChange, PreviewRequest, PreviewResult } from "./types";

interface CompiledSources {
    revision: string;
    rename: string;
    override: string;
}

interface ClassifiedOutput {
    config: ClashConfig;
    countries: Record<string, ProxyNode[]>;
    threshold: number;
    suffix: string;
}

function execute<T>(
    code: string,
    expression: string,
    input: ClashConfig,
    args: Record<string, string | boolean>
): T {
    // 只执行仓库内的可信源码。JSON 输入不会拼接到可执行代码中；VM 不是通用安全沙箱。
    const sandbox = { $arguments: args, __input: JSON.stringify(input), __result: "" };
    vm.runInNewContext(`${code}\n${expression}`, sandbox, {
        timeout: 2000,
        contextCodeGeneration: { strings: false, wasm: false },
    });
    return JSON.parse(sandbox.__result) as T;
}

function matcher(pattern: string): RegExp {
    return new RegExp(pattern.replace(/^\(\?i\)/, ""), pattern.startsWith("(?i)") ? "i" : "");
}

export function resolveMembers(config: ClashConfig, warnings: string[]): Record<string, string[]> {
    const members: Record<string, string[]> = Object.create(null);
    for (const group of config["proxy-groups"] ?? []) {
        let dynamic = group["include-all"] ? (config.proxies ?? []).map((node) => node.name) : [];
        try {
            if (group.filter) {
                const include = matcher(group.filter);
                dynamic = dynamic.filter((name) => include.test(name));
            }
            if (group["exclude-filter"]) {
                const exclude = matcher(group["exclude-filter"]);
                dynamic = dynamic.filter((name) => !exclude.test(name));
            }
        } catch {
            dynamic = [];
            warnings.push(
                `${group.name} 的正则无法在 JavaScript 中模拟，请以 Mihomo 实际结果为准。`
            );
        }
        members[group.name] = [...new Set([...(group.proxies ?? []), ...dynamic])];
    }
    return members;
}

export class PreviewEngine {
    private compiled?: Promise<CompiledSources>;
    private compiledRevision = "";
    private readonly root: string;

    constructor(root: string) {
        this.root = root;
    }

    revision(): string {
        return sourceRevision(this.root);
    }

    private sources(renameEnabled: boolean): Promise<CompiledSources> {
        const revision = this.revision();
        const cacheKey = `${revision}:${renameEnabled}`;
        if (!this.compiled || this.compiledRevision !== cacheKey) {
            this.compiledRevision = cacheKey;
            const options = {
                bundle: true,
                write: false as const,
                platform: "neutral" as const,
                format: "iife" as const,
                logLevel: "silent" as const,
            };
            this.compiled = Promise.all([
                renameEnabled
                    ? build({
                          ...options,
                          entryPoints: [path.join(this.root, "scripts/substore/rename.ts")],
                      })
                    : Promise.resolve(null),
                build({
                    ...options,
                    globalName: "PreviewCore",
                    stdin: {
                        contents: `import "./src/main.ts"; export { parseCountries, parseNodesByLanding } from "./src/node_parser.ts"; export { buildFeatureFlags } from "./src/args.ts"; export { PROXY_GROUPS, NODE_SUFFIX } from "./src/constants.ts";`,
                        resolveDir: this.root,
                        sourcefile: "preview-core.ts",
                        loader: "ts",
                    },
                }),
            ]).then(([rename, override]) => ({
                revision,
                rename: rename?.outputFiles[0].text ?? "",
                override: override.outputFiles[0].text,
            }));
        }
        return this.compiled;
    }

    async preview(request: PreviewRequest): Promise<PreviewResult> {
        const { config: input, namesOnly } = parseInput(request.content, request.format);
        const renameArgs = request.rename ? parseArguments(request.renameArgs, true) : {};
        const overrideArgs = parseArguments(request.overrideArgs);
        const sources = await this.sources(request.rename);
        let renamed: { config: ClashConfig; changes: NameChange[] };
        try {
            renamed = execute(
                sources.rename,
                `
                const input = JSON.parse(__input);
                const original = input.proxies.slice();
                const names = original.map(node => node.name);
                // Enumerable Symbol survives the renamer's object spreads, but never enters JSON/config.
                const marker = Symbol("preview-origin");
                original.forEach((node, index) => { node[marker] = index; });
                const nodes = ${request.rename ? "operator(input.proxies)" : "input.proxies"};
                if (nodes.some(node => !Number.isInteger(node[marker]))) throw new Error("无法追踪改名后的节点，请检查预览适配层。");
                const survivors = new Map(nodes.map(node => [node[marker], node.name]));
                nodes.forEach(node => { delete node[marker]; });
                __result = JSON.stringify({
                    config: { ...input, proxies: nodes },
                    changes: original.map((node, index) => ({ index: index + 1, before: names[index], after: survivors.get(index) ?? null }))
                });`,
                input,
                renameArgs
            );
        } catch (error) {
            throw new Error(
                `改名脚本执行失败：${error instanceof Error ? error.message : String(error)}`
            );
        }
        let output: ClassifiedOutput;
        try {
            output = execute(
                sources.override,
                `
                const input = JSON.parse(__input);
                const config = main(input);
                const parsedLanding = PreviewCore.parseNodesByLanding(config.proxies);
                const nodes = parsedLanding.landingChains.length > 0 && parsedLanding.nonLandingNodes.length > 0 ? parsedLanding.nonLandingNodes : config.proxies;
                __result = JSON.stringify({ config, countries: PreviewCore.parseCountries(nodes), threshold: PreviewCore.buildFeatureFlags($arguments).countryThreshold, suffix: PreviewCore.NODE_SUFFIX });
            `,
                renamed.config,
                overrideArgs
            );
        } catch (error) {
            throw new Error(
                `覆写脚本执行失败：${error instanceof Error ? error.message : String(error)}`
            );
        }
        const { config, countries, threshold, suffix } = output;
        const nodes = config.proxies ?? [];
        const groups = config["proxy-groups"] ?? [];
        const warnings: string[] = [];
        if (!nodes.length)
            warnings.push("改名后没有保留节点，请检查改名过滤参数；下方仍显示被移除的原始名称。");
        if (namesOnly)
            warnings.push(
                "名称模式只预览命名与分组，不包含协议凭据，也无法判断链式代理或 Tailscale 属性。"
            );
        if ("proxy-providers" in input)
            warnings.push("只处理输入配置的 proxies 数组，不下载或展开 proxy-providers。");
        if (!namesOnly && nodes.some((node) => !node.type))
            warnings.push(
                "配置中部分节点缺少 type 等连接信息；这里只展示结构，不保证生成配置可连接。"
            );
        const byName = new Map<string, string>();
        for (const [country, candidates] of Object.entries(countries)) {
            for (const node of candidates) byName.set(node.name, country);
            if (!groups.some((group) => group.name === `${country}${suffix}`)) {
                warnings.push(
                    `${country}：${candidates.length} 个候选节点，未达到 threshold=${threshold}，不生成基础地区组；已指定的额外组不受此限制。`
                );
            }
        }
        for (const row of renamed.changes)
            if (row.after !== null) row.country = byName.get(row.after);
        const unknown = nodes.filter(
            (node) =>
                !byName.has(node.name) &&
                !/^前置代理(?:[A-Z])?$/.test(String(node["dialer-proxy"] ?? "")) &&
                node.type !== "tailscale"
        );
        if (unknown.length) {
            const shown = unknown.slice(0, 8).map((node) => node.name);
            const extra = unknown.length > shown.length ? ` 等共 ${unknown.length} 个` : "";
            warnings.push(
                `${unknown.length} 个节点未识别到覆写脚本支持的地区，仍保留在手动选择中：${shown.join("、")}${extra}`
            );
        }
        const duplicates = duplicateNames(nodes);
        if (duplicates.length)
            warnings.push(
                `存在 ${duplicates.length} 个重复节点名称，Mihomo 需要唯一名称，请调整改名参数。`
            );
        if (groups.some((group) => nodes.some((node) => node.name === group.name)))
            warnings.push("节点名称与策略组名称冲突，实际配置可能无法加载，请调整节点命名。");
        if (groups.some((group) => group.filter))
            warnings.push(
                "正则组成员按当前名称使用 JavaScript 近似模拟，不是 Mihomo 运行结果；独立正则可能跨组匹配，实际成员顺序也可能不同。"
            );
        const members = resolveMembers(config, warnings);
        const known = new Set([
            ...nodes.map((node) => node.name),
            ...groups.map((group) => group.name),
            "DIRECT",
            "REJECT",
            "REJECT-DROP",
        ]);
        const invalid = groups.filter((group) =>
            members[group.name].some((name) => name === group.name || !known.has(name))
        );
        if (invalid.length)
            warnings.push(`${invalid.length} 个策略组存在缺失或自引用成员，请检查生成配置。`);
        return {
            revision: sources.revision,
            config,
            yaml: stringify(config, { indent: 2 }),
            changes: renamed.changes,
            members,
            warnings,
            stats: {
                input: input.proxies!.length,
                output: nodes.length,
                removed: renamed.changes.filter((row) => row.after === null).length,
                groups: groups.length,
            },
        };
    }
}
