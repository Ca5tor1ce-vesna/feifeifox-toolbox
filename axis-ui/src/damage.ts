/**
 * 行动轴页面的伤害：把引擎的报告整理成页面要的样子。
 * 伤害公式还没写（DAMAGE_MODEL 是 null）时引擎不开账本，页面和以前一样。
 * 地址里带 ?damage-preview 时用假数字看排版，页面上会写明不是真实伤害；有了真公式就删掉预览。
 */
import type { DamageModel, DamageReport, ZoneFactor } from "../../axis-engine/src/damage/types.ts";

export const DAMAGE_MODEL: DamageModel | null = null;

export interface DamageSetup {
  model: DamageModel;
  preview?: boolean;
}

export interface RowDamage {
  expected: number;
  zones: readonly ZoneFactor[];
}

export interface DamageUnitView {
  slot: number;
  name: string;
  hits: number;
  total: number;
  /** 占总伤害的比例，0~1。 */
  share: number;
}

export interface DamageView {
  total: number;
  /** 每 100 AV 的伤害，不同窗口之间好比较。 */
  per100AV: number;
  units: DamageUnitView[];
  /** 时间轴行的 key → 这一行的伤害。 */
  rows: Record<string, RowDamage>;
  /** 没有资料的攻击，已经写成「姬子 终结技 ×3」。 */
  missing: string[];
  /** 没读实际装配、算不准的角色。 */
  noPanel: string[];
  preview: boolean;
}

const PREVIEW_RATIO: Record<string, number> = { basic: 1, enhanced_basic: 1.5, skill: 2, ultimate: 4.5, fua: 1.2, elation_skill: 1.8 };

/** 假数字，只用来看排版。忆灵故意算不出来，好看到「没算进来」长什么样。 */
const PREVIEW_MODEL: DamageModel = {
  evaluate: (hit, { attacker }) => {
    const ratio = PREVIEW_RATIO[hit.kind];
    if (ratio === undefined) return null;
    const base = (attacker?.atk ?? 2000) * ratio;
    const zones = [{ zone: "暴击", factor: 1.8 }, { zone: "增伤", factor: 1.4 }, { zone: "防御", factor: 0.5 }, { zone: "抗性", factor: 0.9 }];
    return { zones, expected: zones.reduce((value, zone) => value * zone.factor, base) };
  },
};

export function activeDamage(search = (globalThis as { location?: { search: string } }).location?.search ?? ""): DamageSetup | null {
  if (DAMAGE_MODEL) return { model: DAMAGE_MODEL };
  return /[?&]damage-preview\b/.test(search) ? { model: PREVIEW_MODEL, preview: true } : null;
}

export const formatDamage = (value: number): string => Math.round(value).toLocaleString("zh-CN");

/** rowKeys 和时间轴一一对应，kindNames 是攻击种类的中文名。 */
export function damageView(
  report: DamageReport,
  rowKeys: readonly string[],
  kindNames: Readonly<Record<string, string>>,
  maxAV: number,
  noPanel: string[],
  preview: boolean,
): DamageView {
  const total = report.total ?? 0;
  const rows: Record<string, RowDamage> = {};
  for (const row of report.rows) {
    const key = row.event === null ? undefined : rowKeys[row.event];
    if (!key || !row.outcome) continue;
    const previous = rows[key];
    rows[key] = { expected: (previous?.expected ?? 0) + row.outcome.expected, zones: previous?.zones ?? row.outcome.zones };
  }
  return {
    total,
    per100AV: maxAV > 0 ? (total / maxAV) * 100 : 0,
    units: report.byUnit.map((unit) => ({ slot: unit.slot, name: unit.unitName, hits: unit.hits, total: unit.total, share: total > 0 ? unit.total / total : 0 })),
    rows,
    missing: report.missing.map((item) => `${item.unitName} ${kindNames[item.kind] ?? item.kind} ×${item.count}`),
    noPanel,
    preview,
  };
}

/** 一张卡上几行伤害的合计，没有伤害时是 null。 */
export function cardDamage(keys: readonly string[], rows: Readonly<Record<string, RowDamage>> | null): number | null {
  const found = keys.flatMap((key) => (rows?.[key] ? [rows[key].expected] : []));
  return found.length ? found.reduce((sum, value) => sum + value, 0) : null;
}
