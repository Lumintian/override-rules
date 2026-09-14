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
renameArgs.value = renameArgs.value.trim();
overrideArgs.value = overrideArgs.value.trim();
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

const renameParams: [string, string][] = [
    ["in=zh/en/flag/quan", "指定原节点名的地区格式；不传时自动识别"],
    ["out=zh/en/flag/quan", "指定输出地区格式；默认中文"],
    ["flag", "在节点名称前添加国旗"],
    ["blgd", "保留并规范常见倍率、IPLC、IEPL、家宽、游戏等标签"],
    ["bl", "从原名称中提取并保留倍率"],
    ["blkey=A+B>C", "保留指定关键词，也可将关键词替换为新名称"],
    ["nm", "保留无法识别地区的节点；默认会移除这些节点"],
    ["one", "单一节点地区不显示 01 序号"],
    ["name=名称", "添加自定义名称前缀"],
    ["nf", "将 name= 指定的前缀放在最前面"],
    ["fgf=", "设置名称字段之间的分隔符；默认空格"],
    ["sn=", "设置地区与序号之间的分隔符；默认空格"],
    ["clear", "移除套餐、到期、流量等信息类节点"],
    ["blpx", "按保留的倍率或线路标签进行分组排序"],
    ["blockquic=on/off", "设置节点的 block-quic 字段"],
];
const overrideParams: [string, string][] = [
    ["grouptype", "基础地区策略组类型：0=select、1=url-test、2=load-balance"],
    ["ipv6", "启用 IPv6；默认 false"],
    ["full", "生成完整 Mihomo 配置；默认 false"],
    ["keepalive", "启用 TCP Keep Alive；默认 false"],
    ["fakeip", "DNS 使用 Fake-IP；显式 false 时使用 RedirHost"],
    ["quic", "允许 UDP 443 / QUIC 流量；默认 false"],
    ["regex", "基础及额外地区组使用 include-all + filter；默认 false"],
    ["tun", "启用 TUN 模式；默认 false"],
    ["threshold", "某地区节点数量低于该值时不生成基础地区组；默认 2"],
    ["hk/mo/tw/sg/jp/kr/us/…", "对应地区的额外手动选择组数量，整数 0–100"],
];
const sampleRegions: { flag: string; code: string; city: string }[] = [
    { flag: "🇭🇰", code: "HK", city: "Kowloon" },
    { flag: "🇲🇴", code: "MO", city: "Taipa" },
    { flag: "🇹🇼", code: "TW", city: "Banqiao" },
    { flag: "🇯🇵", code: "JP", city: "Osaka" },
    { flag: "🇰🇷", code: "KR", city: "Busan" },
    { flag: "🇸🇬", code: "SG", city: "Jurong" },
    { flag: "🇺🇸", code: "US", city: "Denver" },
    { flag: "🇬🇧", code: "UK", city: "Manchester" },
    { flag: "🇩🇪", code: "DE", city: "Munich" },
    { flag: "🇫🇷", code: "FR", city: "Lyon" },
    { flag: "🇨🇦", code: "CA", city: "Calgary" },
];
const samplePlans = ["Lite", "Core", "Edge", "Relay", "Transit", "Lab"];
const sampleCarriers = ["NTT", "PCCW", "HE", "GTT", "Cogent", "Telia"];
const sampleRates = ["0.2x", "0.5x", "1x", "2x", "3x"];
const unknownSamples = ["🇻🇳 VN · Mekong", "🇧🇷 BR · Santos", "🇳🇬 NG · Lagos"];

