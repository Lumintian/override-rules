import type { ProxyGroup } from "../../../src/types";
import type { PreviewRequest, PreviewResult } from "../types";

function element<T extends HTMLElement = HTMLElement>(id: string): T {
    const node = document.getElementById(id);
    if (!node) throw new Error(`Missing element: ${id}`);
    return node as T;
}
function create<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className = "",
    text?: string
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

const token = document.querySelector<HTMLMetaElement>('meta[name="preview-token"]')!.content;
const input = element<HTMLTextAreaElement>("node-input");
const inputKind = element<HTMLSelectElement>("input-kind");
const inputFormat = element<HTMLSelectElement>("input-format");
const sourceUrl = element<HTMLInputElement>("source-url");
const renameArgs = element<HTMLTextAreaElement>("rename-args");
const overrideArgs = element<HTMLTextAreaElement>("override-args");
const renameEnabled = element<HTMLInputElement>("enable-rename");
const autoPreview = element<HTMLInputElement>("auto-preview");
const search = element<HTMLInputElement>("search");
const runButton = element<HTMLButtonElement>("run-preview");
const tabs = [...document.querySelectorAll<HTMLButtonElement>("[data-view]")];
let result: PreviewResult | undefined;
let view = "groups";
let loadedUrl = "";
let revision = "";
let request: AbortController | undefined;
let debounce: ReturnType<typeof setTimeout> | undefined;
let nameLimit = 150;
const selected = new Map<string, string>();
const expanded = new Map<string, boolean>();
let groupMap = new Map<string, ProxyGroup>();

const sample = `剩余流量：示例流量
套餐到期：示例日期
🇭🇰 𝐇𝐊 · Plus〔4837/CMI/163 2x〕
🇭🇰 𝐇𝐊 · BGP〔4837/CMI/163 2x〕
🇭🇰 𝐇𝐊 · HKT 禁直连
🇲🇴 𝐌𝐎 · One〔4837/CMI/163 2x〕
🇹🇼 𝐓𝐖 · BGP〔4837/CMI/163 2x〕
🇹🇼 𝐓𝐖 · Hinat 禁直连
🇯🇵 𝐉𝐏 · Spark〔SoftBank 0.5x〕
🇯🇵 𝐉𝐏 · B〔4837/CMI/163 2x〕
🇰🇷 𝐊𝐑 · GMP〔4837/CMI/163 1x〕
🇸🇬 𝐒𝐆 · Standard〔4837/CMIN2/163 2x〕
🇸🇬 𝐒𝐆 · Evo〔4837/CMIN2/163 2x〕
🇺🇸 𝐔𝐒 · LA〔4837 0.5x〕
🇺🇸 𝐔𝐒 · SJC〔4837 0.5x〕
🇺🇸 𝐔𝐒 · LosAngeles〔Standard 0.01x〕
🇻🇳 𝐕𝐍 · TOT〔Standard 0.1x〕`;

async function api<T>(route: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const response = await fetch(route, {
        method: body === undefined ? "GET" : "POST",
        headers: {
            "x-preview-token": token,
            ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal,
    });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error ?? "请求失败，请刷新页面重试。");
    return value as T;
}

