import assert from "node:assert/strict";
import { test } from "node:test";
import { countriesMeta } from "../../src/constants";
import { assertValidReferences, convert, getGroup } from "./helpers";

for (const regex of [false, true]) {
    for (const grouptype of [0, 1, 2]) {
        for (const landing of [false, true]) {
            test(`low-cost group removed without deleting nodes (regex=${regex}, grouptype=${grouptype}, landing=${landing})`, () => {
                const regionalNodes = [
                    { name: "美国 0.2x", type: "ss" },
                    { name: "美国 低倍率", type: "ss" },
                    { name: "美国 省流", type: "ss" },
                    { name: "美国 实验性", type: "ss" },
                ];
                const proxies = [
                    ...regionalNodes,
                    ...(landing ? [{ name: "美国 落地 0.3x", "dialer-proxy": "前置代理" }] : []),
                ];
                const orderedRegionalNodes = [
                    regionalNodes[1],
                    regionalNodes[2],
                    regionalNodes[3],
                    regionalNodes[0],
                ];
                const expected = [...orderedRegionalNodes, ...proxies.slice(regionalNodes.length)];
                const result = convert({ proxies }, { regex, grouptype: String(grouptype) });

                assert.deepEqual(result.proxies, expected);
                const manualGroup = result["proxy-groups"]?.find(
                    (group) => group.name === "手动选择"
                );
                assert.equal(manualGroup, undefined);
                assert.ok(!result["proxy-groups"]?.some((group) => group.name === "低倍率节点"));
                assert.ok(
                    result["proxy-groups"]?.every((group) => !group.proxies?.includes("低倍率节点"))
                );
                const countryGroup = getGroup(result, "美国节点");
                assert.equal(countryGroup.type, ["select", "url-test", "load-balance"][grouptype]);
                if (regex) {
                    assert.equal(countryGroup["include-all"], true);
                    assert.equal(countryGroup.filter, countriesMeta.美国.pattern);
                } else {
                    assert.deepEqual(
                        countryGroup.proxies,
                        orderedRegionalNodes.map((node) => node.name)
                    );
                }
                assertValidReferences(result);
            });
        }
    }

    test(`no low-cost group is created for ordinary nodes (regex=${regex})`, () => {
        const result = convert({ proxies: [{ name: "香港 A" }, { name: "香港 B" }] }, { regex });
        assert.ok(!result["proxy-groups"]?.some((group) => group.name === "低倍率节点"));
        assertValidReferences(result);
    });
}
