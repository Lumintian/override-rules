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
"use strict";
(() => {
  // shared/preferences.ts
  var countryWeights = {
    香港: 10,
    新加坡: 20,
    台湾: 30,
    日本: 40,
    韩国: 45,
    美国: 50,
    加拿大: 55,
    英国: 60,
    德国: 70,
    法国: 80
  };
  var prefixWeights = {};
  var categoryWeights = {
    standard: 10,
    tagged: 20,
    high: 30,
    low: 90
  };

  // src/constants.ts
  var NODE_SUFFIX = "节点";
  var CDN_URL = "https://cdn.jsdelivr.net";
  var SPEEDTEST_URL = "https://cp.cloudflare.com";
  var PROXY_GROUPS = {
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
    MATCH: "漏网之鱼"
  };
  var countryDefinitions = {
    香港: {
      code: "hk",
      pattern: "香港|港|\\b(?:HK|hk)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Hong Kong|HongKong|hongkong|HONG KONG|HONGKONG|深港|HKG|九龙|Kowloon|新界|沙田|荃湾|葵涌|🇭🇰",
      icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Hong_Kong.png`
    },
    澳门: {
      code: "mo",
      pattern: "澳门|\\b(?:MO|mo)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Macau|🇲🇴",
      icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Macao.png`
    },
    台湾: {
      code: "tw",
      pattern: "台|新北|彰化|\\b(?:TW|tw)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Taiwan|TAIWAN|TWN|TPE|ROC|🇹🇼|🇼🇸",
      icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/China.png`
    },
    新加坡: {
      code: "sg",
      pattern: "新加坡|坡|狮城|\\b(?:SG|sg)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Singapore|SINGAPORE|SIN|🇸🇬",
      icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Singapore.png`
    },
    日本: {
      code: "jp",
      pattern: "日本|川日|东京|大阪|泉日|埼玉|沪日|深日|\\b(?:JP|jp)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Japan|JAPAN|JPN|NRT|HND|KIX|TYO|OSA|关西|Kansai|KANSAI|🇯🇵",
      icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Japan.png`
    },
    韩国: {
      code: "kr",
      pattern: "韩国|韩|韓|春川|Chuncheon|首尔|\\b(?:KR|kr)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Korea|KOREA|KOR|ICN|🇰🇷",
      icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Korea.png`
    },
    美国: {
      code: "us",
      pattern: "美国|美|波特兰|达拉斯|俄勒冈|凤凰城|费利蒙|硅谷|拉斯维加斯|洛杉矶|圣何塞|圣克拉拉|西雅图|芝加哥|纽约|亚特兰大|迈阿密|华盛顿|\\b(?:US|us)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|United States|UnitedStates|UNITED STATES|USA|America|AMERICA|JFK|EWR|IAD|ATL|ORD|MIA|NYC|LAX|SFO|SEA|DFW|SJC|🇺🇸",
      icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/United_States.png`,
      excludePattern: "美属|亚美尼亚|圣多美|普林西比"
    },
    加拿大: {
      code: "ca",
      pattern: "加拿大|渥太华|温哥华|卡尔加里|蒙特利尔|Montreal|\\b(?:CA|ca)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Canada|CANADA|CAN|YVR|YYZ|YUL|🇨🇦",
      icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Canada.png`
    },
    英国: {
      code: "uk",
      pattern: "英国|伦敦|曼彻斯特|Manchester|\\b(?:UK|uk)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Britain|United Kingdom|UNITED KINGDOM|England|GBR|LHR|MAN|🇬🇧",
      icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/United_Kingdom.png`
    },
    澳大利亚: {
      code: "au",
      pattern: "澳洲|澳大利亚|\\b(?:AU|au)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Australia|🇦🇺",
      icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Australia.png`
    },
    德国: {
      code: "de",
      pattern: "德国|德|柏林|法兰克福|慕尼黑|Munich|\\b(?:DE|de)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Germany|GERMANY|DEU|MUC|🇩🇪",
      icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Germany.png`,
      excludePattern: "瓜德罗普"
    },
    法国: {
      code: "fr",
      pattern: "法国|法|巴黎|马赛|Marseille|\\b(?:FR|fr)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|France|FRANCE|FRA|CDG|MRS|🇫🇷",
      icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/France.png`,
      excludePattern: "法属|布基纳法索|法罗"
    },
    俄罗斯: {
      code: "ru",
      pattern: "俄罗斯|俄|\\b(?:RU|ru)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Russia|🇷🇺",
      icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Russia.png`,
      excludePattern: "埃塞俄比亚|白俄罗斯"
    },
    泰国: {
      code: "th",
      pattern: "泰国|泰|\\b(?:TH|th)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Thailand|🇹🇭",
      icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Thailand.png`,
      excludePattern: "巴泰"
    },
    印度: {
      code: "in",
      pattern: "印度|\\b(?:IN|in)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|India|🇮🇳",
      icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/India.png`,
      excludePattern: "印度洋"
    },
    马来西亚: {
      code: "my",
      pattern: "马来西亚|马来|\\b(?:MY|my)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Malaysia|🇲🇾",
      icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Malaysia.png`
    },
    阿根廷: {
      code: "ar",
      pattern: "阿根廷|布宜诺斯艾利斯|\\b(?:AR|ar)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Argentina|EZE|🇦🇷",
      icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Argentina.png`
    },
    芬兰: {
      code: "fi",
      pattern: "芬兰|赫尔辛基|\\b(?:FI|fi)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Finland|HEL|🇫🇮",
      icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Finland.png`
    },
    埃及: {
      code: "eg",
      pattern: "埃及|开罗|\\b(?:EG|eg)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Egypt|CAI|🇪🇬",
      icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Egypt.png`
    },
    菲律宾: {
      code: "ph",
      pattern: "菲律宾|马尼拉|\\b(?:PH|ph)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Philippines|MNL|🇵🇭",
      icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Philippines.png`
    },
    土耳其: {
      code: "tr",
      pattern: "土耳其|伊斯坦布尔|\\b(?:TR|tr)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Turkey|Türkiye|IST|🇹🇷",
      icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Turkey.png`
    },
    乌克兰: {
      code: "ua",
      pattern: "乌克兰|基辅|\\b(?:UA|ua)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Ukraine|KBP|🇺🇦",
      icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Ukraine.png`
    }
  };
  var countriesMeta = Object.fromEntries(
    Object.entries(countryDefinitions).map(([country, meta]) => [
      country,
      { ...meta, weight: countryWeights[country] }
    ])
  );

  // src/utils.ts
  function parseBool(value, defaultValue = false) {
    if (typeof value === "undefined") return defaultValue;
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      return value.toLowerCase() === "true" || value === "1";
    }
    return false;
  }
  function parseNumber(value, defaultValue = 0) {
    if (value === null || typeof value === "undefined") {
      return defaultValue;
    }
    const num = parseInt(String(value), 10);
    return Number.isNaN(num) ? defaultValue : num;
  }
  function buildList(...elements) {
    return elements.flat().filter(Boolean);
  }
  function isNotNull(v) {
    return v !== null;
  }

  // src/args.ts
  function parseGroupType(args) {
    const raw = parseNumber(args.grouptype, 1);
    if (raw === 0 || raw === 1 || raw === 2) return raw;
    return 1;
  }
  var MAX_EXTRA_GROUPS_PER_COUNTRY = 100;
  var countryNameByCode = new Map(
    Object.entries(countriesMeta).map(([country, meta]) => [meta.code, country])
  );
  function parseExtraGroupCount(value) {
    if (typeof value !== "string" && typeof value !== "number") return 0;
    const text = String(value).trim();
    if (!/^\d+$/.test(text)) return 0;
    const count = Number(text);
    return Number.isSafeInteger(count) && count <= MAX_EXTRA_GROUPS_PER_COUNTRY ? count : 0;
  }
  function parseFrontCountryNames(args) {
    const mappings = /* @__PURE__ */ Object.create(null);
    for (const [rawKey, rawValue] of Object.entries(args)) {
      const key = rawKey.toLowerCase();
      const match = key === "front" ? [key, ""] : /^front_([a-z])$/.exec(key);
      if (!match) continue;
      if (typeof rawValue !== "string") {
        throw new Error(`[override-rules] ${rawKey} 必须是逗号分隔的地区代码`);
      }
      const chainId = match[1].toUpperCase();
      const countryNames = [];
      for (const token of rawValue.split(",").map((item) => item.trim().toLowerCase())) {
        if (!token) continue;
        const country = countryNameByCode.get(token);
        if (!country) {
          throw new Error(`[override-rules] ${rawKey} 包含不支持的地区代码：${token}`);
        }
        if (!countryNames.includes(country)) countryNames.push(country);
      }
      mappings[chainId] = countryNames;
    }
    return mappings;
  }
  function buildFeatureFlags(args) {
    return {
      groupType: parseGroupType(args),
      ipv6Enabled: parseBool(args.ipv6),
      fullConfig: parseBool(args.full),
      keepAliveEnabled: parseBool(args.keepalive),
      fakeIPEnabled: parseBool(args.fakeip, true),
      quicEnabled: parseBool(args.quic),
      regexFilter: parseBool(args.regex),
      tunEnabled: parseBool(args.tun),
      countryThreshold: parseNumber(args.threshold, 2),
      countryExtraCounts: Object.fromEntries(
        Object.entries(countriesMeta).map(([country, meta]) => [
          country,
          parseExtraGroupCount(args[meta.code])
        ])
      ),
      frontCountryNamesByChain: parseFrontCountryNames(args)
    };
  }

  // shared/node_order.ts
  var defaults = {
    countries: countryWeights,
    prefixes: prefixWeights,
    categories: categoryWeights
  };
  function weight(weights, key) {
    const value = Object.prototype.hasOwnProperty.call(weights, key) ? weights[key] : void 0;
    return typeof value === "number" && Number.isFinite(value) ? value : Infinity;
  }
  function compareWeight(a, b) {
    return a === b ? 0 : a < b ? -1 : 1;
  }
  function orderedBlocks(items, keyOf, weights) {
    const groups = /* @__PURE__ */ new Map();
    for (const item of items) {
      const key = keyOf(item);
      const group = groups.get(key);
      if (group) group.push(item);
      else groups.set(key, [item]);
    }
    return [...groups.entries()].map(([key, values], index) => ({ values, index, weight: weight(weights, key) })).sort((a, b) => compareWeight(a.weight, b.weight) || a.index - b.index).map(({ values }) => values);
  }
  function orderCountries(items, countryOf, weights = countryWeights) {
    return orderedBlocks(items, countryOf, weights).flat();
  }
  function orderNodes(items, describe, preferences = defaults) {
    const known = [];
    const unknown = [];
    for (const item of items) {
      const meta = describe(item);
      if (meta.country === null) unknown.push(item);
      else known.push({ item, meta });
    }
    const ordered = orderedBlocks(known, ({ meta }) => meta.country, preferences.countries).flatMap(
      (country) => orderedBlocks(country, ({ meta }) => meta.prefix, preferences.prefixes)
    ).flatMap(
      (prefix) => orderedBlocks(prefix, ({ meta }) => meta.category, preferences.categories)
    ).flatMap((category) => category.map(({ item }) => item));
    return ordered.concat(unknown);
  }
  function readMultiplier(name) {
    const match = name.normalize("NFKC").match(
      /(?:^|[^A-Za-z0-9.+-])(?:(\d+(?:\.\d+)?)\s*(?:[x×]|倍)|(?:倍率\s*[:：=]?\s*|[x×]\s*)(\d+(?:\.\d+)?))(?=$|[^A-Za-z0-9.])/i
    );
    if (!match) return null;
    const value = Number(match[1] ?? match[2]);
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  function hasSpecialTag(name) {
    return /家宽|商宽|自建|落地|专线|游戏|实验|核心|边缘|高级|购物|(?:^|[^A-Za-z])(?:IPLC|IEPL|Fam|Biz|Self|Landing|Kern|Edge|Pro|Exp|Game|Buy|Zx|LB)(?=$|[^A-Za-z])/i.test(
      name
    );
  }
  function classifyNode(multiplier, tagged) {
    if (multiplier !== null && multiplier < 1) return "low";
    if (tagged) return "tagged";
    if (multiplier !== null && multiplier > 1) return "high";
    return "standard";
  }

  // shared/regions.ts
  var EN = ["HK", "MO", "TW", "JP", "KR", "SG", "US", "GB", "FR", "DE", "AU", "AE", "AF", "AL", "DZ", "AO", "AR", "AM", "AT", "AZ", "BH", "BD", "BY", "BE", "BZ", "BJ", "BT", "BO", "BA", "BW", "BR", "VG", "BN", "BG", "BF", "BI", "KH", "CM", "CA", "CV", "KY", "CF", "TD", "CL", "CO", "KM", "CG", "CD", "CR", "HR", "CY", "CZ", "DK", "DJ", "DO", "EC", "EG", "SV", "GQ", "ER", "EE", "ET", "FJ", "FI", "GA", "GM", "GE", "GH", "GR", "GL", "GT", "GN", "GY", "HT", "HN", "HU", "IS", "IN", "ID", "IR", "IQ", "IE", "IM", "IL", "IT", "CI", "JM", "JO", "KZ", "KE", "KW", "KG", "LA", "LV", "LB", "LS", "LR", "LY", "LT", "LU", "MK", "MG", "MW", "MY", "MV", "ML", "MT", "MR", "MU", "MX", "MD", "MC", "MN", "ME", "MA", "MZ", "MM", "NA", "NP", "NL", "NZ", "NI", "NE", "NG", "KP", "NO", "OM", "PK", "PA", "PY", "PE", "PH", "PT", "PR", "QA", "RO", "RU", "RW", "SM", "SA", "SN", "RS", "SL", "SK", "SI", "SO", "ZA", "ES", "LK", "SD", "SR", "SZ", "SE", "CH", "SY", "TJ", "TZ", "TH", "TG", "TO", "TT", "TN", "TR", "TM", "VI", "UG", "UA", "UY", "UZ", "VE", "VN", "YE", "ZM", "ZW", "AD", "RE", "PL", "GU", "VA", "LI", "CW", "SC", "AQ", "GI", "CU", "FO", "AX", "BM", "TL"];
  var ZH = ["香港", "澳门", "台湾", "日本", "韩国", "新加坡", "美国", "英国", "法国", "德国", "澳大利亚", "阿联酋", "阿富汗", "阿尔巴尼亚", "阿尔及利亚", "安哥拉", "阿根廷", "亚美尼亚", "奥地利", "阿塞拜疆", "巴林", "孟加拉国", "白俄罗斯", "比利时", "伯利兹", "贝宁", "不丹", "玻利维亚", "波斯尼亚和黑塞哥维那", "博茨瓦纳", "巴西", "英属维京群岛", "文莱", "保加利亚", "布基纳法索", "布隆迪", "柬埔寨", "喀麦隆", "加拿大", "佛得角", "开曼群岛", "中非共和国", "乍得", "智利", "哥伦比亚", "科摩罗", "刚果(布)", "刚果(金)", "哥斯达黎加", "克罗地亚", "塞浦路斯", "捷克", "丹麦", "吉布提", "多米尼加共和国", "厄瓜多尔", "埃及", "萨尔瓦多", "赤道几内亚", "厄立特里亚", "爱沙尼亚", "埃塞俄比亚", "斐济", "芬兰", "加蓬", "冈比亚", "格鲁吉亚", "加纳", "希腊", "格陵兰", "危地马拉", "几内亚", "圭亚那", "海地", "洪都拉斯", "匈牙利", "冰岛", "印度", "印尼", "伊朗", "伊拉克", "爱尔兰", "马恩岛", "以色列", "意大利", "科特迪瓦", "牙买加", "约旦", "哈萨克斯坦", "肯尼亚", "科威特", "吉尔吉斯斯坦", "老挝", "拉脱维亚", "黎巴嫩", "莱索托", "利比里亚", "利比亚", "立陶宛", "卢森堡", "马其顿", "马达加斯加", "马拉维", "马来", "马尔代夫", "马里", "马耳他", "毛利塔尼亚", "毛里求斯", "墨西哥", "摩尔多瓦", "摩纳哥", "蒙古", "黑山共和国", "摩洛哥", "莫桑比克", "缅甸", "纳米比亚", "尼泊尔", "荷兰", "新西兰", "尼加拉瓜", "尼日尔", "尼日利亚", "朝鲜", "挪威", "阿曼", "巴基斯坦", "巴拿马", "巴拉圭", "秘鲁", "菲律宾", "葡萄牙", "波多黎各", "卡塔尔", "罗马尼亚", "俄罗斯", "卢旺达", "圣马力诺", "沙特阿拉伯", "塞内加尔", "塞尔维亚", "塞拉利昂", "斯洛伐克", "斯洛文尼亚", "索马里", "南非", "西班牙", "斯里兰卡", "苏丹", "苏里南", "斯威士兰", "瑞典", "瑞士", "叙利亚", "塔吉克斯坦", "坦桑尼亚", "泰国", "多哥", "汤加", "特立尼达和多巴哥", "突尼斯", "土耳其", "土库曼斯坦", "美属维尔京群岛", "乌干达", "乌克兰", "乌拉圭", "乌兹别克斯坦", "委内瑞拉", "越南", "也门", "赞比亚", "津巴布韦", "安道尔", "留尼汪", "波兰", "关岛", "梵蒂冈", "列支敦士登", "库拉索", "塞舌尔", "南极", "直布罗陀", "古巴", "法罗群岛", "奥兰群岛", "百慕达", "东帝汶"];
  var QC = ["Hong Kong", "Macao", "Taiwan", "Japan", "Korea", "Singapore", "United States", "United Kingdom", "France", "Germany", "Australia", "Dubai", "Afghanistan", "Albania", "Algeria", "Angola", "Argentina", "Armenia", "Austria", "Azerbaijan", "Bahrain", "Bangladesh", "Belarus", "Belgium", "Belize", "Benin", "Bhutan", "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "British Virgin Islands", "Brunei", "Bulgaria", "Burkina-faso", "Burundi", "Cambodia", "Cameroon", "Canada", "CapeVerde", "CaymanIslands", "Central African Republic", "Chad", "Chile", "Colombia", "Comoros", "Congo-Brazzaville", "Congo-Kinshasa", "CostaRica", "Croatia", "Cyprus", "Czech Republic", "Denmark", "Djibouti", "Dominican Republic", "Ecuador", "Egypt", "EISalvador", "Equatorial Guinea", "Eritrea", "Estonia", "Ethiopia", "Fiji", "Finland", "Gabon", "Gambia", "Georgia", "Ghana", "Greece", "Greenland", "Guatemala", "Guinea", "Guyana", "Haiti", "Honduras", "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Isle of Man", "Israel", "Italy", "Ivory Coast", "Jamaica", "Jordan", "Kazakstan", "Kenya", "Kuwait", "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Lithuania", "Luxembourg", "Macedonia", "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Mauritania", "Mauritius", "Mexico", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar(Burma)", "Namibia", "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "NorthKorea", "Norway", "Oman", "Pakistan", "Panama", "Paraguay", "Peru", "Philippines", "Portugal", "PuertoRico", "Qatar", "Romania", "Russia", "Rwanda", "SanMarino", "SaudiArabia", "Senegal", "Serbia", "SierraLeone", "Slovakia", "Slovenia", "Somalia", "SouthAfrica", "Spain", "SriLanka", "Sudan", "Suriname", "Swaziland", "Sweden", "Switzerland", "Syria", "Tajikstan", "Tanzania", "Thailand", "Togo", "Tonga", "TrinidadandTobago", "Tunisia", "Turkey", "Turkmenistan", "U.S.Virgin Islands", "Uganda", "Ukraine", "Uruguay", "Uzbekistan", "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe", "Andorra", "Reunion", "Poland", "Guam", "Vatican", "Liechtensteins", "Curacao", "Seychelles", "Antarctica", "Gibraltar", "Cuba", "Faroe Islands", "Ahvenanmaa", "Bermuda", "Timor-Leste"];
  var FG = EN.map(
    (code) => [...code].map((letter) => String.fromCodePoint(127462 + letter.charCodeAt(0) - 65)).join("")
  );
  var regionNames = {
    cn: ZH,
    us: EN,
    quan: QC,
    gq: FG
  };
  var matchers = Object.fromEntries(
    Object.entries(regionNames).map(([format, names]) => [
      format,
      names.map((text, regionIndex) => {
        const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const token = format === "us" || format === "quan";
        return {
          regionIndex,
          length: text.length,
          regex: new RegExp(
            token ? `(^|[^A-Za-z])(${escaped})(?=$|[^A-Za-z])` : `(${escaped})`,
            "i"
          ),
          token
        };
      }).sort((a, b) => b.length - a.length)
    ])
  );
  function findRegion(name, format) {
    for (const current of format ? [format] : ["cn", "gq", "quan", "us"]) {
      for (const { regionIndex, regex, token } of matchers[current]) {
        const match = regex.exec(name);
        if (!match) continue;
        return {
          country: ZH[regionIndex] === "马来" ? "马来西亚" : ZH[regionIndex],
          regionIndex,
          index: match.index + (token ? match[1].length : 0),
          text: match[token ? 2 : 1]
        };
      }
    }
    return null;
  }
  function splitPrefix(name) {
    const delimiter = name.indexOf("|");
    if (delimiter < 0) return { prefix: "", body: name };
    const head = name.slice(0, delimiter).trim();
    const body = name.slice(delimiter + 1).trim();
    const match = findRegion(head);
    if (!findRegion(body) && match && head.replace(match.text, "").replace(/[\u{1F1E6}-\u{1F1FF}\s]/gu, "") === "") {
      return { prefix: "", body: name };
    }
    return { prefix: head.replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "").trim(), body };
  }

  // shared/display_name.ts
  function describeName(name) {
    const { prefix, body } = splitPrefix(name);
    const match = findRegion(body);
    if (!match) return { country: null, prefix, category: "standard" };
    const inferredPrefix = body.slice(0, match.index).replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "").replace(/^[\s|_-]+|[\s|_-]+$/g, "");
    const labels = body.slice(match.index + match.text.length);
    return {
      country: match.country,
      prefix: prefix || inferredPrefix,
      category: classifyNode(readMultiplier(labels), hasSpecialTag(labels))
    };
  }

  // src/node_parser.ts
  var COUNTRY_MATCHERS = Object.entries(countriesMeta).map(([country, meta]) => ({
    country,
    regex: new RegExp(meta.pattern.replace(/^\(\?i\)/, ""), "i"),
    exclude: meta.excludePattern ? new RegExp(meta.excludePattern, "i") : null
  }));
  function describeProxyNode(node) {
    const meta = describeName(node.name || "");
    if (meta.country !== null) return meta;
    const { prefix, body } = splitPrefix(node.name || "");
    for (const { country, regex, exclude } of COUNTRY_MATCHERS) {
      const match = regex.exec(body);
      if (!match || exclude?.test(body)) continue;
      const inferredPrefix = body.slice(0, match.index).replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "").replace(/^[\s|_-]+|[\s|_-]+$/g, "");
      const labels = body.slice(match.index + match[0].length);
      return {
        country,
        prefix: prefix || inferredPrefix,
        category: classifyNode(readMultiplier(labels), hasSpecialTag(labels))
      };
    }
    return meta;
  }
  function sortProxyNodes(nodes) {
    return orderNodes(nodes, describeProxyNode);
  }
  function parseTailscale(nodes) {
    return (nodes || []).filter((proxy) => proxy.type === "tailscale");
  }
  function landingChainId(value) {
    if (typeof value !== "string") return null;
    const match = /^前置代理([A-Z])?$/.exec(value.trim());
    return match ? (match[1] ?? "").toUpperCase() : null;
  }
  function parseNodesByLanding(nodes) {
    const byChain = /* @__PURE__ */ new Map();
    const nonLandingNodes = [];
    for (const node of nodes || []) {
      if (!node.name) continue;
      const id = landingChainId(node["dialer-proxy"]);
      if (id === null) {
        nonLandingNodes.push(node);
      } else {
        const chainNodes = byChain.get(id) ?? [];
        chainNodes.push(node);
        byChain.set(id, chainNodes);
      }
    }
    const ids = [...byChain.keys()].sort((left, right) => {
      if (left === right) return 0;
      if (left === "") return -1;
      if (right === "") return 1;
      return left.localeCompare(right);
    });
    const landingChains = ids.map((id) => ({
      id,
      frontGroupName: `${PROXY_GROUPS.FRONT_PROXY}${id}`,
      landingGroupName: `${PROXY_GROUPS.LANDING}${id}`,
      nodes: byChain.get(id)
    }));
    return {
      landingNodes: landingChains.flatMap(({ nodes: chainNodes }) => chainNodes),
      nonLandingNodes,
      landingChains
    };
  }
  function parseCountries(nodes) {
    const countryNodes = /* @__PURE__ */ Object.create(null);
    for (const node of nodes) {
      const { country } = describeProxyNode(node);
      if (country === null || !Object.prototype.hasOwnProperty.call(countriesMeta, country))
        continue;
      (countryNodes[country] ??= []).push(node);
    }
    return countryNodes;
  }
  function getActiveCountryNames(countryNodes, minCount) {
    const names = Object.entries(countryNodes).filter(([, nodes]) => nodes.length >= minCount).map(([country]) => country);
    return orderCountries(names, (country) => country);
  }

  // src/proxy_groups.ts
  function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function buildGroupByType({
    name,
    icon,
    groupType,
    nodeSource
  }) {
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
          ...nodeSource
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
          ...nodeSource
        };
    }
  }
  function buildCountryGroups({
    regexFilter,
    groupType,
    countryNames,
    countryNodes,
    countryExtraCounts,
    excludedNodeNames
  }) {
    return getActiveCountryNames(countryNodes, 1).flatMap((country) => {
      const meta = countriesMeta[country];
      const nodeSource = regexFilter ? {
        "include-all": true,
        filter: meta.pattern,
        ...excludedNodeNames.length > 0 ? {
          "exclude-filter": [
            ...excludedNodeNames.map((name) => `^${escapeRegex(name)}$`),
            meta.excludePattern
          ].filter(Boolean).map((pattern) => `(?:${pattern})`).join("|")
        } : meta.excludePattern ? { "exclude-filter": meta.excludePattern } : {}
      } : { proxies: countryNodes[country].map((node) => node.name).filter(isNotNull) };
      const groups = [];
      if (countryNames.includes(country)) {
        groups.push(
          buildGroupByType({
            name: `${country}${NODE_SUFFIX}`,
            icon: meta.icon,
            groupType,
            nodeSource
          })
        );
      }
      const extraCount = countryExtraCounts[country] ?? 0;
      for (let index = 1; index <= extraCount; index += 1) {
        groups.push({
          name: `${country}额外${index}`,
          icon: meta.icon,
          type: "select",
          ...nodeSource
        });
      }
      return groups;
    });
  }
  function buildProxyGroups({
    manualNodes,
    countryNames,
    countryGroups,
    tailscaleNodes,
    landingChains,
    defaultProxies,
    defaultProxiesDirect,
    defaultSelector,
    frontProxySelectors
  }) {
    const hasTW = countryNames.includes("台湾");
    const hasHK = countryNames.includes("香港");
    const hasTailscale = tailscaleNodes.length > 0;
    const countryGroupNames = (country) => countryGroups.filter(
      ({ name }) => name === `${country}${NODE_SUFFIX}` || name.startsWith(`${country}额外`)
    ).map(({ name }) => name);
    const groups = [
      {
        name: PROXY_GROUPS.SELECT,
        icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Proxy.png`,
        type: "select",
        proxies: defaultSelector
      },
      manualNodes.length > 0 ? {
        name: PROXY_GROUPS.MANUAL,
        icon: `${CDN_URL}/gh/shindgewongxj/WHATSINStash@master/icon/select.png`,
        type: "select",
        proxies: manualNodes
      } : null,
      {
        name: PROXY_GROUPS.STABLE,
        icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Available.png`,
        type: "select",
        proxies: [PROXY_GROUPS.SELECT, ...defaultSelector]
      },
      {
        name: PROXY_GROUPS.MATCH,
        icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Final.png`,
        type: "select",
        proxies: [PROXY_GROUPS.SELECT, ...defaultSelector]
      },
      ...landingChains.flatMap((chain) => [
        {
          name: chain.frontGroupName,
          icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Area.png`,
          type: "select",
          proxies: frontProxySelectors[chain.id] ?? ["DIRECT"]
        },
        {
          name: chain.landingGroupName,
          icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Airport.png`,
          type: "select",
          proxies: chain.nodes.map((node) => node.name).filter(isNotNull)
        }
      ]),
      {
        name: PROXY_GROUPS.STATIC_RESOURCES,
        icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Cloudflare.png`,
        type: "select",
        proxies: defaultProxies
      },
      {
        name: PROXY_GROUPS.XAI,
        icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Bot.png`,
        type: "select",
        proxies: defaultProxies
      },
      {
        name: PROXY_GROUPS.CHATGPT,
        icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/ChatGPT.png`,
        type: "select",
        proxies: defaultProxies
      },
      {
        name: PROXY_GROUPS.AI_SERVICE,
        icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/ChatGPT.png`,
        type: "select",
        proxies: defaultProxies
      },
      {
        name: PROXY_GROUPS.CRYPTO,
        icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Cryptocurrency_1.png`,
        type: "select",
        proxies: defaultProxies
      },
      {
        name: PROXY_GROUPS.FINANCE,
        icon: `${CDN_URL}/gh/Lumintian/override-rules@main/icons/Nasdaq.png`,
        type: "select",
        proxies: defaultProxiesDirect
      },
      {
        name: PROXY_GROUPS.APPLE,
        icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Apple_2.png`,
        type: "select",
        proxies: defaultProxies
      },
      {
        name: PROXY_GROUPS.GOOGLE,
        icon: `${CDN_URL}/gh/Orz-3/mini@master/Color/Google.png`,
        type: "select",
        proxies: defaultProxies
      },
      {
        name: PROXY_GROUPS.MICROSOFT,
        icon: `${CDN_URL}/gh/Lumintian/override-rules@main/icons/Microsoft_Copilot.png`,
        type: "select",
        proxies: defaultProxies
      },
      {
        name: PROXY_GROUPS.XBOX,
        icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Xbox.png`,
        type: "select",
        proxies: defaultProxies
      },
      {
        name: PROXY_GROUPS.GITHUB,
        icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/GitHub.png`,
        type: "select",
        proxies: defaultProxies
      },
      {
        name: PROXY_GROUPS.BILIBILI,
        icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/bilibili.png`,
        type: "select",
        proxies: hasTW && hasHK ? ["DIRECT", ...countryGroupNames("台湾"), ...countryGroupNames("香港")] : defaultProxiesDirect
      },
      {
        name: PROXY_GROUPS.BAHAMUT,
        icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Bahamut.png`,
        type: "select",
        proxies: hasTW ? [
          ...countryGroupNames("台湾"),
          PROXY_GROUPS.SELECT,
          ...manualNodes.length > 0 ? [PROXY_GROUPS.MANUAL] : [],
          "DIRECT"
        ] : defaultProxies
      },
      {
        name: PROXY_GROUPS.YOUTUBE,
        icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/YouTube.png`,
        type: "select",
        proxies: defaultProxies
      },
      {
        name: PROXY_GROUPS.TIKTOK,
        icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/TikTok.png`,
        type: "select",
        proxies: defaultProxies
      },
      {
        name: PROXY_GROUPS.TELEGRAM,
        icon: `${CDN_URL}/gh/Lumintian/override-rules@main/icons/Telegram.png`,
        type: "select",
        proxies: defaultProxies
      },
      {
        name: PROXY_GROUPS.TWITTER,
        icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Twitter.png`,
        type: "select",
        proxies: defaultProxies
      },
      {
        name: PROXY_GROUPS.EHENTAI,
        icon: `${CDN_URL}/gh/Lumintian/override-rules@main/icons/Ehentai.png`,
        type: "select",
        proxies: defaultProxies
      },
      {
        name: PROXY_GROUPS.PIKPAK,
        icon: `${CDN_URL}/gh/Lumintian/override-rules@main/icons/PikPak.png`,
        type: "select",
        proxies: defaultProxies
      },
      hasTailscale ? {
        name: PROXY_GROUPS.TAILSCALE,
        icon: `${CDN_URL}/gh/Lumintian/override-rules@main/icons/Tailscale.png`,
        type: "select",
        proxies: tailscaleNodes.map((node) => node.name).filter(isNotNull)
      } : null,
      {
        name: PROXY_GROUPS.AD_BLOCK,
        icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/AdBlack.png`,
        type: "select",
        proxies: ["REJECT", "REJECT-DROP", "DIRECT"]
      },
      ...countryGroups
    ];
    return groups.filter(isNotNull);
  }

  // src/rules.ts
  function buildRules({ quicEnabled }, tailscale) {
    return [
      !quicEnabled ? `AND,((DST-PORT,443),(NETWORK,UDP)),REJECT` : null,
      tailscale ? `IP-CIDR,100.64.0.0/10,${PROXY_GROUPS.TAILSCALE},no-resolve` : null,
      tailscale ? `IP-CIDR,fd7a:115c:a1e0::/48,${PROXY_GROUPS.TAILSCALE},no-resolve` : null,
      tailscale ? `DOMAIN-SUFFIX,ts.net,${PROXY_GROUPS.TAILSCALE}` : null,
      `GEOIP,private,DIRECT,no-resolve`,
      `RULE-SET,ADBlock,${PROXY_GROUPS.AD_BLOCK}`,
      `RULE-SET,AdditionalFilter,${PROXY_GROUPS.AD_BLOCK}`,
      `RULE-SET,StaticResources,${PROXY_GROUPS.STATIC_RESOURCES}`,
      `RULE-SET,CDNResources,${PROXY_GROUPS.STATIC_RESOURCES}`,
      `RULE-SET,AdditionalCDNResources,${PROXY_GROUPS.STATIC_RESOURCES}`,
      `GEOSITE,category-cryptocurrency,${PROXY_GROUPS.CRYPTO}`,
      `GEOSITE,category-finance,${PROXY_GROUPS.FINANCE}`,
      `GEOSITE,xai,${PROXY_GROUPS.XAI}`,
      `DOMAIN-KEYWORD,grok,${PROXY_GROUPS.XAI}`,
      `GEOSITE,openai,${PROXY_GROUPS.CHATGPT}`,
      `GEOSITE,category-ai-!cn,${PROXY_GROUPS.AI_SERVICE}`,
      `GEOSITE,bilibili,${PROXY_GROUPS.BILIBILI}`,
      `GEOSITE,youtube,${PROXY_GROUPS.YOUTUBE}`,
      `GEOSITE,telegram,${PROXY_GROUPS.TELEGRAM}`,
      `GEOIP,telegram,${PROXY_GROUPS.TELEGRAM},no-resolve`,
      `GEOSITE,xbox,${PROXY_GROUPS.XBOX}`,
      `GEOSITE,github,${PROXY_GROUPS.GITHUB}`,
      `GEOSITE,bahamut,${PROXY_GROUPS.BAHAMUT}`,
      `GEOSITE,pikpak,${PROXY_GROUPS.PIKPAK}`,
      `GEOSITE,twitter,${PROXY_GROUPS.TWITTER}`,
      `RULE-SET,EHentai,${PROXY_GROUPS.EHENTAI}`,
      `RULE-SET,TikTok,${PROXY_GROUPS.TIKTOK}`,
      `RULE-SET,SteamFix,DIRECT`,
      `RULE-SET,GoogleFCM,DIRECT`,
      `GEOSITE,google-play@cn,DIRECT`,
      `GEOSITE,microsoft@cn,DIRECT`,
      `GEOSITE,apple,${PROXY_GROUPS.APPLE}`,
      `GEOSITE,microsoft,${PROXY_GROUPS.MICROSOFT}`,
      `GEOSITE,google,${PROXY_GROUPS.GOOGLE}`,
      `RULE-SET,GFWList,${PROXY_GROUPS.SELECT}`,
      `GEOIP,cn,DIRECT`,
      `MATCH,${PROXY_GROUPS.MATCH}`
    ].filter(isNotNull);
  }

  // src/rule_providers.ts
  var ruleProviders = {
    ADBlock: {
      type: "http",
      behavior: "domain",
      format: "yaml",
      interval: 86400,
      url: `${CDN_URL}/gh/217heidai/adblockfilters@main/rules/adblockmihomolite.yaml`,
      path: "./ruleset/ADBlock.yaml"
    },
    StaticResources: {
      type: "http",
      behavior: "domain",
      format: "text",
      interval: 86400,
      url: "https://ruleset.skk.moe/Clash/domainset/cdn.txt",
      path: "./ruleset/StaticResources.txt"
    },
    CDNResources: {
      type: "http",
      behavior: "classical",
      format: "text",
      interval: 86400,
      url: "https://ruleset.skk.moe/Clash/non_ip/cdn.txt",
      path: "./ruleset/CDNResources.txt"
    },
    TikTok: {
      type: "http",
      behavior: "classical",
      format: "text",
      interval: 86400,
      url: `${CDN_URL}/gh/Lumintian/override-rules@main/ruleset/TikTok.list`,
      path: "./ruleset/TikTok.list"
    },
    EHentai: {
      type: "http",
      behavior: "classical",
      format: "text",
      interval: 86400,
      url: `${CDN_URL}/gh/Lumintian/override-rules@main/ruleset/EHentai.list`,
      path: "./ruleset/EHentai.list"
    },
    SteamFix: {
      type: "http",
      behavior: "classical",
      format: "text",
      interval: 86400,
      url: `${CDN_URL}/gh/Lumintian/override-rules@main/ruleset/SteamFix.list`,
      path: "./ruleset/SteamFix.list"
    },
    GoogleFCM: {
      type: "http",
      behavior: "classical",
      format: "text",
      interval: 86400,
      url: `${CDN_URL}/gh/Lumintian/override-rules@main/ruleset/FirebaseCloudMessaging.list`,
      path: "./ruleset/FirebaseCloudMessaging.list"
    },
    AdditionalFilter: {
      type: "http",
      behavior: "classical",
      format: "text",
      interval: 86400,
      url: `${CDN_URL}/gh/Lumintian/override-rules@main/ruleset/AdditionalFilter.list`,
      path: "./ruleset/AdditionalFilter.list"
    },
    AdditionalCDNResources: {
      type: "http",
      behavior: "classical",
      format: "text",
      interval: 86400,
      url: `${CDN_URL}/gh/Lumintian/override-rules@main/ruleset/AdditionalCDNResources.list`,
      path: "./ruleset/AdditionalCDNResources.list"
    },
    GFWList: {
      type: "http",
      behavior: "domain",
      format: "yaml",
      interval: 86400,
      url: "https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/gfw.txt",
      path: "./ruleset/GFWList.yaml"
    }
  };

  // src/dns.ts
  var FAKE_IP_FILTER = [
    "geosite:connectivity-check",
    "Mijia Cloud",
    "dig.io.mi.com",
    "localhost.ptlogin2.qq.com",
    "*.icloud.com",
    "*.stun.*.*",
    "*.stun.*.*.*",
    "*.lan",
    "*.localdomain",
    "*.example",
    "*.invalid",
    "*.localhost",
    "*.test",
    "*.local",
    "*.home.arpa",
    "time.*.com",
    "time.*.gov",
    "time.*.edu.cn",
    "time.*.apple.com",
    "time1.*.com",
    "time2.*.com",
    "time3.*.com",
    "time4.*.com",
    "time5.*.com",
    "time6.*.com",
    "time7.*.com",
    "ntp.*.com",
    "ntp1.*.com",
    "ntp2.*.com",
    "ntp3.*.com",
    "ntp4.*.com",
    "ntp5.*.com",
    "ntp6.*.com",
    "ntp7.*.com",
    "*.time.edu.cn",
    "*.ntp.org.cn",
    "+.pool.ntp.org",
    "time1.cloud.tencent.com",
    "stun.*.*",
    "stun.*.*.*",
    "swscan.apple.com",
    "mesu.apple.com",
    "music.163.com",
    "*.music.163.com",
    "*.126.net",
    "musicapi.taihe.com",
    "music.taihe.com",
    "songsearch.kugou.com",
    "trackercdn.kugou.com",
    "*.kuwo.cn",
    "api-jooxtt.sanook.com",
    "api.joox.com",
    "y.qq.com",
    "*.y.qq.com",
    "streamoc.music.tc.qq.com",
    "mobileoc.music.tc.qq.com",
    "isure.stream.qqmusic.qq.com",
    "dl.stream.qqmusic.qq.com",
    "aqqmusic.tc.qq.com",
    "amobile.music.tc.qq.com",
    "localhost.ptlogin2.qq.com",
    "*.msftconnecttest.com",
    "*.msftncsi.com",
    "*.xiami.com",
    "*.music.migu.cn",
    "music.migu.cn",
    "+.wotgame.cn",
    "+.wggames.cn",
    "+.wowsgame.cn",
    "+.wargaming.net",
    "*.*.*.srv.nintendo.net",
    "*.*.stun.playstation.net",
    "xbox.*.*.microsoft.com",
    "*.*.xboxlive.com",
    "*.ipv6.microsoft.com",
    "teredo.*.*.*",
    "teredo.*.*",
    "speedtest.cros.wr.pvp.net",
    "+.jjvip8.com",
    "www.douyu.com",
    "activityapi.huya.com",
    "activityapi.huya.com.w.cdngslb.com",
    "www.bilibili.com",
    "api.bilibili.com",
    "a.w.bilicdn1.com",
    "+.apt-agent.com"
  ];
  var snifferConfig = {
    sniff: {
      TLS: {
        ports: [443, 8443]
      },
      HTTP: {
        ports: [80, 8080, 8880]
      },
      QUIC: {
        ports: [443, 8443]
      }
    },
    "override-destination": false,
    enable: true,
    "force-dns-mapping": true,
    "skip-domain": ["Mijia Cloud", "dlg.io.mi.com", "+.push.apple.com"]
  };
  var DNS_POLICY_FIELDS = ["nameserver-policy", "proxy-server-nameserver-policy"];
  function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function getStringList(value) {
    return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : void 0;
  }
  function mergeStringLists(current, upstream) {
    const upstreamList = getStringList(upstream);
    if (!current && !upstreamList) return void 0;
    return [.../* @__PURE__ */ new Set([...current ?? [], ...upstreamList ?? []])];
  }
  function mergeDnsPolicies(current, upstream) {
    if (!isRecord(upstream)) return current;
    const upstreamPolicy = {};
    for (const [key, value] of Object.entries(upstream)) {
      if (typeof value === "string") {
        upstreamPolicy[key] = value;
      } else if (getStringList(value)) {
        upstreamPolicy[key] = value;
      }
    }
    return { ...current ?? {}, ...upstreamPolicy };
  }
  function inheritDnsFields(generated, upstream) {
    if (!isRecord(upstream)) return generated;
    const merged = { ...generated };
    for (const field of DNS_POLICY_FIELDS) {
      const policy = mergeDnsPolicies(merged[field], upstream[field]);
      if (policy) merged[field] = policy;
    }
    const fakeIpFilter = mergeStringLists(merged["fake-ip-filter"], upstream["fake-ip-filter"]);
    if (fakeIpFilter) merged["fake-ip-filter"] = fakeIpFilter;
    return merged;
  }
  function buildDnsConfig({ mode, ipv6Enabled, fakeIpFilter }) {
    const config = {
      enable: true,
      ipv6: ipv6Enabled,
      "prefer-h3": true,
      "enhanced-mode": mode,
      nameserver: ["system", "223.5.5.5", "119.29.29.29", "180.184.1.1"],
      fallback: [
        "quic://dns0.eu",
        "https://dns.cloudflare.com/dns-query",
        "https://dns.sb/dns-query",
        "tcp://208.67.222.222",
        "tcp://8.26.56.2"
      ]
    };
    if (fakeIpFilter) {
      config["fake-ip-filter"] = fakeIpFilter;
    }
    return config;
  }
  function buildDns({ fakeIPEnabled, ipv6Enabled, upstreamDns }) {
    const generated = fakeIPEnabled ? buildDnsConfig({ mode: "fake-ip", ipv6Enabled, fakeIpFilter: FAKE_IP_FILTER }) : buildDnsConfig({ mode: "redir-host", ipv6Enabled });
    return inheritDnsFields(generated, upstreamDns);
  }

  // src/tun.ts
  function buildTunConfig(tunEnabled, tailscale) {
    return {
      enable: tunEnabled,
      stack: "gvisor",
      device: "mihomo",
      "route-exclude-address": [
        !tailscale ? "100.64.0.0/10" : null,
        !tailscale ? "fd7a:115c:a1e0::/48" : null,
        "192.168.0.0/16"
      ].filter(isNotNull),
      "dns-hijack": ["any:53"],
      mtu: 1500
    };
  }

  // src/selectors.ts
  function buildBaseLists({
    landingChains,
    countryGroups,
    countryNodes,
    nonLandingNodes,
    frontCountryNamesByChain,
    hasManualNodes
  }) {
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
        const candidates = configuredCountries ? configuredCountries.flatMap((country) => countryNodes[country] ?? []) : nonLandingNodes;
        return [id, buildList(candidates.map((node) => node.name).filter(Boolean), "DIRECT")];
      })
    );
    return {
      defaultProxies,
      defaultProxiesDirect,
      defaultSelector,
      frontProxySelectors
    };
  }

  // src/main.ts
  var geoxURL = {
    geoip: `${CDN_URL}/gh/MetaCubeX/meta-rules-dat@release/geoip.dat`,
    geosite: `${CDN_URL}/gh/MetaCubeX/meta-rules-dat@release/geosite.dat`,
    mmdb: `${CDN_URL}/gh/MetaCubeX/meta-rules-dat@release/country.mmdb`,
    asn: `${CDN_URL}/gh/MetaCubeX/meta-rules-dat@release/GeoLite2-ASN.mmdb`
  };
  function getRawArgs() {
    try {
      return $arguments;
    } catch {
      return {};
    }
  }
  function main(config, args = getRawArgs()) {
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
      frontCountryNamesByChain
    } = buildFeatureFlags(args);
    if (!config.proxies || !Array.isArray(config.proxies)) {
      throw new Error("[override-rules] 错误：Clash 配置中缺少有效的 proxies 字段");
    }
    const proxies = sortProxyNodes(config.proxies);
    const parsedLanding = parseNodesByLanding(proxies);
    const landingChains = parsedLanding.nonLandingNodes.length > 0 ? parsedLanding.landingChains : [];
    const nonLandingNodes = landingChains.length > 0 ? parsedLanding.nonLandingNodes : proxies;
    const countryNodes = parseCountries(nonLandingNodes);
    const countryNames = getActiveCountryNames(countryNodes, countryThreshold);
    const countryGroups = buildCountryGroups({
      regexFilter,
      groupType,
      countryNames,
      countryNodes,
      countryExtraCounts,
      excludedNodeNames: landingChains.flatMap(
        (chain) => chain.nodes.map((node) => node.name).filter(Boolean)
      )
    });
    const allNodes = proxies.map((node) => node.name);
    const representedCountries = /* @__PURE__ */ new Set([
      ...countryNames,
      ...Object.keys(countryNodes).filter((country) => (countryExtraCounts[country] ?? 0) > 0)
    ]);
    const manualNodes = proxies.filter((node) => {
      const country = describeProxyNode(node).country;
      return country === null || !representedCountries.has(country);
    }).map((node) => node.name);
    const tailscaleNodes = parseTailscale(proxies);
    const hasTailscale = tailscaleNodes.length > 0;
    const { defaultProxies, defaultProxiesDirect, defaultSelector, frontProxySelectors } = buildBaseLists({
      landingChains,
      countryGroups,
      countryNodes,
      nonLandingNodes,
      frontCountryNamesByChain,
      hasManualNodes: manualNodes.length > 0
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
      frontProxySelectors
    });
    const globalProxies = proxyGroups.map((item) => String(item.name));
    proxyGroups.push({
      name: PROXY_GROUPS.GLOBAL,
      icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Global.png`,
      // Explicit names preserve shared ordering; include-all may reorder dynamically.
      type: "select",
      proxies: [...globalProxies, ...allNodes]
    });
    const finalRules = buildRules({ quicEnabled }, hasTailscale);
    return {
      proxies,
      ...config.hosts !== void 0 && { hosts: config.hosts },
      ...fullConfig && {
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
        profile: { "store-selected": true }
      },
      "proxy-groups": proxyGroups,
      "rule-providers": ruleProviders,
      rules: finalRules,
      sniffer: snifferConfig,
      dns: buildDns({ fakeIPEnabled, ipv6Enabled, upstreamDns: config.dns }),
      tun: buildTunConfig(tunEnabled, hasTailscale),
      "geodata-mode": true,
      "geox-url": geoxURL
    };
  }
  globalThis.main = main;
})();
