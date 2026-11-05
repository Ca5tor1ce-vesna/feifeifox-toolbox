/**
 * 迁移验收：同一条输入，新引擎的旧格式输出要和旧引擎的基准逐字段一致（数字容差 1e-9）。
 * 这只证明迁移没有改变行为，不证明机制正确；机制正确性靠 regressions.test.ts 的手算预期。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { legacyCatalog, runLegacy } from "../../axis-engine/src/legacy.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const { cases } = JSON.parse(readFileSync(join(HERE, "..", "fixtures", "axis_baseline.json"), "utf-8"));

function diff(path: string, expected: unknown, actual: unknown, out: string[]): void {
  if (out.length >= 12) return;
  if (typeof expected === "number" && typeof actual === "number") {
    if (Math.abs(expected - actual) > Math.max(1e-9, Math.abs(expected) * 1e-9)) out.push(`${path}: 基准 ${expected}，实际 ${actual}`);
    return;
  }
  if (expected === null || actual === null || typeof expected !== "object" || typeof actual !== "object") {
    if (expected !== actual) out.push(`${path}: 基准 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
    return;
  }
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) { out.push(`${path}: 一边是数组一边不是`); return; }
    expected.slice(0, Math.min(expected.length, actual.length)).forEach((item, index) => diff(`${path}[${index}]`, item, actual[index], out));
    if (expected.length !== actual.length) out.push(`${path}: 长度 基准 ${expected.length}，实际 ${actual.length}`);
    return;
  }
  const a = expected as Record<string, unknown>, b = actual as Record<string, unknown>;
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!(key in a)) out.push(`${path}.${key}: 基准没有这个字段，实际 ${JSON.stringify(b[key])}`);
    else if (!(key in b)) out.push(`${path}.${key}: 实际缺少这个字段，基准 ${JSON.stringify(a[key])}`);
    else diff(`${path}.${key}`, a[key], b[key], out);
  }
}

for (const item of cases) {
  test(`基准：${item.name}`, () => {
    if (item.action === "catalog") {
      const out: string[] = [];
      diff("catalog", item.result, legacyCatalog(), out);
      assert.equal(out.length, 0, out.join("\n"));
      return;
    }
    let result: unknown;
    let error: string | null = null;
    try {
      result = runLegacy(item.action, item.payload);
    } catch (err) {
      error = (err as Error).message;
    }
    if (!item.ok) {
      assert.equal(error, item.error);
      return;
    }
    assert.equal(error, null);
    const out: string[] = [];
    diff("result", item.result, result, out);
    assert.equal(out.length, 0, out.join("\n"));
  });
}
