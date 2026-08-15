import assert from "node:assert/strict";
import { DEFAULT_DAILY_ORDER, isUnspecifiedDailyOrder, pickDailyOrder } from "./dailyOrder.ts";

assert.equal(DEFAULT_DAILY_ORDER[0], "year");
assert.ok(isUnspecifiedDailyOrder(null));
assert.ok(isUnspecifiedDailyOrder([]));
assert.ok(isUnspecifiedDailyOrder(["missed", "year", "weak", "highyield", "unseen"]));
assert.ok(!isUnspecifiedDailyOrder(["year", "missed", "weak", "highyield", "unseen"]));
assert.ok(!isUnspecifiedDailyOrder(["weak", "year", "missed", "highyield", "unseen"]));

const custom = ["weak", "year", "missed", "highyield", "unseen"];
assert.deepEqual(pickDailyOrder(custom, ["missed", "year", "weak", "highyield", "unseen"]), custom);
assert.deepEqual(pickDailyOrder([], custom), custom);
assert.deepEqual(pickDailyOrder([], ["missed", "year", "weak", "highyield", "unseen"]), [...DEFAULT_DAILY_ORDER]);

console.log("dailyOrder tests ok");
