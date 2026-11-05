/** 抽卡规划：TypeScript 版（gacha-ui/src/calc.ts）和 Python 版（gacha/api.py）对同样的输入给出同样的完整结果。
 * 基准由 tools/make_gacha_oracle.py 从 Python 生成（tests/fixtures/gacha_oracle.json）。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { createGachaApi, type GachaData } from "../../gacha-ui/src/calc.ts";
import { assertSame } from "./oracle-compare.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const data = JSON.parse(readFileSync(join(ROOT, "modules", "honkai-star-rail", "data", "gacha_pools.json"), "utf-8")) as GachaData;
const oracle = JSON.parse(readFileSync(join(ROOT, "tests", "fixtures", "gacha_oracle.json"), "utf-8")) as {
  pools: unknown;
  check: unknown;
  cases: { action: string; payload: Record<string, unknown>; result?: unknown; error?: string }[];
};
const api = createGachaApi(data);

test("卡池列表和参数自检和 Python 一致", () => {
  assertSame(oracle.pools, api.call("pools"), "pools");
  assertSame(oracle.check, api.call("check"), "check");
});

test("下一个五星、目标 UP 的完整分布和 Python 一致，报错文字也一样", () => {
  assert.ok(oracle.cases.length > 50);
  for (const entry of oracle.cases) {
    const label = `${entry.action} ${JSON.stringify(entry.payload)}`;
    if (entry.error !== undefined) {
      assert.throws(() => api.call(entry.action, entry.payload), (error: Error) => error.message === entry.error, label);
    } else {
      assertSame(entry.result, api.call(entry.action, entry.payload), label);
    }
  }
});

test("卡池数据缺失时报能看懂的错", () => {
  assert.throws(() => createGachaApi({ pools: [] }).call("pools"), /卡池数据缺失/);
});
