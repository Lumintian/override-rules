import { NODE_SUFFIX, PROXY_GROUPS } from "./constants";
import { buildList } from "./utils";
import type { BaseLists, BuildBaseListsInput } from "./types";

/**
 * 根据当前功能开关和节点信息，构建各代理组所需的基础代理列表。
 * @param input - 构建基础列表所需的输入参数
 * @param input.landing - 是否存在落地节点
 * @param input.countryNames - 达到 threshold 的基础地区名数组（不含后缀）
 * @param input.countryGroups - 已构建的基础地区组和额外地区组
 * @param input.nonLandingNodes - 非落地节点名称列表（仅在非正则过滤模式下使用）
 * @param input.regexFilter - 是否使用正则过滤模式
 * @returns 包含各场景下代理列表的 `BaseLists` 对象
 */
export function buildBaseLists({
    landing,
    countryNames,
    countryGroups,
    nonLandingNodes,
    regexFilter,
}: BuildBaseListsInput): BaseLists {
    const suffixedCountryNames = countryNames.map((c) => c + NODE_SUFFIX);
    const countryGroupNames = countryGroups.map((group) => group.name);

    const defaultSelector = buildList(
        PROXY_GROUPS.AUTO,
        PROXY_GROUPS.FALLBACK,
        landing && PROXY_GROUPS.LANDING,
        countryGroupNames,
        PROXY_GROUPS.MANUAL,
        "DIRECT"
    );

    const defaultProxies = buildList(
        PROXY_GROUPS.SELECT,
        landing && PROXY_GROUPS.LANDING,
        countryGroupNames,
        PROXY_GROUPS.MANUAL,
        "DIRECT"
    );

    const defaultProxiesDirect = buildList(
        "DIRECT",
        landing && PROXY_GROUPS.LANDING,
        countryGroupNames,
        PROXY_GROUPS.SELECT,
        PROXY_GROUPS.MANUAL
    );

    // 额外组供手动分流使用，不改变自动选择 / 故障转移的候选列表。
    const defaultFallback = buildList(landing && PROXY_GROUPS.LANDING, suffixedCountryNames);

    const frontProxySelector = buildList(
        countryGroupNames,
        "DIRECT",
        !regexFilter && nonLandingNodes.map((node) => node.name).filter(Boolean)
    );

    return {
        defaultProxies,
        defaultProxiesDirect,
        defaultSelector,
        defaultFallback,
        frontProxySelector,
    };
}