function matching(text: string): boolean {
    return text.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase());
}
function pathFor(name: string, seen = new Set<string>()): string {
    if (seen.has(name)) return `${name}（循环引用）`;
    const group = groupMap.get(name);
    if (!group) return name;
    if (group.type !== "select") return `${name}（${group.type}，未运行）`;
    seen.add(name);
    const next = selected.get(name);
    return next ? `${name} → ${pathFor(next, seen)}` : `${name}（无成员）`;
}
function refreshSelections(): void {
    for (const node of document.querySelectorAll<HTMLElement>("[data-selection-path]")) {
        const name = node.dataset.selectionPath!;
        node.textContent =
            groupMap.get(name)?.type === "select"
                ? `模拟：${pathFor(name)}`
                : "仅展示候选节点 · 无实时延迟 / 负载状态";
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>("button[data-member]")) {
        if (!button.disabled)
            button.setAttribute(
                "aria-pressed",
                String(selected.get(button.dataset.group!) === button.dataset.member)
            );
    }
}
function iconFor(name: string): string {
    const regions: Record<string, string> = {
        香港: "🇭🇰",
        澳门: "🇲🇴",
        台湾: "🇹🇼",
        美国: "🇺🇸",
        日本: "🇯🇵",
        新加坡: "🇸🇬",
        韩国: "🇰🇷",
        英国: "🇬🇧",
        德国: "🇩🇪",
        法国: "🇫🇷",
        加拿大: "🇨🇦",
    };
    return (
        Object.entries(regions).find(([country]) => name.startsWith(country))?.[1] ??
        (name.includes("额外") ? "⊕" : "◇")
    );
}

function renderGroups(): void {
    const grid = element("group-grid");
    grid.replaceChildren();
    if (!result) return;
    for (const [index, group] of (result.config["proxy-groups"] ?? []).entries()) {
        const all = result.members[group.name] ?? [];
        if (!matching(group.name) && !all.some(matching)) continue;
        const details = create("details", "group-card");
        details.open = expanded.get(group.name) ?? index < 4;
        const summary = create("summary");
        const title = create("span", "group-title");
        title.append(
            create("strong", "", group.name),
            create("small", "", `${all.length} 个候选项`)
        );
        summary.append(
            create("span", "group-icon", iconFor(group.name)),
            title,
            create("span", `type-badge ${group.type}`, group.type)
        );
        const body = create("div", "group-body");
        let limit = 20;
        const fill = () => {
            body.replaceChildren();
            const path = create("p", "selection-path");
            path.dataset.selectionPath = group.name;
            body.append(path);
            const list = create("div", "member-list");
            const names = matching(group.name) ? all : all.filter(matching);
            for (const name of names.slice(0, limit)) {
                const button = create("button", "member");
                button.type = "button";
                button.title = name;
                button.dataset.group = group.name;
                button.dataset.member = name;
                button.disabled = group.type !== "select";
                button.append(
                    create("span", "member-label", name),
                    create(
                        "span",
                        "member-kind",
                        groupMap.has(name)
                            ? "组"
                            : ["DIRECT", "REJECT", "REJECT-DROP"].includes(name)
                              ? "内置"
                              : "节点"
                    )
                );
                button.addEventListener("click", () => {
                    selected.set(group.name, name);
                    refreshSelections();
                });
                list.append(button);
            }
            body.append(list);
            if (!names.length) body.append(create("p", "hint", "当前输入没有匹配成员。"));
            if (names.length > limit) {
                const more = create(
                    "button",
                    "more-members",
                    `展开更多 · 还有 ${names.length - limit} 项`
                );
                more.type = "button";
                more.addEventListener("click", () => {
                    limit += 100;
                    fill();
                });
                body.append(more);
            }
            refreshSelections();
        };
        details.append(summary, body);
        grid.append(details);
        details.addEventListener("toggle", () => {
            expanded.set(group.name, details.open);
            if (details.open && !body.childElementCount) fill();
        });
        if (details.open) fill();
    }
    element("group-empty").hidden = grid.childElementCount > 0;
    refreshSelections();
}

