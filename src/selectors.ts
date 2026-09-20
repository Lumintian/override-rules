import { PROXY_GROUPS } from "./constants";
import { buildList } from "./utils";
import type { BaseLists, BuildBaseListsInput } from "./types";

/**
 * 根据当前功能开关和节点信息，构建各代理组所需的基础代理列表。
 * @param input - 构建基础列表所需的输入参数
 * @param input.landingChains - 自动发现的落地链路
 * @param input.countryGroups - 已构建的基础地区组和额外地区组
 * @param input.countryNodes - 非落地节点按地区分类后的结果
 * @param input.nonLandingNodes - 全部非落地节点
 * @param input.frontCountryNamesByChain - 各链路允许使用的前置地区
 * @param input.hasManualNodes - 是否存在未被基础地区组覆盖的手动候选节点
 * @returns 包含各场景下代理列表的 `BaseLists` 对象
 */
export function buildBaseLists({
    landingChains,
    countryGroups,
    countryNodes,
    nonLandingNodes,
    frontCountryNamesByChain,
    hasManualNodes,
}: BuildBaseListsInput): BaseLists {
    const countryGroupNames = countryGroups.map((group) => group.name);
    const landingGroupNames = landingChains.map((chain) => chain.landingGroupName);

    const defaultSelector = buildList(
        landingGroupNames,
        countryGroupNames,
        hasManualNodes && PROXY_GROUPS.MANUAL,
        "DIRECT"
    );

    const defaultProxies = buildList(
        PROXY_GROUPS.SELECT,
        landingGroupNames,
        countryGroupNames,
        hasManualNodes && PROXY_GROUPS.MANUAL,
        "DIRECT"
    );

    const defaultProxiesDirect = buildList(
        "DIRECT",
        landingGroupNames,
        countryGroupNames,
        PROXY_GROUPS.SELECT,
        hasManualNodes && PROXY_GROUPS.MANUAL
    );

    const frontProxySelectors = Object.fromEntries(
        landingChains.map(({ id }) => {
            const configuredCountries = frontCountryNamesByChain[id];
            const candidates = configuredCountries
                ? configuredCountries.flatMap((country) => countryNodes[country] ?? [])
                : nonLandingNodes;
            return [id, buildList(candidates.map((node) => node.name).filter(Boolean), "DIRECT")];
        })
    );

    return {
        defaultProxies,
        defaultProxiesDirect,
        defaultSelector,
        frontProxySelectors,
    };
}
