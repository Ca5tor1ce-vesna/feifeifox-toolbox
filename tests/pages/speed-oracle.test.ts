/** 配速查询：TypeScript 版和 Python 版（api.py）对同样的输入给出同样的完整结果。
 *
 * 标准答案由 tools/make_speed_oracle.py 从 Python 生成（tests/fixtures/speed_oracle.json）。
 * 数字允许 1e-6 的误差（基准保留 6 位小数），文字、列表长度、键都要一致。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { createApi } from "../../speed-ui/src/calc.ts";
import { assertSame } from "./oracle-compare.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const DATA = join(ROOT, "modules", "honkai-star-rail", "data");
const readJson = (name: string): unknown => JSON.parse(readFileSync(join(DATA, name), "utf-8"));
const data = {
  characters: readJson("characters.json"),
  lightcones: readJson("lightcones.json"),
  relic_sets: readJson("relic_sets.json"),
  modes: readJson("modes.json"),
  dataInfo: readJson("data_info.json"),
};
const oracle = JSON.parse(readFileSync(join(ROOT, "tests", "fixtures", "speed_oracle.json"), "utf-8")) as {
  catalog: unknown;
  lightcones: Record<string, unknown>;
  plans: { label: string; payload: unknown; result: Record<string, unknown> }[];
  recommends: { label: string; payload: unknown; result: unknown }[];
};

test("角色、模式、遗器目录和 Python 一致", () => {
  assertSame(oracle.catalog, createApi(data).call("catalog", {}), "catalog");
});

test("光锥列表（全部 / 按命途）和 Python 一致", () => {
  const api = createApi(data);
  for (const [path, expected] of Object.entries(oracle.lightcones)) {
    assertSame(expected, api.call("lightcones", path === "all" ? {} : { path }), `lightcones(${path})`);
  }
});

test("配速计算的完整结果和 Python 一致", () => {
  const api = createApi(data);
  assert.ok(oracle.plans.length >= 30);
  for (const entry of oracle.plans) {
    assertSame(entry.result, api.call("plan", entry.payload), entry.label, "tables" in entry.result ? [] : ["tables"]);
  }
});

test("自动推荐配装的完整结果和 Python 一致", () => {
  const api = createApi(data);
  for (const entry of oracle.recommends) assertSame(entry.result, api.call("recommend", entry.payload), entry.label);
});
