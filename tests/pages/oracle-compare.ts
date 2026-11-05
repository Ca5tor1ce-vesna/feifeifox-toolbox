/** 对拍用的比较：TS 版的结果和 Python 算出的基准逐字段比，数字允许 1e-6 的误差。 */
import assert from "node:assert/strict";

/** 找出所有不一致的地方；skip 里的键是基准有意不记的（比如后面几条配置的表格）。 */
export function differences(expected: unknown, actual: unknown, path = "", skip: string[] = []): string[] {
  if (typeof expected === "number") {
    return typeof actual === "number" && Math.abs(expected - actual) <= 1e-6 ? [] : [`${path}：期望 ${expected}，实际 ${JSON.stringify(actual)}`];
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return [`${path}：期望数组，实际 ${JSON.stringify(actual)?.slice(0, 80)}`];
    if (actual.length !== expected.length) return [`${path}：长度期望 ${expected.length}，实际 ${actual.length}`];
    return expected.flatMap((item, index) => differences(item, actual[index], `${path}[${index}]`));
  }
  if (expected && typeof expected === "object") {
    if (!actual || typeof actual !== "object" || Array.isArray(actual)) return [`${path}：期望对象，实际 ${JSON.stringify(actual)?.slice(0, 80)}`];
    const exp = expected as Record<string, unknown>;
    const act = actual as Record<string, unknown>;
    const extra = Object.keys(act).filter((key) => !(key in exp) && !skip.includes(key) && act[key] !== undefined);
    return [
      ...extra.map((key) => `${path}.${key}：Python 没有这个键`),
      ...Object.keys(exp).flatMap((key) => differences(exp[key], act[key], `${path}.${key}`)),
    ];
  }
  // Python 的 None 在 JSON 里是 null；TS 版不能给 undefined。
  return expected === actual ? [] : [`${path}：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`];
}

export const assertSame = (expected: unknown, actual: unknown, label: string, skip: string[] = []): void => {
  const diff = differences(expected, JSON.parse(JSON.stringify(actual)), label, skip);
  assert.equal(diff.length, 0, `${diff.length} 处不一致：\n${diff.slice(0, 20).join("\n")}`);
};