function mulberry32(seed: number): () => number {
    return () => {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function pick<T>(random: () => number, items: T[]): T {
    return items[Math.floor(random() * items.length)];
}
function generateSample(): string {
    const random = mulberry32((Math.random() * 0xffffffff) >>> 0);
    const pool = [...sampleRegions];
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const chosen = pool.slice(0, 6 + Math.floor(random() * 3));
    const lines = [
        `剩余流量：Lab-${Math.floor(random() * 900 + 100)}GiB`,
        `套餐到期：2099-0${1 + Math.floor(random() * 9)}-15`,
    ];
    for (const region of chosen) {
        const copies = 1 + Math.floor(random() * 2);
        for (let i = 0; i < copies; i++) {
            const plan = pick(random, samplePlans);
            const carrier = pick(random, sampleCarriers);
            const rate = pick(random, sampleRates);
            lines.push(
                `${region.flag} ${region.code} · ${plan} ${region.city}〔${carrier} ${rate}〕`
            );
        }
    }
    lines.push(
        pick(random, unknownSamples) +
            `〔${pick(random, sampleCarriers)} ${pick(random, sampleRates)}〕`
    );
    return lines.join("\n");
}
function fillHelp(panel: HTMLElement, rows: [string, string][], note: string): void {
    const table = create("table");
    const head = create("thead");
    const hr = create("tr");
    hr.append(create("th", "", "参数"), create("th", "", "说明"));
    head.append(hr);
    const body = create("tbody");
    for (const [name, detail] of rows) {
        const tr = create("tr");
        const code = create("td");
        code.append(create("code", "", name));
        tr.append(code, create("td", "", detail));
        body.append(tr);
    }
    table.append(head, body);
    panel.replaceChildren(table, create("p", "help-note", note));
}
function bindHelp(
    triggerId: string,
    panelId: string,
    rows: [string, string][],
    note: string
): void {
    const trigger = element<HTMLButtonElement>(triggerId);
    const panel = element(panelId);
    fillHelp(panel, rows, note);
    panel.tabIndex = -1;
    document.body.append(panel);
    const hoverable = () => matchMedia("(hover: hover) and (pointer: fine)").matches;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const place = () => {
        const rect = trigger.getBoundingClientRect();
        const gap = 8;
        const width = Math.min(360, Math.max(240, window.innerWidth - 24));
        const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
        panel.style.width = `${width}px`;
        panel.style.left = `${left}px`;
        panel.style.top = `${rect.bottom + gap}px`;
        panel.style.bottom = "auto";
        panel.style.maxHeight = `${Math.max(160, window.innerHeight - rect.bottom - gap - 12)}px`;
    };
    const setOpen = (open: boolean) => {
        clearTimeout(hideTimer);
        hideTimer = undefined;
        if (open) {
            for (const other of document.querySelectorAll<HTMLElement>(".help-panel")) {
                if (other !== panel) other.hidden = true;
            }
            for (const button of document.querySelectorAll<HTMLButtonElement>(".help-trigger")) {
                if (button !== trigger) button.setAttribute("aria-expanded", "false");
            }
        }
        trigger.setAttribute("aria-expanded", String(open));
        if (open) {
            panel.style.visibility = "hidden";
            panel.hidden = false;
            place();
            panel.style.visibility = "";
        } else {
            panel.hidden = true;
        }
    };
    const scheduleClose = () => {
        if (!hoverable()) return;
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => setOpen(false), 180);
    };
    trigger.addEventListener("click", (event) => {
        event.stopPropagation();
        if (hoverable() && !panel.hidden) return;
        setOpen(Boolean(panel.hidden));
    });
    trigger.addEventListener("pointerenter", () => {
        if (hoverable()) setOpen(true);
    });
    trigger.addEventListener("pointerleave", scheduleClose);
    panel.addEventListener("pointerenter", () => {
        if (hoverable()) setOpen(true);
    });
    panel.addEventListener("pointerleave", scheduleClose);
    trigger.addEventListener("focus", () => setOpen(true));
    trigger.addEventListener("blur", (event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && (panel.contains(next) || trigger.contains(next))) return;
        setOpen(false);
    });
    panel.addEventListener("blur", (event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && (panel.contains(next) || trigger.contains(next))) return;
        setOpen(false);
    });
    trigger.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            setOpen(false);
            trigger.blur();
        }
        if (event.key === "Tab" && !event.shiftKey && !panel.hidden) {
            event.preventDefault();
            panel.focus();
        }
    });
    panel.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
            trigger.focus();
        }
    });
    document.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Node)) return;
        if (!panel.contains(target) && !trigger.contains(target)) setOpen(false);
    });
    const onViewportChange = () => {
        if (!panel.hidden) place();
    };
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, { passive: true });
    element("input-panel").addEventListener("scroll", onViewportChange, { passive: true });
}

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
        台湾: "🇨🇳",
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
bindHelp(
    "rename-help",
    "rename-help-panel",
    renameParams,
    "与 rename.min.js 的 Fragment 参数一致。关闭“启用”可只预览覆写。"
);
bindHelp(
    "override-help",
    "override-help-panel",
    overrideParams,
    "布尔值可用 true/false 或 1/0。地区代码如 us=2、sg=1 生成额外手动组。"
);
element("load-sample").addEventListener("click", () => {
    input.value = generateSample();
    inputKind.value = "text";
    inputFormat.value = "auto";
    element("text-source").hidden = false;
    element("url-source").hidden = true;
    element("import-status").textContent = "已载入随机示例，不含真实订阅节点。";
    void runPreview();
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
