import { PROXY_GROUPS } from "./constants";
import { buildList } from "./utils";
import type { BaseLists, BuildBaseListsInput } from "./types";

/**
 * 根据当前功能开关和节点信息，构建各代理组所需的基础代理列表。
 * @param input - 构建基础列表所需的输入参数
 * @param input.landing - 是否存在落地节点
 * @param input.countryGroups - 已构建的基础地区组和额外地区组
 * @param input.nonLandingNodes - 非落地节点名称列表（仅在非正则过滤模式下使用）
 * @param input.regexFilter - 是否使用正则过滤模式
 * @param input.hasManualNodes - 是否存在未被基础地区组覆盖的手动候选节点
 * @returns 包含各场景下代理列表的 `BaseLists` 对象
 */
export function buildBaseLists({
    landing,
    countryGroups,
    nonLandingNodes,
    regexFilter,
    hasManualNodes,
}: BuildBaseListsInput): BaseLists {
    const countryGroupNames = countryGroups.map((group) => group.name);

    const defaultSelector = buildList(
        landing && PROXY_GROUPS.LANDING,
        countryGroupNames,
        hasManualNodes && PROXY_GROUPS.MANUAL,
        "DIRECT"
    );

    const defaultProxies = buildList(
        PROXY_GROUPS.SELECT,
        landing && PROXY_GROUPS.LANDING,
        countryGroupNames,
        hasManualNodes && PROXY_GROUPS.MANUAL,
        "DIRECT"
    );

    const defaultProxiesDirect = buildList(
        "DIRECT",
        landing && PROXY_GROUPS.LANDING,
        countryGroupNames,
        PROXY_GROUPS.SELECT,
        hasManualNodes && PROXY_GROUPS.MANUAL
    );

    const frontProxySelector = buildList(
        countryGroupNames,
        "DIRECT",
        !regexFilter && nonLandingNodes.map((node) => node.name).filter(Boolean)
    );

    return {
        defaultProxies,
        defaultProxiesDirect,
        defaultSelector,
        frontProxySelector,
    };
}
