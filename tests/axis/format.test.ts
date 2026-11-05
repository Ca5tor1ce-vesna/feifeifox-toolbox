/** 数字格式化的预期按 half-up 手算；旧实现的 fmt() 用同一口径。 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { fmt } from "../../axis-engine/src/index.ts";

test("默认保留两位并四舍五入", () => {
  assert.equal(fmt(1.5), "1.50");
  assert.equal(fmt(0.125), "0.13");
  assert.equal(fmt(10), "10.00");
});

test("可指定小数位，0 位不带小数点", () => {
  assert.equal(fmt(2.5, 0), "3");
  assert.equal(fmt(66.666, 1), "66.7");
});

test("负数保留符号，舍入后为 0 时不带负号", () => {
  assert.equal(fmt(-1.5), "-1.50");
  assert.equal(fmt(-0.001), "0.00");
});
