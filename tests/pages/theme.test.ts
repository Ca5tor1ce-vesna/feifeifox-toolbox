/** 白天 / 夜晚模式（app/theme.js）：第一次跟随系统，手动选过以手动为准。切换和配色在浏览器里验收。 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveTheme } from "../../app/theme.js";

test("主题：没选过时跟随系统", () => {
  assert.equal(resolveTheme(null, true), "night");
  assert.equal(resolveTheme(null, false), "day");
});

test("主题：手动选过就不看系统，存的值不对时当没选过", () => {
  assert.equal(resolveTheme("day", true), "day");
  assert.equal(resolveTheme("night", false), "night");
  assert.equal(resolveTheme("dark", true), "night");
});
