import assert from "node:assert/strict";
import { test } from "node:test";
import { SPEEDTEST_URL } from "../../src/constants";
import { assertValidReferences, convert, getGroup } from "./helpers";

for (const regex of [false, true]) {
    for (const grouptype of [0, 1, 2]) {
        for (const landing of [false, true]) {
            for (const extra of [false, true]) {
                test(`automatic entry groups are removed (regex=${regex}, grouptype=${grouptype}, landing=${landing}, extra=${extra})`, () => {
                    const proxies = [
                        { name: "香港 A" },
                        { name: "香港 B" },
                        { name: "美国 A" },
                        { name: "美国 B" },
                        ...(landing ? [{ name: "美国 落地", "dialer-proxy": "前置代理" }] : []),
                    ];
                    const result = convert(
                        { proxies },
                        { regex, grouptype: String(grouptype), us: extra ? "2" : "0" }
                    );
                    assert.deepEqual(result.proxies, proxies);
                    for (const group of result["proxy-groups"] ?? []) {
                        for (const removed of ["自动选择", "故障转移"]) {
                            assert.notEqual(group.name, removed);
                            assert.ok(!group.proxies?.includes(removed));
                        }
                        assert.notEqual(group.type, "fallback");
                    }
                    assert.deepEqual(getGroup(result, "选择代理").proxies, [
                        ...(landing ? ["落地节点"] : []),
                        "香港节点",
                        "美国节点",
                        ...(extra ? ["美国额外1", "美国额外2"] : []),
                        "手动选择",
                        "DIRECT",
                    ]);
                    for (const country of ["香港", "美国"]) {
                        const group = getGroup(result, `${country}节点`);
                        assert.equal(group.type, ["select", "url-test", "load-balance"][grouptype]);
                        if (group.type === "url-test" || group.type === "load-balance") {
                            assert.equal(group.url, SPEEDTEST_URL);
                            assert.equal(group.interval, 60);
                            assert.equal(group.tolerance, 20);
                        }
                        if (group.type === "load-balance") {
                            assert.equal(group.strategy, "sticky-sessions");
                        }
                    }
                    if (extra) {
                        assert.equal(getGroup(result, "美国额外1").type, "select");
                        assert.equal(getGroup(result, "美国额外2").type, "select");
                    }
                    const groupNames = result["proxy-groups"]!.map((group) => group.name);
                    assert.equal(
                        groupNames.indexOf("漏网之鱼"),
                        groupNames.indexOf("手动选择") + 1
                    );
                    assert.ok(result.rules?.includes("MATCH,漏网之鱼"));
                    assert.deepEqual(getGroup(result, "漏网之鱼").proxies, ["选择代理", "DIRECT"]);
                    assertValidReferences(result);
                });
            }
        }
    }

    test(`manual selection remains available without regional groups (regex=${regex})`, () => {
        const result = convert({ proxies: [{ name: "未知节点" }] }, { regex });
        assert.deepEqual(getGroup(result, "选择代理").proxies, ["手动选择", "DIRECT"]);
        assert.deepEqual(getGroup(result, "手动选择").proxies, ["未知节点"]);
        const groupNames = result["proxy-groups"]!.map((group) => group.name);
        assert.equal(groupNames.indexOf("漏网之鱼"), groupNames.indexOf("手动选择") + 1);
        assert.ok(result.rules?.includes("MATCH,漏网之鱼"));
        assertValidReferences(result);
    });
}