function renderNames(): void {
    const rows = element("name-rows");
    rows.replaceChildren();
    const filtered =
        result?.changes.filter((row) => matching(row.before) || matching(row.after ?? "")) ?? [];
    for (const row of filtered.slice(0, nameLimit)) {
        const removed = row.after === null;
        const tr = create("tr", removed ? "removed" : "");
        tr.append(
            create("td", "", String(row.index)),
            create("td", "", row.before),
            create("td", "", row.after ?? "—")
        );
        const status = create("td");
        status.append(
            create(
                "span",
                `status-tag ${removed ? "removed" : ""}`,
                removed ? "脚本移除" : row.before === row.after ? "保留" : "已改名"
            )
        );
        if (row.country) status.append(create("span", "country-label", row.country));
        tr.append(status);
        rows.append(tr);
    }
    element("more-names").hidden = filtered.length <= nameLimit;
    element("name-empty").hidden = !result || filtered.length > 0;
}
function configText(): string {
    return result
        ? element<HTMLSelectElement>("config-format").value === "yaml"
            ? result.yaml
            : JSON.stringify(result.config, null, 2)
        : "";
}
function renderActive(): void {
    for (const tab of tabs) {
        const active = view === tab.dataset.view;
        tab.setAttribute("aria-selected", String(active));
        tab.tabIndex = active ? 0 : -1;
        element(`panel-${tab.dataset.view}`).hidden = !active || !result;
    }
    search.disabled = view === "config";
    if (view === "groups") renderGroups();
    else if (view === "names") renderNames();
    else element("config-output").textContent = configText();
}
function renderResult(value?: PreviewResult): void {
    result = value;
    if (!value) {
        element("name-rows").replaceChildren();
        element("config-output").textContent = "";
        element("group-grid").replaceChildren();
    }
    groupMap = new Map(value?.config["proxy-groups"]?.map((group) => [group.name, group]) ?? []);
    for (const [name, group] of groupMap) {
        const members = value!.members[name];
        if (group.type === "select" && !members.includes(selected.get(name) ?? "")) {
            if (members.length) selected.set(name, members[0]);
            else selected.delete(name);
        }
    }
    for (const key of ["input", "output", "removed", "groups"] as const)
        element(`stat-${key}`).textContent = value ? String(value.stats[key]) : "—";
    element("empty-state").hidden = Boolean(value);
    element("simulation-note").hidden = !value;
    element("diagnostics").hidden = !value?.warnings.length;
    element("diagnostic-title").textContent =
        `${value?.warnings.length ?? 0} 条预览提示 · 查看边界与分组诊断`;
    element("warning-list").replaceChildren(
        ...(value?.warnings ?? []).map((warning) => create("li", "", warning))
    );
    element("revision").textContent = value ? `源码 ${value.revision.slice(0, 8)}` : "等待预览";
    element<HTMLButtonElement>("copy-config").disabled = !value;
    element<HTMLButtonElement>("download-config").disabled = !value;
    renderActive();
}

async function runPreview(manual = false): Promise<void> {
    clearTimeout(debounce);
    request?.abort();
    const controller = new AbortController();
    request = controller;
    element("error").hidden = true;
    if (inputKind.value === "url" && !manual && loadedUrl !== sourceUrl.value.trim()) {
        element("result-status").textContent = "填写链接后，点击更新预览以导入。";
        return;
    }
    runButton.disabled = true;
    element("result-status").textContent = "执行当前源码…";
    try {
        if (inputKind.value === "url" && manual) {
            element("result-status").textContent = "读取链接内容…";
            const url = sourceUrl.value.trim();
            const loaded = await api<{ content: string }>(
                "/api/import",
                { url },
                controller.signal
            );
            input.value = loaded.content;
            loadedUrl = url;
            element("import-status").textContent =
                "链接已读取。自动预览使用本次内容；点击更新预览可重新导入。";
        }
        if (!input.value.trim()) {
            renderResult();
            element("result-status").textContent = "等待输入";
            return;
        }
        const body: PreviewRequest = {
            content: input.value,
            format: inputFormat.value as PreviewRequest["format"],
            rename: renameEnabled.checked,
            renameArgs: renameArgs.value,
            overrideArgs: overrideArgs.value,
        };
        const value = await api<PreviewResult>("/api/preview", body, controller.signal);
        if (controller.signal.aborted) return;
        revision = value.revision;
        renderResult(value);
        element("result-status").textContent =
            `已更新 ${new Date().toLocaleTimeString()} · 仅模拟配置`;
    } catch (error) {
        if (controller.signal.aborted) return;
        renderResult();
        element("error").hidden = false;
        element("error").textContent = error instanceof Error ? error.message : "预览失败。";
        element("result-status").textContent = "预览失败；修复输入或源码后重试。";
    } finally {
        if (request === controller) runButton.disabled = false;
    }
}
function changed(): void {
    request?.abort();
    runButton.disabled = false;
    clearTimeout(debounce);
    element("result-status").textContent = "输入已更改，等待更新。";
    if (autoPreview.checked) debounce = setTimeout(() => void runPreview(), 450);
}

