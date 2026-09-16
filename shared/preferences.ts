/** Shared by Sub-Store preprocessing and the override; smaller weights come first. */
export const countryWeights: Readonly<Record<string, number>> = {
    香港: 10,
    新加坡: 20,
    台湾: 30,
    日本: 40,
    韩国: 45,
    美国: 50,
    加拿大: 55,
    英国: 60,
    德国: 70,
    法国: 80,
};

/** Unlisted prefixes stay in first-seen order. Example: { 自建: 10, 机场A: 20 }. */
export const prefixWeights: Readonly<Record<string, number>> = {};

export type NodeCategory = "standard" | "tagged" | "high" | "low";

/** These are presentation preferences, NOT measurements of connection quality. */
export const categoryWeights: Readonly<Record<NodeCategory, number>> = {
    standard: 10,
    tagged: 20,
    high: 30,
    low: 90,
};
