/*!
 * override-rules 的 Sub-Store 节点重命名脚本
 *
 * Based on: https://github.com/FengNinger/substore_rename_rule
 * Baseline: https://github.com/FengNinger/substore_rename_rule/blob/63f7a3c63374db789234ea0828bc89ea1640a3db/rename.js
 * Copyright (c) 2025 FengNinger
 * SPDX-License-Identifier: MIT
 *
 * 本项目基于上述版本独立维护此派生脚本，后续实现可能与上游不同。
 * 完整 MIT 许可证及来源说明见 scripts/substore/LICENSE 与 README.md。
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
  function numberNodes(items, separator = " ", omitSingleton = false) {
    const totals = /* @__PURE__ */ new Map();
    const counters = /* @__PURE__ */ new Map();
    const names = /* @__PURE__ */ new Set();
    for (const item of items) totals.set(item.name, (totals.get(item.name) ?? 0) + 1);
    return items.map((item) => {
      const index = (counters.get(item.name) ?? 0) + 1;
      counters.set(item.name, index);
      const name = omitSingleton && totals.get(item.name) === 1 ? item.name : `${item.name}${separator}${String(index).padStart(2, "0")}`;
      if (names.has(name)) {
        throw new Error(
          `[override-rules] Duplicate generated name: ${name}; change sn or name`
        );
      }
      names.add(name);
      return { ...item, name };
    });
  }

  // shared/node_references.ts
  function rewriteDialerReferences(original, renamed) {
    const counts = /* @__PURE__ */ new Map();
    for (const node of original) counts.set(node.name, (counts.get(node.name) ?? 0) + 1);
    const names = new Map(renamed.map(({ originalName, proxy }) => [originalName, proxy.name]));
    return renamed.map(({ proxy }) => {
      const target = proxy["dialer-proxy"];
      if (typeof target !== "string" || !counts.has(target)) return proxy;
      if (counts.get(target) !== 1) {
        throw new Error(`[override-rules] Ambiguous dialer-proxy target: ${target}`);
      }
      const name = names.get(target);
      if (name === void 0) {
        throw new Error(`[override-rules] Filter removed dialer-proxy target: ${target}`);
      }
      return { ...proxy, "dialer-proxy": name };
    });
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
      names.map((text2, regionIndex) => {
        const escaped = text2.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const token = format === "us" || format === "quan";
        return {
          regionIndex,
          length: text2.length,
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

  // scripts/substore/rename.ts
  var formats = {
    cn: "cn",
    zh: "cn",
    us: "us",
    en: "us",
    quan: "quan",
    gq: "gq",
    flag: "gq"
  };
  var informationName = /剩余|已用|套餐|到期|有效期|下次重置|重置时间|官网|官址|官方网站|订阅地址|联系客服|工单|(?:^|\b)(?:USED|TOTAL|EXPIRE|EMAIL)(?:\b|$)|^流量\s*[:：]/i;
  var keya = /港|Hong|HK|新加坡|SG|Singapore|日本|Japan|JP|美国|United States|US|韩|土耳其|TR|Turkey|Korea|KR|🇸🇬|🇭🇰|🇯🇵|🇺🇸|🇰🇷|🇹🇷/i;
  var keyb = /(((1|2|3|4)\d)|(香港|Hong|HK) 0[5-9]|((新加坡|SG|Singapore|日本|Japan|JP|美国|United States|US|韩|土耳其|TR|Turkey|Korea|KR) 0[3-9]))/i;
  var aliases = {
    GB: /UK/g,
    "B-G-P": /BGP/g,
    "Russia Moscow": /Moscow/g,
    "Korea Chuncheon": /Chuncheon|Seoul/g,
    "Hong Kong": /Hongkong|HONG KONG/gi,
    "United Kingdom London": /London|Great Britain/g,
    "Dubai United Arab Emirates": /United Arab Emirates/g,
    "Taiwan TW 台湾 🇹🇼": /(台|Tai\s?wan|TW).*?🇨🇳|🇨🇳.*?(台|Tai\s?wan|TW)/g,
    "United States": /USA|Los Angeles|San Jose|Silicon Valley|Michigan/g,
    澳大利亚: /澳洲|墨尔本|悉尼|土澳|(深|沪|呼|京|广|杭)澳/g,
    德国: /(深|沪|呼|京|广|杭)德(?!.*(I|线))|法兰克福|滬德/g,
    香港: /(深|沪|呼|京|广|杭)港(?!.*(I|线))/g,
    日本: /(深|沪|呼|京|广|杭|中|辽)日(?!.*(I|线))|东京|大坂/g,
    新加坡: /狮城|(深|沪|呼|京|广|杭)新/g,
    美国: /(深|沪|呼|京|广|杭)美|波特兰|芝加哥|哥伦布|纽约|硅谷|俄勒冈|西雅图|芝加哥/g,
    波斯尼亚和黑塞哥维那: /波黑共和国/g,
    印尼: /印度尼西亚|雅加达/g,
    印度: /孟买/g,
    阿联酋: /迪拜|阿拉伯联合酋长国/g,
    孟加拉国: /孟加拉/g,
    捷克: /捷克共和国/g,
    台湾: /新台|新北|台(?!.*线)/g,
    Taiwan: /Taipei/g,
    韩国: /春川|韩|首尔/g,
    Japan: /Tokyo|Osaka/g,
    英国: /伦敦/g,
    India: /Mumbai/g,
    Germany: /Frankfurt/g,
    Switzerland: /Zurich/g,
    俄罗斯: /莫斯科/g,
    土耳其: /伊斯坦布尔/g,
    泰国: /泰國|曼谷/g,
    法国: /巴黎/g,
    G: /\d\s?GB/gi,
    Esnc: /esnc/gi
  };
  var fixedTags = [
    [/\bIPLC\b/i, "IPLC"],
    [/\bIEPL\b/i, "IEPL"],
    [/核心|\bKern\b/i, "Kern"],
    [/边缘|\bEdge\b/i, "Edge"],
    [/高级|\bPro\b/i, "Pro"],
    [/标准|\bStd\b/i, "Std"],
    [/实验|\bExp\b/i, "Exp"],
    [/商宽|\bBiz\b/i, "Biz"],
    [/家宽|\bFam\b/i, "Fam"],
    [/游戏|\bgame\b/i, "Game"],
    [/购物|\bBuy\b/i, "Buy"],
    [/专线|\bZx\b/i, "Zx"],
    [/\bLB\b/, "LB"],
    [/cloudflare|\bCF\b/i, "CF"],
    [/\budp\b/i, "UDP"],
    [/\bgpt\b/i, "GPT"],
    [/\budpn\b/i, "UDPN"],
    [/自建|\bself\b/i, "自建"],
    [/落地|\blanding\b/i, "落地"]
  ];
  function enabled(value) {
    return value === true || value === "" || typeof value === "string" && /^(true|1|on)$/i.test(value);
  }
  function text(value, fallback = "") {
    if (typeof value !== "string") return fallback;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  function customTags(name, expression) {
    return expression.split("+").flatMap((rule) => {
      const [match, ...replacement] = rule.split(">");
      if (!match || !name.includes(match)) return [];
      return [replacement.length ? replacement.join(">") : match];
    }).filter(Boolean);
  }
  function transitGroup(name) {
    const match = name.normalize("NFKC").match(/中转\s*([A-Za-z])?(?=$|[^A-Za-z0-9])/i);
    return match ? `前置代理${(match[1] ?? "").toUpperCase()}` : null;
  }
  function renameNodes(proxies, args = {}) {
    const separator = text(args.fgf, " ");
    const prefix = text(args.name);
    const readFormat = (value) => Object.prototype.hasOwnProperty.call(formats, value) ? formats[value] : void 0;
    const output = readFormat(text(args.out)) ?? "cn";
    const input = readFormat(text(args.in));
    const entries = [];
    for (const original of proxies) {
      const rawName = original.name;
      const nodePrefix = prefix;
      if (enabled(args.clear) && informationName.test(rawName)) continue;
      const multiplier = readMultiplier(rawName);
      if (enabled(args.nx) && multiplier !== null && multiplier !== 1) continue;
      if (enabled(args.blnx) && !(multiplier !== null && multiplier > 1)) continue;
      if (enabled(args.key) && !(keya.test(rawName) && /2|4|6|7/i.test(rawName))) continue;
      let normalized = rawName;
      for (const [replacement, regex] of Object.entries(aliases)) {
        normalized = normalized.replace(regex, () => replacement);
      }
      const region = findRegion(rawName, input) ?? findRegion(normalized, input);
      if (!region && !enabled(args.nm)) continue;
      const proxy = { ...original };
      const blockQuic = text(args.blockquic);
      if (blockQuic === "on" || blockQuic === "off") proxy["block-quic"] = blockQuic;
      const labels = region ? customTags(rawName, text(args.blkey)) : [];
      if (region) {
        if ((enabled(args.bl) || enabled(args.blgd) && /ˣ/.test(rawName)) && multiplier !== null && multiplier !== 1) {
          labels.push(`${multiplier}×`);
        }
        if (enabled(args.blgd)) {
          labels.push(
            ...fixedTags.filter(([regex]) => regex.test(rawName)).map(([, label]) => label)
          );
        }
        const flag = enabled(args.flag) && output !== "gq" ? FG[region.regionIndex] : "";
        const leading = enabled(args.nf) ? [nodePrefix, flag] : [flag, nodePrefix];
        proxy.name = [...leading, regionNames[output][region.regionIndex], ...new Set(labels)].filter(Boolean).join(separator);
      } else {
        proxy.name = [nodePrefix, rawName].filter(Boolean).join(separator);
      }
      if (enabled(args.chain)) {
        const targets = [transitGroup(rawName), ...labels.map(transitGroup)].filter(
          (target2) => target2 !== null
        );
        const uniqueTargets = [...new Set(targets)];
        if (uniqueTargets.length > 1) {
          throw new Error(
            `[override-rules] chain tag conflict on ${original.name}: ${uniqueTargets.join(" != ")}`
          );
        }
        const target = uniqueTargets[0];
        if (target) {
          const current = proxy["dialer-proxy"];
          if (current !== void 0 && current !== target) {
            throw new Error(
              `[override-rules] dialer-proxy conflict on ${original.name}: ${current} != ${target}`
            );
          }
          proxy["dialer-proxy"] = target;
        }
      }
      const meta = {
        country: region?.country ?? null,
        prefix: "",
        category: classifyNode(multiplier, hasSpecialTag(rawName))
      };
      entries.push({ proxy, meta, originalName: original.name });
    }
    let ordered = orderNodes(entries, ({ meta }) => meta);
    if (enabled(args.key)) {
      const numbered2 = numberNodes(
        ordered.map(({ proxy }) => proxy),
        text(args.sn, " ")
      );
      ordered = ordered.filter((_, index) => !keyb.test(numbered2[index].name));
    }
    const numbered = numberNodes(
      ordered.map(({ proxy }) => proxy),
      text(args.sn, " "),
      enabled(args.one)
    );
    return rewriteDialerReferences(
      proxies,
      ordered.map(({ originalName }, index) => ({ originalName, proxy: numbered[index] }))
    );
  }
  function operator(proxies) {
    const args = typeof $arguments === "undefined" ? {} : $arguments;
    return renameNodes(proxies, args);
  }
  globalThis.operator = operator;
})();
