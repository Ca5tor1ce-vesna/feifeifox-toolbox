/**
 * 角色面板：白值（角色 + 光锥）× (1 + 百分比) + 固定值；暴击、能量恢复效率这类比例直接相加。
 * 进面板的只有常驻属性：光锥被动的 properties（命途相同才算）、属性行迹、遗器主副词条、套装 2 件/4 件的常驻属性。
 * 战斗中才有的效果不算，和游戏里的角色面板一致。
 */
import { relicStats } from "./relic.ts";
import { PROPERTY_TO_STAT, type Prop, type RelicPiece, type RosterCharacter, type Slot, type StatData, type StatKey } from "./types.ts";

export interface StatLine {
  /** 白值（生命、攻击、防御、速度），或角色自带的基础比例（暴击率 5%、能量恢复效率 100%）。 */
  base: number;
  bonus: number;
  total: number;
  /** 每一项加成：来源和折算成这项属性后的数值（百分比加成已经乘过白值）。 */
  sources: { label: string; value: number }[];
}
export type Panel = Record<StatKey, StatLine>;

const ALL_STATS: StatKey[] = [
  "hp", "atk", "def", "spd", "critRate", "critDmg", "breakEffect", "elation", "healBoost", "err", "ehr", "effectRes",
  "dmgPhysical", "dmgFire", "dmgIce", "dmgLightning", "dmgWind", "dmgQuantum", "dmgImaginary", "dmgAll", "healTaken",
];
const SCALED = new Set<StatKey>(["hp", "atk", "def", "spd"]);
const SLOT_NAMES: Record<Slot, string> = { HEAD: "头部", HAND: "手部", BODY: "躯干", FOOT: "脚部", NECK: "位面球", OBJECT: "连结绳" };
/** 角色属性 → 这个角色的元素伤害那一栏。 */
export const ELEMENT_STAT: Record<string, StatKey> = {
  Physical: "dmgPhysical", Fire: "dmgFire", Ice: "dmgIce", Thunder: "dmgLightning", Wind: "dmgWind", Quantum: "dmgQuantum", Imaginary: "dmgImaginary",
};

/** 某突破阶段允许的最高等级：突破 0 是 20 级，之后每档 +10，突破 6 是 80 级。 */
const maxLevel = (promotion: number): number => 20 + 10 * promotion;

