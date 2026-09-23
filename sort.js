/*!
 * override-rules: sort a merged Sub-Store collection without renaming its nodes.
 * SPDX-License-Identifier: MIT
 * Region data attribution: see shared/regions.ts and scripts/substore/LICENSE.
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
  function orderNamedNodes(nodes) {
    return orderNodes(nodes, (node) => describeName(node.name ?? ""));
  }

  // scripts/substore/sort.ts
  function operator(proxies) {
    return orderNamedNodes(proxies);
  }
  globalThis.operator = operator;
})();
