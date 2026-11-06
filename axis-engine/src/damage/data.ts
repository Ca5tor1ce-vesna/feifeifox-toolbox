/** 伤害资料的检查和通用算式。乘区怎么算由模型决定，这里只管形状对不对。 */
import type { DamageData, ZoneFactor } from "./types.ts";

const TARGETS = new Set(["main", "adjacent", "all", "random"]);
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const isRatio = (value: unknown): boolean => typeof value === "number" && Number.isFinite(value) && value >= 0;

/** 各乘区相乘。base 是乘区之前的基础值。 */
export function zoneProduct(base: number, zones: readonly ZoneFactor[]): number {
  return zones.reduce((value, zone) => value * zone.factor, base);
}

/** 资料文件有问题时列出每一处，全部写清楚位置，而不是停在第一处。空列表表示没问题。 */
export function checkDamageData(raw: unknown): string[] {
  if (!isRecord(raw)) return ["伤害资料不是 JSON 对象"];
  const data = raw as Partial<DamageData> & Record<string, unknown>;
  const problems: string[] = [];
  if (data.version !== 1) problems.push(`version 需要是 1，收到 ${String(data.version)}`);
  const zones = new Set<string>();
  if (!Array.isArray(data.zones) || !data.zones.length) problems.push("zones 需要是非空列表");
  else {
    data.zones.forEach((zone, index) => {
      if (!zone?.id || !zone?.name) problems.push(`zones[${index}] 缺 id 或 name`);
      else if (zones.has(zone.id)) problems.push(`zones 里 ${zone.id} 重复了`);
      else zones.add(zone.id);
    });
  }
  if (!isRecord(data.skills)) problems.push("skills 需要是「角色 id → 攻击种类」的对象");
  else {
    for (const [unitId, kinds] of Object.entries(data.skills)) {
      if (!isRecord(kinds)) {
        problems.push(`skills.${unitId} 不是对象`);
        continue;
      }
      for (const [kind, skill] of Object.entries(kinds)) {
        const where = `skills.${unitId}.${kind}`;
        const parts = (skill as { parts?: unknown })?.parts;
        if (!Array.isArray(parts)) {
          problems.push(`${where} 没有 parts`);
          continue;
        }
        parts.forEach((part, index) => {
          const at = `${where}.parts[${index}]`;
          if (!part?.stat) problems.push(`${at} 缺 stat`);
          if (!TARGETS.has(part?.target)) problems.push(`${at} 的 target 不对：${String(part?.target)}`);
          if (!Array.isArray(part?.ratio) || !part.ratio.length || !part.ratio.every(isRatio)) problems.push(`${at} 的 ratio 需要是按等级排的非负数列表`);
          if (part?.hits !== undefined) {
            const sum = Array.isArray(part.hits) ? part.hits.reduce((total: number, value: number) => total + value, 0) : NaN;
            if (!(Math.abs(sum - 1) < 1e-6)) problems.push(`${at} 的 hits 加起来需要是 1，现在是 ${sum}`);
          }
        });
      }
    }
  }
  (Array.isArray(data.modifiers) ? data.modifiers : []).forEach((modifier, index) => {
    if (!modifier?.source) problems.push(`modifiers[${index}] 缺 source`);
    if (!zones.has(modifier?.zone)) problems.push(`modifiers[${index}] 的 zone 不在 zones 里：${String(modifier?.zone)}`);
    const values: unknown[] = Array.isArray(modifier?.value) ? [...modifier.value] : [modifier?.value];
    if (!values.length || !values.every((value) => typeof value === "number" && Number.isFinite(value))) problems.push(`modifiers[${index}] 的 value 需要是数字或数字列表`);
  });
  return problems;
}