export function computePanel(character: RosterCharacter, relics: RelicPiece[], data: StatData): Panel {
  const info = data.characters.get(String(character.id));
  if (!info) throw new Error(`角色 ${character.id} 不在数据里，可能是新角色，请更新工具箱。`);
  const promo = info.promotions[character.promotion];
  if (!promo) throw new Error(`${info.name} 没有突破 ${character.promotion} 的数据。`);
  const level = character.level;
  const panel = Object.fromEntries(ALL_STATS.map((stat) => [stat, { base: 0, bonus: 0, total: 0, sources: [] }])) as unknown as Panel;
  panel.hp.base = promo.hp[0] + promo.hp[1] * (level - 1);
  panel.atk.base = promo.atk[0] + promo.atk[1] * (level - 1);
  panel.def.base = promo.def[0] + promo.def[1] * (level - 1);
  panel.spd.base = promo.spd;
  panel.critRate.base = promo.critRate;
  panel.critDmg.base = promo.critDmg;
  panel.err.base = 1;

  const props: { prop: Prop; label: string }[] = [];
  const cone = character.lightcone;
  if (cone) {
    const coneInfo = data.lightcones.get(String(cone.id));
    if (!coneInfo) throw new Error(`光锥 ${cone.id} 不在数据里，可能是新光锥，请更新工具箱。`);
    const row = coneInfo.promotions[cone.promotion];
    if (!row) throw new Error(`${coneInfo.name} 没有突破 ${cone.promotion} 的数据。`);
    panel.hp.base += row.hp[0] + row.hp[1] * (cone.level - 1);
    panel.atk.base += row.atk[0] + row.atk[1] * (cone.level - 1);
    panel.def.base += row.def[0] + row.def[1] * (cone.level - 1);
    // 光锥被动只在命途相同时生效（游戏规则），白值照算。
    if (coneInfo.path === info.path) {
      for (const prop of coneInfo.panelProps[cone.superimpose - 1] ?? []) props.push({ prop, label: `光锥·${coneInfo.name}` });
    }
  }
  for (const node of character.traces) {
    for (const prop of info.statTraces[node] ?? []) props.push({ prop, label: "行迹" });
  }
  const setCounts = new Map<string, number>();
  for (const relic of relics) {
    const pieceInfo = data.pieces.get(String(relic.pieceId));
    if (!pieceInfo) throw new Error(`遗器编号 ${relic.pieceId} 不在数据里，可能是新遗器，请更新工具箱。`);
    const setName = data.relicSets.get(pieceInfo.setId)?.name ?? `套装 ${pieceInfo.setId}`;
    const { main, subs } = relicStats(relic, data);
    const label = `${setName}·${SLOT_NAMES[pieceInfo.slot]}`;
    props.push({ prop: main, label: `${label}（主词条）` });
    for (const sub of subs) props.push({ prop: sub, label });
    setCounts.set(pieceInfo.setId, (setCounts.get(pieceInfo.setId) ?? 0) + 1);
  }
  for (const [setId, count] of setCounts) {
    const set = data.relicSets.get(setId);
    if (!set) continue;
    if (count >= 2) for (const prop of set.properties[0] ?? []) props.push({ prop, label: `${set.name}·2 件` });
    if (count >= 4) for (const prop of set.properties[1] ?? []) props.push({ prop, label: `${set.name}·4 件` });
  }

  // 先把加进白值的算完，再按白值折算百分比。
  for (const { prop, label } of props) {
    const rule = PROPERTY_TO_STAT[prop.type];
    if (!rule) throw new Error(`不认识的属性 ${prop.type}，数据可能比工具新，请更新工具箱。`);
    if (rule.kind === "base") {
      panel[rule.stat].base += prop.value;
      panel[rule.stat].sources.push({ label: `${label}（白值）`, value: prop.value });
    }
  }
  for (const { prop, label } of props) {
    const rule = PROPERTY_TO_STAT[prop.type];
    if (rule.kind === "base") continue;
    const line = panel[rule.stat];
    const value = rule.kind === "pct" ? line.base * prop.value : prop.value;
    line.bonus += value;
    line.sources.push({ label, value });
  }
  for (const stat of ALL_STATS) panel[stat].total = panel[stat].base + panel[stat].bonus;
  return panel;
}

/** 游戏的显示规则：生命、攻击、防御、速度向下取整；其余是百分比，向下取整到一位小数。 */
export function displayStat(stat: StatKey, value: number): string {
  if (SCALED.has(stat)) return String(Math.floor(value + 1e-9));
  return `${(Math.floor(value * 1000 + 1e-6) / 10).toFixed(1)}%`;
}

/**
 * 等级正好在突破临界（20/30/…/70）时，同一个等级可能已突破也可能没突破，白值不同。
 * 试两档，选生命、攻击、防御的显示值和图上一致的那档；判断不了时按已突破处理，certain 为 false。
 */
export function inferPromotion(
  character: RosterCharacter,
  relics: RelicPiece[],
  shown: Partial<Record<StatKey, number>>,
  data: StatData,
): { promotion: number; certain: boolean } {
  const level = character.level;
  const exact = level <= 20 ? 0 : Math.ceil((level - 20) / 10);
  if (maxLevel(exact) !== level || exact >= 6) return { promotion: Math.min(exact, 6), certain: true };
  const candidates = [exact, exact + 1];
  const keys = (["hp", "atk", "def"] as const).filter((stat) => typeof shown[stat] === "number");
  if (!keys.length) return { promotion: exact + 1, certain: false };
  const matches = candidates.filter((promotion) => {
    const panel = computePanel({ ...character, promotion }, relics, data);
    return keys.every((stat) => displayStat(stat, panel[stat].total) === String(shown[stat]));
  });
  return matches.length === 1 ? { promotion: matches[0], certain: true } : { promotion: exact + 1, certain: false };
}