for (const field of [input, renameArgs, overrideArgs]) field.addEventListener("input", changed);
for (const field of [inputFormat, renameEnabled]) field.addEventListener("change", changed);
autoPreview.addEventListener("change", () => {
    if (autoPreview.checked) changed();
    else clearTimeout(debounce);
});
sourceUrl.addEventListener("input", () => {
    loadedUrl = "";
    changed();
});
inputKind.addEventListener("change", () => {
    element("text-source").hidden = inputKind.value !== "text";
    element("url-source").hidden = inputKind.value !== "url";
    changed();
});
runButton.addEventListener("click", () => void runPreview(true));
element("load-sample").addEventListener("click", () => {
    input.value = sample;
    inputKind.value = "text";
    inputFormat.value = "auto";
    element("text-source").hidden = false;
    element("url-source").hidden = true;
    element("import-status").textContent = "";
    void runPreview();
});
element("extra-preset").addEventListener("click", () => {
    overrideArgs.value = "grouptype=1&threshold=2&us=2&sg=1";
    changed();
});
element("clear-input").addEventListener("click", () => {
    request?.abort();
    clearTimeout(debounce);
    runButton.disabled = false;
    input.value = "";
    sourceUrl.value = "";
    loadedUrl = "";
    selected.clear();
    expanded.clear();
    element("import-status").textContent = "";
    element("error").hidden = true;
    element("result-status").textContent = "已清空输入与预览";
    renderResult();
});
search.addEventListener("input", () => {
    nameLimit = 150;
    renderActive();
});
for (const tab of tabs) {
    tab.addEventListener("click", () => {
        view = tab.dataset.view!;
        renderActive();
    });
    tab.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const index =
            event.key === "Home"
                ? 0
                : event.key === "End"
                  ? tabs.length - 1
                  : (tabs.indexOf(tab) + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
                    tabs.length;
        tabs[index].click();
        tabs[index].focus();
    });
}
element("more-names").addEventListener("click", () => {
    nameLimit += 150;
    renderNames();
});
element("config-format").addEventListener("change", renderActive);
element("copy-config").addEventListener("click", async () => {
    if (!result) return;
    try {
        await navigator.clipboard.writeText(configText());
        element("result-status").textContent = "配置已复制，请注意其中的订阅凭据。";
    } catch {
        element("result-status").textContent = "无法访问剪贴板，请在配置文本中手动选择复制。";
    }
});
element("download-config").addEventListener("click", () => {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([configText()], { type: "text/plain;charset=utf-8" }));
    const link = create("a");
    link.href = url;
    link.download = `override-preview.${element<HTMLSelectElement>("config-format").value}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
});

async function watch(): Promise<void> {
    if (document.visibilityState === "hidden") return;
    try {
        const state = await api<{ revision: string }>("/api/revision");
        element("connection").textContent = "源码监听中";
        element("connection").classList.remove("offline");
        const previous = revision;
        revision = state.revision;
        if (previous && previous !== revision) {
            if (autoPreview.checked) void runPreview();
            else element("result-status").textContent = "源码已变更，点击更新预览。";
        }
    } catch {
        element("connection").textContent = "服务未连接 / 请刷新";
        element("connection").classList.add("offline");
    }
}
renderResult();
void watch();
setInterval(() => void watch(), 1500);
