import assert from "node:assert/strict";
import { test } from "node:test";
import { parse, stringify } from "yaml";
import type { ClashConfig, DnsConfig } from "../../src/types";
import { convert } from "./helpers";

const defaultFakeIpFilter = [
    "geosite:private",
    "geosite:connectivity-check",
    "geosite:category-ntp",
    "geosite:category-stun",
    "Mijia Cloud",
];

const defaultPolicy = {
    "geosite:cn": ["https://doh.pub/dns-query", "https://dns.alidns.com/dns-query"],
};

function assertResolverDefaults(dns: DnsConfig, ipv6 = false): void {
    const expected = {
        enable: true,
        ipv6,
        "prefer-h3": false,
        nameserver: ["https://cloudflare-dns.com/dns-query", "https://dns.google/dns-query"],
        "respect-rules": true,
        "direct-nameserver": ["tls://223.5.5.5"],
        "direct-nameserver-follow-policy": true,
        "proxy-server-nameserver": ["tls://223.5.5.5"],
        "default-nameserver": ["tls://223.5.5.5"],
    };
    const actual = Object.fromEntries(
        Object.keys(expected).map((key) => [key, dns[key as keyof DnsConfig]])
    );
    assert.deepEqual(actual, expected);
    assert.equal(dns.fallback, undefined);
}

test("bundled override emits the DNS defaults with correctly nested YAML fields", () => {
    const output = convert({ proxies: [] });
    assert.ok(output.dns);
    assertResolverDefaults(output.dns);
    assert.deepEqual(output.dns["nameserver-policy"], defaultPolicy);
    assert.equal(output.dns["enhanced-mode"], "fake-ip");
    assert.equal(output.dns["fake-ip-filter-mode"], "blacklist");
    assert.deepEqual(output.dns["fake-ip-filter"], defaultFakeIpFilter);

    const parsed = parse(stringify(output)) as ClashConfig;
    assert.deepEqual(parsed.dns, output.dns);
    assert.equal(Object.hasOwn(parsed, "respect-rules"), false);
    assert.equal(parsed.dns?.["respect-rules"], true);
});

test("DNS resolver defaults apply to both modes while IPv6 remains configurable", () => {
    for (const fakeip of [true, false]) {
        for (const ipv6 of [true, false]) {
            const output = convert({ proxies: [] }, { fakeip: String(fakeip), ipv6: String(ipv6) });
            assert.ok(output.dns);
            assertResolverDefaults(output.dns, ipv6);
            assert.deepEqual(output.dns["nameserver-policy"], defaultPolicy);
            assert.equal(output.dns["enhanced-mode"], fakeip ? "fake-ip" : "redir-host");
            assert.equal(output.dns["fake-ip-filter-mode"], fakeip ? "blacklist" : undefined);
            assert.deepEqual(
                output.dns["fake-ip-filter"],
                fakeip ? defaultFakeIpFilter : undefined
            );
        }
    }
});

test("upstream DNS policies and filters merge without replacing resolver defaults", () => {
    const config: ClashConfig = {
        proxies: [],
        dns: {
            enable: false,
            ipv6: true,
            "prefer-h3": true,
            "enhanced-mode": "redir-host",
            nameserver: ["system"],
            fallback: ["tcp://192.0.2.53"],
            "respect-rules": false,
            "direct-nameserver": ["192.0.2.53"],
            "direct-nameserver-follow-policy": false,
            "proxy-server-nameserver": ["192.0.2.53"],
            "default-nameserver": ["192.0.2.53"],
            "nameserver-policy": { "+.example.test": "192.0.2.53" },
            "proxy-server-nameserver-policy": { "+.proxy.test": ["192.0.2.54"] },
            "fake-ip-filter-mode": "whitelist",
            "fake-ip-filter": [
                "+.example.test",
                "geosite:private",
                "geosite:connectivity-check",
                "Mijia Cloud",
            ],
        },
    };
    const before = structuredClone(config);
    const output = convert(config);
    assert.ok(output.dns);
    assertResolverDefaults(output.dns);
    assert.deepEqual(output.dns["nameserver-policy"], {
        ...defaultPolicy,
        ...config.dns?.["nameserver-policy"],
    });
    assert.deepEqual(
        output.dns["proxy-server-nameserver-policy"],
        config.dns?.["proxy-server-nameserver-policy"]
    );
    assert.equal(output.dns["fake-ip-filter-mode"], "blacklist");
    assert.deepEqual(output.dns["fake-ip-filter"], [...defaultFakeIpFilter, "+.example.test"]);
    assert.deepEqual(config, before);
});

test("upstream policies retain precedence for matching default policy keys", () => {
    const output = convert({
        proxies: [],
        dns: {
            enable: true,
            ipv6: false,
            "prefer-h3": false,
            "enhanced-mode": "fake-ip",
            nameserver: [],
            "nameserver-policy": { "geosite:cn": "https://custom.example/dns-query" },
        },
    });
    assert.ok(output.dns);
    assertResolverDefaults(output.dns);
    assert.deepEqual(output.dns["nameserver-policy"], {
        "geosite:cn": "https://custom.example/dns-query",
    });
});
