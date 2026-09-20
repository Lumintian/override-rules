import type { CountryMeta } from "./types";
import { countryWeights } from "../shared/preferences";

export const NODE_SUFFIX = "节点";
export const CDN_URL = "https://cdn.jsdelivr.net";
export const SPEEDTEST_URL = "https://cp.cloudflare.com";

export const PROXY_GROUPS = {
    SELECT: "选择代理",
    MANUAL: "手动选择",
    STABLE: "稳定代理",
    LANDING: "落地节点",
    FRONT_PROXY: "前置代理",
    STATIC_RESOURCES: "静态资源",
    XAI: "XAI",
    CHATGPT: "ChatGPT",
    AI_SERVICE: "AI服务",
    CRYPTO: "加密货币",
    FINANCE: "金融服务",
    APPLE: "苹果服务",
    GOOGLE: "谷歌服务",
    MICROSOFT: "微软服务",
    BILIBILI: "哔哩哔哩",
    BAHAMUT: "巴哈姆特",
    XBOX: "Xbox",
    TAILSCALE: "Tailscale",
    GITHUB: "Github",
    YOUTUBE: "Youtube",
    TIKTOK: "TikTok",
    EHENTAI: "E-Hentai",
    TELEGRAM: "Telegram",
    TWITTER: "Twitter",
    PIKPAK: "PikPak网盘",
    AD_BLOCK: "广告拦截",
    GLOBAL: "GLOBAL",
    MATCH: "漏网之鱼",
} as const;

/** Region matching and group presentation; ordering lives in shared/preferences.ts. */
const countryDefinitions: Record<string, CountryMeta> = {
    香港: {
        code: "hk",
        pattern:
            "香港|港|\\b(?:HK|hk)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Hong Kong|HongKong|hongkong|HONG KONG|HONGKONG|深港|HKG|九龙|Kowloon|新界|沙田|荃湾|葵涌|🇭🇰",
        icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Hong_Kong.png`,
    },
    澳门: {
        code: "mo",
        pattern: "澳门|\\b(?:MO|mo)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Macau|🇲🇴",
        icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Macao.png`,
    },
    台湾: {
        code: "tw",
        pattern:
            "台|新北|彰化|\\b(?:TW|tw)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Taiwan|TAIWAN|TWN|TPE|ROC|🇹🇼|🇼🇸",
        icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/China.png`,
    },
    新加坡: {
        code: "sg",
        pattern:
            "新加坡|坡|狮城|\\b(?:SG|sg)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Singapore|SINGAPORE|SIN|🇸🇬",
        icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Singapore.png`,
    },
    日本: {
        code: "jp",
        pattern:
            "日本|川日|东京|大阪|泉日|埼玉|沪日|深日|\\b(?:JP|jp)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Japan|JAPAN|JPN|NRT|HND|KIX|TYO|OSA|关西|Kansai|KANSAI|🇯🇵",
        icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Japan.png`,
    },
    韩国: {
        code: "kr",
        pattern:
            "韩国|韩|韓|春川|Chuncheon|首尔|\\b(?:KR|kr)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Korea|KOREA|KOR|ICN|🇰🇷",
        icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Korea.png`,
    },
    美国: {
        code: "us",
        pattern:
            "美国|美|波特兰|达拉斯|俄勒冈|凤凰城|费利蒙|硅谷|拉斯维加斯|洛杉矶|圣何塞|圣克拉拉|西雅图|芝加哥|纽约|亚特兰大|迈阿密|华盛顿|\\b(?:US|us)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|United States|UnitedStates|UNITED STATES|USA|America|AMERICA|JFK|EWR|IAD|ATL|ORD|MIA|NYC|LAX|SFO|SEA|DFW|SJC|🇺🇸",
        icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/United_States.png`,
        excludePattern: "美属|亚美尼亚|圣多美|普林西比",
    },
    加拿大: {
        code: "ca",
        pattern:
            "加拿大|渥太华|温哥华|卡尔加里|蒙特利尔|Montreal|\\b(?:CA|ca)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Canada|CANADA|CAN|YVR|YYZ|YUL|🇨🇦",
        icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Canada.png`,
    },
    英国: {
        code: "uk",
        pattern:
            "英国|伦敦|曼彻斯特|Manchester|\\b(?:UK|uk)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Britain|United Kingdom|UNITED KINGDOM|England|GBR|LHR|MAN|🇬🇧",
        icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/United_Kingdom.png`,
    },
    澳大利亚: {
        code: "au",
        pattern: "澳洲|澳大利亚|\\b(?:AU|au)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Australia|🇦🇺",
        icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Australia.png`,
    },
    德国: {
        code: "de",
        pattern:
            "德国|德|柏林|法兰克福|慕尼黑|Munich|\\b(?:DE|de)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Germany|GERMANY|DEU|MUC|🇩🇪",
        icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Germany.png`,
        excludePattern: "瓜德罗普",
    },
    法国: {
        code: "fr",
        pattern:
            "法国|法|巴黎|马赛|Marseille|\\b(?:FR|fr)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|France|FRANCE|FRA|CDG|MRS|🇫🇷",
        icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/France.png`,
        excludePattern: "法属|布基纳法索|法罗",
    },
    俄罗斯: {
        code: "ru",
        pattern: "俄罗斯|俄|\\b(?:RU|ru)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Russia|🇷🇺",
        icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Russia.png`,
        excludePattern: "埃塞俄比亚|白俄罗斯",
    },
    泰国: {
        code: "th",
        pattern: "泰国|泰|\\b(?:TH|th)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Thailand|🇹🇭",
        icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Thailand.png`,
        excludePattern: "巴泰",
    },
    印度: {
        code: "in",
        pattern: "印度|\\b(?:IN|in)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|India|🇮🇳",
        icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/India.png`,
        excludePattern: "印度洋",
    },
    马来西亚: {
        code: "my",
        pattern: "马来西亚|马来|\\b(?:MY|my)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Malaysia|🇲🇾",
        icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Malaysia.png`,
    },
    阿根廷: {
        code: "ar",
        pattern:
            "阿根廷|布宜诺斯艾利斯|\\b(?:AR|ar)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Argentina|EZE|🇦🇷",
        icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Argentina.png`,
    },
    芬兰: {
        code: "fi",
        pattern:
            "芬兰|赫尔辛基|\\b(?:FI|fi)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Finland|HEL|🇫🇮",
        icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Finland.png`,
    },
    埃及: {
        code: "eg",
        pattern: "埃及|开罗|\\b(?:EG|eg)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Egypt|CAI|🇪🇬",
        icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Egypt.png`,
    },
    菲律宾: {
        code: "ph",
        pattern:
            "菲律宾|马尼拉|\\b(?:PH|ph)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Philippines|MNL|🇵🇭",
        icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Philippines.png`,
    },
    土耳其: {
        code: "tr",
        pattern:
            "土耳其|伊斯坦布尔|\\b(?:TR|tr)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Turkey|Türkiye|IST|🇹🇷",
        icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Turkey.png`,
    },
    乌克兰: {
        code: "ua",
        pattern: "乌克兰|基辅|\\b(?:UA|ua)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Ukraine|KBP|🇺🇦",
        icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Ukraine.png`,
    },
};

// Keep group metadata consumers on the same preferences as the Sub-Store scripts.
export const countriesMeta: Record<string, CountryMeta> = Object.fromEntries(
    Object.entries(countryDefinitions).map(([country, meta]) => [
        country,
        { ...meta, weight: countryWeights[country] },
    ])
);
