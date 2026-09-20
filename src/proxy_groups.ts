import { CDN_URL, SPEEDTEST_URL, NODE_SUFFIX, PROXY_GROUPS, countriesMeta } from "./constants";
import { getActiveCountryNames } from "./node_parser";
import type {
    BuildCountryGroupsInput,
    BuildProxyGroupsInput,
    GroupType,
    ProxyGroup,
} from "./types";
import { isNotNull } from "./utils";

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface BuildGroupByTypeInput {
    name: string;
    icon: string;
    groupType: GroupType;
    nodeSource: Pick<ProxyGroup, "proxies" | "include-all" | "filter" | "exclude-filter">;
}

/**
 * 根据代理组类型生成对应的代理组配置。
 * 将 groupType 映射为具体的类型字段（select/url-test/load-balance），
 * 并与节点来源字段合并，消除各处重复的 switch 逻辑。
 */
function buildGroupByType({
    name,
    icon,
    groupType,
    nodeSource,
}: BuildGroupByTypeInput): ProxyGroup {
    switch (groupType) {
        case 0:
            return { name, icon, type: "select", ...nodeSource };
        case 1:
            return {
                name,
                icon,
                type: "url-test",
                url: SPEEDTEST_URL,
                interval: 60,
                tolerance: 20,
                ...nodeSource,
            };
        case 2:
            return {
                name,
                icon,
                type: "load-balance",
                strategy: "sticky-sessions",
                url: SPEEDTEST_URL,
                interval: 60,
                tolerance: 20,
                ...nodeSource,
            };
    }
}

/**
 * 生成基础地区组和手动指定的额外 select 组，统一节点来源及排列顺序。
 * 基础组遵循 threshold；额外组仅要求该地区至少有一个候选节点。
 */
export function buildCountryGroups({
    regexFilter,
    groupType,
    countryNames,
    countryNodes,
    countryExtraCounts,
    excludedNodeNames,
}: BuildCountryGroupsInput): ProxyGroup[] {
    return getActiveCountryNames(countryNodes, 1).flatMap((country) => {
        const meta = countriesMeta[country];
        const nodeSource: BuildGroupByTypeInput["nodeSource"] = regexFilter
            ? {
                  "include-all": true,
                  filter: meta.pattern,
                  ...(excludedNodeNames.length > 0
                      ? {
                            "exclude-filter": [
                                ...excludedNodeNames.map((name) => `^${escapeRegex(name)}$`),
                                meta.excludePattern,
                            ]
                                .filter(Boolean)
                                .map((pattern) => `(?:${pattern})`)
                                .join("|"),
                        }
                      : meta.excludePattern
                        ? { "exclude-filter": meta.excludePattern }
                        : {}),
              }
            : { proxies: countryNodes[country].map((node) => node.name).filter(isNotNull) };
        const groups: ProxyGroup[] = [];
        if (countryNames.includes(country)) {
            groups.push(
                buildGroupByType({
                    name: `${country}${NODE_SUFFIX}`,
                    icon: meta.icon,
                    groupType,
                    nodeSource,
                })
            );
        }
        const extraCount = countryExtraCounts[country] ?? 0;
        for (let index = 1; index <= extraCount; index += 1) {
            groups.push({
                name: `${country}额外${index}`,
                icon: meta.icon,
                type: "select",
                ...nodeSource,
            });
        }
        return groups;
    });
}

/**
 * 生成所有代理组配置，包含已构建的基础地区组和额外地区组。
 * @param input - 构建代理组所需的输入参数（详见 BuildProxyGroupsInput）
 * @returns 代理组配置数组
 */
