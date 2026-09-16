import assert from "node:assert/strict";
import { test } from "node:test";
import { describeName } from "../../shared/display_name";
import { orderCountries, orderNodes } from "../../shared/node_order";
import { categoryWeights } from "../../shared/preferences";
import { findRegion } from "../../shared/regions";
import { describeProxyNode } from "../../src/node_parser";

test("legacy display labels share the same country identity at every boundary", () => {
    for (const name of ["马来", "马来西亚", "MY", "Malaysia", "🇲🇾"]) {
        assert.equal(findRegion(name)?.country, "马来西亚", name);
        assert.equal(describeName(name).country, "马来西亚", name);
        assert.equal(describeProxyNode({ name }).country, "马来西亚", name);
    }
    const countries = { 马来西亚: 5, 香港: 10 };
    const input = ["香港 01", "马来 01", "Malaysia 02"];
    assert.deepEqual(orderNodes(input, describeName, {
        countries, prefixes: {}, categories: categoryWeights,
    }), ["马来 01", "Malaysia 02", "香港 01"]);
    assert.deepEqual(orderCountries(["香港", "马来西亚"], (name) => name, countries), ["马来西亚", "香港"]);
});
