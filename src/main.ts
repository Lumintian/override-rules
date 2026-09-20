/*!
Lumintian/override-rules 的 Sub-Store 订阅转换脚本
https://github.com/Lumintian/override-rules

支持的传入参数：
- grouptype: 基础地区代理组类型（0=select 手动选择, 1=url-test 自动测速, 2=load-balance 负载均衡，默认 1）
- landing: auto-detected from nodes using `dialer-proxy: 前置代理` or `前置代理A..Z`
- front/front_a..front_z: each landing chain's preferred front-proxy country codes, e.g. front_a=hk,sg,jp
- ipv6: 启用 IPv6 支持（默认 false）
- tun: 启用 TUN 模式（默认 false）
- full: 输出完整配置（适合纯内核启动，默认 false）
- keepalive: 启用 tcp-keep-alive（默认 false）
- fakeip: DNS 使用 FakeIP 模式（默认 true；传 false 时为 RedirHost）
- quic: 允许 QUIC 流量（UDP 443，默认 false）
- threshold: 地区节点数量小于该值时不显示基础地区组；已生成基础或额外组的地区不再重复列入手动选择 (默认 2，不影响额外组)
- regex: 使用正则过滤模式（include-all + filter）写入基础及额外地区组，而非直接枚举节点名称（默认 false）
- hk/mo/tw/sg/jp/kr/us/ca/uk/au/de/fr/ru/th/in/my/ar/fi/eg/ph/tr/ua: 对应地区额外 select 组数量（0–100 的整数，默认 0；非法值视为 0），如 us=2&sg=1；无对应地区节点时不生成

源码位于 `src/*.ts`。
*/

import { CDN_URL, PROXY_GROUPS } from "./constants";
import { buildFeatureFlags } from "./args";
import { buildCountryGroups, buildProxyGroups } from "./proxy_groups";
import {
    describeProxyNode,
    getActiveCountryNames,
    parseCountries,
    parseNodesByLanding,
    parseTailscale,
    sortProxyNodes,
} from "./node_parser";
import { buildRules } from "./rules";
import { ruleProviders } from "./rule_providers";
import { buildDns, snifferConfig } from "./dns";
import { buildTunConfig } from "./tun";
import { buildBaseLists } from "./selectors";
import type { ClashConfig, ScriptArgs } from "./types";

const geoxURL = {
    geoip: `${CDN_URL}/gh/MetaCubeX/meta-rules-dat@release/geoip.dat`,
    geosite: `${CDN_URL}/gh/MetaCubeX/meta-rules-dat@release/geosite.dat`,
    mmdb: `${CDN_URL}/gh/MetaCubeX/meta-rules-dat@release/country.mmdb`,
    asn: `${CDN_URL}/gh/MetaCubeX/meta-rules-dat@release/GeoLite2-ASN.mmdb`,
};

declare const $arguments: ScriptArgs;

function getRawArgs(): ScriptArgs {
    try {
        return $arguments;
    } catch {
        return {};
    }
}

export function main(config: ClashConfig, args: ScriptArgs = getRawArgs()): ClashConfig {
    const {
        groupType,
        ipv6Enabled,
        fullConfig,
        keepAliveEnabled,
        fakeIPEnabled,
        quicEnabled,
        regexFilter,
        tunEnabled,
        countryThreshold,
        countryExtraCounts,
        frontCountryNamesByChain,
    } = buildFeatureFlags(args);
    if (!config.proxies || !Array.isArray(config.proxies)) {
        throw new Error("[override-rules] 错误：Clash 配置中缺少有效的 proxies 字段");
    }
    // Order the merged collection once before deriving every explicit candidate list.
    const proxies = sortProxyNodes(config.proxies);
    const parsedLanding = parseNodesByLanding(proxies);
    const landingChains =
        parsedLanding.nonLandingNodes.length > 0 ? parsedLanding.landingChains : [];
    const nonLandingNodes = landingChains.length > 0 ? parsedLanding.nonLandingNodes : proxies;
    const countryNodes = parseCountries(nonLandingNodes);
    const countryNames = getActiveCountryNames(countryNodes, countryThreshold);
    const countryGroups = buildCountryGroups({
        regexFilter,
        groupType,
        countryNames,
        countryNodes,
        countryExtraCounts,
        excludedNodeNames: landingChains.flatMap((chain) =>
            chain.nodes.map((node) => node.name).filter(Boolean)
        ),
    });
    const allNodes = proxies.map((node) => node.name);
    const representedCountries = new Set([
        ...countryNames,
        ...Object.keys(countryNodes).filter((country) => (countryExtraCounts[country] ?? 0) > 0),
    ]);
    const manualNodes = proxies
        .filter((node) => {
            const country = describeProxyNode(node).country;
            return country === null || !representedCountries.has(country);
        })
        .map((node) => node.name);
    const tailscaleNodes = parseTailscale(proxies);
    const hasTailscale = tailscaleNodes.length > 0;

    const { defaultProxies, defaultProxiesDirect, defaultSelector, frontProxySelectors } =
        buildBaseLists({
            landingChains,
            countryGroups,
            countryNodes,
            nonLandingNodes,
            frontCountryNamesByChain,
            hasManualNodes: manualNodes.length > 0,
        });

    const proxyGroups = buildProxyGroups({
        manualNodes,
        countryNames,
        countryGroups,
        tailscaleNodes,
        landingChains,
        defaultProxies,
        defaultProxiesDirect,
        defaultSelector,
        frontProxySelectors,
    });

    const globalProxies = proxyGroups.map((item) => String(item.name));
    proxyGroups.push({
        name: PROXY_GROUPS.GLOBAL,
        icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Global.png`,
        // Explicit names preserve shared ordering; include-all may reorder dynamically.
        type: "select",
        proxies: [...globalProxies, ...allNodes],
    });

    const finalRules = buildRules({ quicEnabled }, hasTailscale);

    return {
        proxies,
        ...(config.hosts !== undefined && { hosts: config.hosts }),
        ...(fullConfig && {
            "mixed-port": 7890,
            "redir-port": 7892,
            "tproxy-port": 7893,
            "routing-mark": 7894,
            "allow-lan": true,
            "bind-address": "*",
            ipv6: ipv6Enabled,
            mode: "rule",
            "unified-delay": true,
            "tcp-concurrent": true,
            "find-process-mode": "off",
            "log-level": "info",
            "geodata-loader": "standard",
            "external-controller": ":9999",
            "disable-keep-alive": !keepAliveEnabled,
            profile: { "store-selected": true },
        }),
        "proxy-groups": proxyGroups,
        "rule-providers": ruleProviders,
        rules: finalRules,
        sniffer: snifferConfig,
        dns: buildDns({ fakeIPEnabled, ipv6Enabled, upstreamDns: config.dns }),
        tun: buildTunConfig(tunEnabled, hasTailscale),
        "geodata-mode": true,
        "geox-url": geoxURL,
    };
}

(globalThis as Record<string, unknown>).main = main;
