/** 面板和遗器词条的中文名、显示格式（和游戏里一样：整数、百分比一位小数，都向下取整）。 */
import { displayStat } from "./panel.ts";
import { PROPERTY_TO_STAT, type Slot, type StatKey } from "./types.ts";

export const STAT_NAMES: Record<StatKey, string> = {
  hp: "生命值", atk: "攻击力", def: "防御力", spd: "速度", critRate: "暴击率", critDmg: "暴击伤害",
  breakEffect: "击破特攻", elation: "欢愉度", healBoost: "治疗量加成", err: "能量恢复效率", ehr: "效果命中", effectRes: "效果抵抗",
  dmgPhysical: "物理属性伤害提高", dmgFire: "火属性伤害提高", dmgIce: "冰属性伤害提高", dmgLightning: "雷属性伤害提高",
  dmgWind: "风属性伤害提高", dmgQuantum: "量子属性伤害提高", dmgImaginary: "虚数属性伤害提高", dmgAll: "全属性伤害提高", healTaken: "受治疗加成",
};

/** 面板显示的顺序：左列 6 项 + 本元素伤害，右列 6 项（和战绩图一样）。 */
export const PANEL_ORDER: StatKey[] = ["hp", "atk", "def", "spd", "critRate", "critDmg", "breakEffect", "elation", "healBoost", "err", "ehr", "effectRes"];

export const ELEMENT_STAT: Record<string, StatKey> = {
  Physical: "dmgPhysical", Fire: "dmgFire", Ice: "dmgIce", Thunder: "dmgLightning", Wind: "dmgWind", Quantum: "dmgQuantum", Imaginary: "dmgImaginary",
};

export const SLOT_NAMES: Record<Slot, string> = { HEAD: "头部", HAND: "手部", BODY: "躯干", FOOT: "脚部", NECK: "位面球", OBJECT: "连结绳" };
export const SLOTS: Slot[] = ["HEAD", "HAND", "BODY", "FOOT", "NECK", "OBJECT"];

/** 遗器词条（资料里的属性名）→ 中文名，百分比的生命/攻击/防御后面加「%」以区分。 */
export function propertyName(type: string): string {
  const rule = PROPERTY_TO_STAT[type];
  if (!rule) return type;
  const name = STAT_NAMES[rule.stat];
  return rule.kind === "pct" && (rule.stat === "hp" || rule.stat === "atk" || rule.stat === "def") ? `${name}%` : name;
}

/** 遗器词条的数值：固定值取整，速度留一位小数（我们知道小数，游戏里只显示整数），比例按百分比一位小数。 */
export function propertyValue(type: string, value: number): string {
  const rule = PROPERTY_TO_STAT[type];
  if (!rule) return String(value);
  if (rule.kind === "flat" || rule.kind === "base") return rule.stat === "spd" ? (Math.floor(value * 10 + 1e-6) / 10).toFixed(1) : String(Math.floor(value + 1e-9));
  return displayStat("critRate", value);
}
