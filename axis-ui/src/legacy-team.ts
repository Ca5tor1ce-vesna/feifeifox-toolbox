/**
 * 旧欢愉队页面的队伍存档和预设。存档还留在用户电脑上，所以一直要能读。
 *
 * 旧格式的 permPct、permFlat 已经含光锥和套装的常驻速度，新页面的光锥和套装由引擎结算。
 * 和读取配装一样，只把差额记成额外速度：读进来的面板速度和旧存档一致，同一件装备不算两遍。
 */
import { createBattle, type GameData } from "../../axis-engine/src/battle.ts";
import type { ActionKind } from "../../axis-engine/src/types.ts";
import { newElationSettings, newMember, newState, restoreState, toMemberInput, type PageData, type PageMember, type PageState } from "./model.ts";

export interface LegacyUnit {
  id: string;
  baseSpd?: number;
  lcBaseSpd?: number;
  traceSpd?: number;
  permPct?: number;
  permFlat?: number;
  err?: number;
  eidolon?: number;
  initialEnergy?: number | string;
  initAdv?: number;
  targetSlot?: number | null;
  rotation?: string;
  equipment?: Record<string, boolean>;
  [key: string]: unknown;
}

export interface LegacyRecord {
  team: LegacyUnit[];
  config: Record<string, unknown>;
}

/** 新格式的队伍存档。没有 format 的是旧存档。 */
export interface TeamRecord {
  name: string;
  savedAt?: string;
  format?: "axis";
  state?: Partial<PageState>;
  team: unknown[];
  config?: Record<string, unknown>;
}

/** 旧开关对应的光锥。叠影：旧页面专武只支持叠 1，舞舞舞只支持叠 5。 */
const CONE_FLAGS: [string, string, number][] = [
  ["danceS5", "21018", 5],
  ["hasSummerLc", "23064", 1],
  ["hasPearlLc", "23055", 1],
  ["hasYaoLc", "23054", 1],
  ["hasFeiyLc", "23058", 1],
  ["hasSundayLc", "23034", 1],
  ["hasRobinLc", "23026", 1],
  ["hasWolfLc", "23057", 1],
];

const number = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return value === "" || value === null || value === undefined || !Number.isFinite(parsed) ? fallback : parsed;
};

export function memberFromLegacyUnit(unit: LegacyUnit, game: GameData): PageMember {
  const member = newMember(String(unit.id));
  const flags = unit.equipment ?? {};
  member.eidolon = number(unit.eidolon);
  member.err = number(unit.err);
  member.initAdv = number(unit.initAdv);
  member.initialEnergy = unit.initialEnergy === "" || unit.initialEnergy === undefined || unit.initialEnergy === null ? null : number(unit.initialEnergy);
  member.targetSlot = unit.targetSlot === undefined || unit.targetSlot === null ? null : number(unit.targetSlot);
  member.rotation = unit.rotation === "skill" || unit.rotation === "basic" ? (unit.rotation as ActionKind) : null;
  const cone = CONE_FLAGS.find(([flag]) => flags[flag]);
  if (cone) {
    member.lightconeId = cone[1];
    member.superimpose = cone[2];
  }
  if (flags.windSet4) member.cavernId = "110";
  if (flags.vonwacq) member.ornamentId = "308";
  // 神的瞬息欢愉 4.6.54 进了正式服，直接穿上：速度 +6% 和开局拉条都由套装自己算。
  else if (flags.godJoy) member.ornamentId = "329";

  // 旧存档的速度含套装 6%；穿上套装后 before 也含这 6%，差值就只剩额外速度。
  const pct = number(unit.permPct) + (flags.godJoy ? 6 : 0);
  const before = createBattle({ team: [toMemberInput(member)], maxAV: 1 }, game).units[0];
  const base = number(unit.baseSpd, before.baseSpd) + number(unit.lcBaseSpd, before.lcBaseSpd);
  const speed = base * (1 + pct / 100) + number(unit.permFlat) + number(unit.traceSpd, before.traceSpd);
  member.flatSpd = Math.round((speed - before.speed()) * 1e4) / 1e4;
  return member;
}

/** 旧存档或预设转成页面状态。认不出的角色先丢掉（换算速度要用角色数据），超过 4 人由 restoreState 丢掉。 */
export function stateFromLegacy(record: LegacyRecord, data: PageData): PageState {
  const { config } = record;
  const elation = newElationSettings();
  for (const key of ["ultAdvanceAha", "ultSpdPct", "ahaSpdPct", "ahaAdvancePct"] as const) {
    if (config[key] !== undefined) elation[key] = number(config[key], elation[key]);
  }
  // 旧页面只有 1 级，15 是它的默认值，读进来交给升格等级决定；改过的数照旧保留。
  if (config.sanduTeamSpdPct !== undefined && number(config.sanduTeamSpdPct, 15) !== 15) elation.sanduTeamSpdPct = number(config.sanduTeamSpdPct);
  if (config.trace3Advance !== undefined) elation.trace3Advance = Boolean(config.trace3Advance);
  elation.useAeonAha = config.useAeonAha === true;
  const maxAV = number(config.maxAV);
  return restoreState({
    ...newState(),
    customAV: maxAV >= 1 ? maxAV : null,
    useTechnique: config.useTech !== false,
    elation,
    team: record.team.filter((unit) => data.characters.some((item) => String(item.id) === String(unit.id))).map((unit) => memberFromLegacyUnit(unit, data.game)),
  }, data);
}

export function stateFromRecord(record: TeamRecord, data: PageData): PageState {
  if (record.format === "axis") return restoreState({ ...record.state, team: record.team as PageMember[] }, data);
  return stateFromLegacy({ team: record.team as LegacyUnit[], config: record.config ?? {} }, data);
}