export function buildProxyGroups({
    manualNodes,
    countryNames,
    countryGroups,
    tailscaleNodes,
    landingChains,
    defaultProxies,
    defaultProxiesDirect,
    defaultSelector,
    frontProxySelectors,
}: BuildProxyGroupsInput): ProxyGroup[] {
    const hasTW = countryNames.includes("台湾");
    const hasHK = countryNames.includes("香港");
    const hasTailscale = tailscaleNodes.length > 0;
    const countryGroupNames = (country: string): string[] =>
        countryGroups
            .filter(
                ({ name }) =>
                    name === `${country}${NODE_SUFFIX}` || name.startsWith(`${country}额外`)
            )
            .map(({ name }) => name);
    const groups: Array<ProxyGroup | null> = [
        {
            name: PROXY_GROUPS.SELECT,
            icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Proxy.png`,
            type: "select",
            proxies: defaultSelector,
        },
        manualNodes.length > 0
            ? {
                  name: PROXY_GROUPS.MANUAL,
                  icon: `${CDN_URL}/gh/shindgewongxj/WHATSINStash@master/icon/select.png`,
                  type: "select",
                  proxies: manualNodes,
              }
            : null,
        {
            name: PROXY_GROUPS.STABLE,
            icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Available.png`,
            type: "select",
            proxies: [PROXY_GROUPS.SELECT, ...defaultSelector],
        },
        {
            name: PROXY_GROUPS.MATCH,
            icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Final.png`,
            type: "select",
            proxies: [PROXY_GROUPS.SELECT, ...defaultSelector],
        },
        ...landingChains.flatMap((chain): ProxyGroup[] => [
            {
                name: chain.frontGroupName,
                icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Area.png`,
                type: "select",
                proxies: frontProxySelectors[chain.id] ?? ["DIRECT"],
            },
            {
                name: chain.landingGroupName,
                icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Airport.png`,
                type: "select",
                proxies: chain.nodes.map((node) => node.name).filter(isNotNull),
            },
        ]),
        {
            name: PROXY_GROUPS.STATIC_RESOURCES,
            icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Cloudflare.png`,
            type: "select",
            proxies: defaultProxies,
        },
        {
            name: PROXY_GROUPS.XAI,
            icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Bot.png`,
            type: "select",
            proxies: defaultProxies,
        },
        {
            name: PROXY_GROUPS.CHATGPT,
            icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/ChatGPT.png`,
            type: "select",
            proxies: defaultProxies,
        },
        {
            name: PROXY_GROUPS.AI_SERVICE,
            icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/ChatGPT.png`,
            type: "select",
            proxies: defaultProxies,
        },
        {
            name: PROXY_GROUPS.CRYPTO,
            icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Cryptocurrency_1.png`,
            type: "select",
            proxies: defaultProxies,
        },
        {
            name: PROXY_GROUPS.FINANCE,
            icon: `${CDN_URL}/gh/Lumintian/override-rules@main/icons/Nasdaq.png`,
            type: "select",
            proxies: defaultProxiesDirect,
        },
        {
            name: PROXY_GROUPS.APPLE,
            icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Apple_2.png`,
            type: "select",
            proxies: defaultProxies,
        },
        {
            name: PROXY_GROUPS.GOOGLE,
            icon: `${CDN_URL}/gh/Orz-3/mini@master/Color/Google.png`,
            type: "select",
            proxies: defaultProxies,
        },
        {
            name: PROXY_GROUPS.MICROSOFT,
            icon: `${CDN_URL}/gh/Lumintian/override-rules@main/icons/Microsoft_Copilot.png`,
            type: "select",
            proxies: defaultProxies,
        },
        {
            name: PROXY_GROUPS.XBOX,
            icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Xbox.png`,
            type: "select",
            proxies: defaultProxies,
        },
        {
            name: PROXY_GROUPS.GITHUB,
            icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/GitHub.png`,
            type: "select",
            proxies: defaultProxies,
        },
        {
            name: PROXY_GROUPS.BILIBILI,
            icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/bilibili.png`,
            type: "select",
            proxies:
                hasTW && hasHK
                    ? ["DIRECT", ...countryGroupNames("台湾"), ...countryGroupNames("香港")]
                    : defaultProxiesDirect,
        },
        {
            name: PROXY_GROUPS.BAHAMUT,
            icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Bahamut.png`,
            type: "select",
            proxies: hasTW
                ? [
                      ...countryGroupNames("台湾"),
                      PROXY_GROUPS.SELECT,
                      ...(manualNodes.length > 0 ? [PROXY_GROUPS.MANUAL] : []),
                      "DIRECT",
                  ]
                : defaultProxies,
        },
        {
            name: PROXY_GROUPS.YOUTUBE,
            icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/YouTube.png`,
            type: "select",
            proxies: defaultProxies,
        },
        {
            name: PROXY_GROUPS.TIKTOK,
            icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/TikTok.png`,
            type: "select",
            proxies: defaultProxies,
        },
        {
            name: PROXY_GROUPS.TELEGRAM,
            icon: `${CDN_URL}/gh/Lumintian/override-rules@main/icons/Telegram.png`,
            type: "select",
            proxies: defaultProxies,
        },
        {
            name: PROXY_GROUPS.TWITTER,
            icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Twitter.png`,
            type: "select",
            proxies: defaultProxies,
        },
        {
            name: PROXY_GROUPS.EHENTAI,
            icon: `${CDN_URL}/gh/Lumintian/override-rules@main/icons/Ehentai.png`,
            type: "select",
            proxies: defaultProxies,
        },
        {
            name: PROXY_GROUPS.PIKPAK,
            icon: `${CDN_URL}/gh/Lumintian/override-rules@main/icons/PikPak.png`,
            type: "select",
            proxies: defaultProxies,
        },
        hasTailscale
            ? {
                  name: PROXY_GROUPS.TAILSCALE,
                  icon: `${CDN_URL}/gh/Lumintian/override-rules@main/icons/Tailscale.png`,
                  type: "select",
                  proxies: tailscaleNodes.map((node) => node.name).filter(isNotNull),
              }
            : null,
        {
            name: PROXY_GROUPS.AD_BLOCK,
            icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/AdBlack.png`,
            type: "select",
            proxies: ["REJECT", "REJECT-DROP", "DIRECT"],
        },
        ...countryGroups,
    ];

    return groups.filter(isNotNull);
}
