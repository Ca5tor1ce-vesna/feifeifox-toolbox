/**
 * 新页面的入口：只给角色 id 就能算，其余都有默认值。
 * 游戏数据由调用方传入（axis_data.json、characters.json），引擎本身不读文件，桌面版和单文件网页版都能用。
 */
import { CATALOG } from "./catalog.ts";
import { SIG_LC } from "./characters/aha.ts";
import { simple } from "./characters/declarative.ts";
import { KITS } from "./characters/index.ts";
import { AxisEngine } from "./engine.ts";
import { Elation, type ElationConfig } from "./modules/elation.ts";
import { Equipment } from "./modules/equipment.ts";
import { LIGHTCONE_EFFECTS } from "./modules/gear-effects.ts";
import type { ActionKind, BattleModule, CycleStructure, EnergyType, UnitGear, UnitSpec } from "./types.ts";

export interface MemberInput {
  id: string;
  eidolon?: number;
  /** 不填就用资料里的基础速度。 */
  baseSpd?: number;
  /** 不填就用资料里的行迹速度。 */
  traceSpd?: number;
  lcBaseSpd?: number;
  /** 副词条和遗器给的固定速度、百分比速度。 */
  flatSpd?: number;
  pctSpd?: number;
  err?: number;
  initialEnergy?: number;
  initAdv?: number;
  targetSlot?: number | null;
  rotation?: ActionKind;
  /** 逐动覆盖：第 n 动用什么。 */
  script?: ActionKind[];
  /** 第几动之后开大（不看能量）。遐蝶默认第 2 动，因为她的开大时点算不出来。 */
  manualUltimates?: number[];
  /** 光锥和叠影（1~5）。光锥的速度和能量恢复效率由它给出，flatSpd、pctSpd、err 不要重复填。 */
  lightcone?: { id: string; superimpose?: number };
  /** 遗器套装：几件生效。套装效果同样不要重复填进 flatSpd、pctSpd、err。 */
  relics?: { id: string; pieces: 2 | 4 }[];
  /** 旧接口的装备开关，只有阿哈专武还在用，阶段 6 随旧接口下线。 */
  equipment?: Record<string, boolean>;
  /** 自定义角色。有它就不查资料，id 随便取，不和已有角色重复就行。 */
  custom?: CustomCharacter;
  /** 「角色与遗器」里实际装配的真实属性（1.2）。有它时，看属性的条件（欢愉度）按真实值判断，否则按满足算。 */
  measured?: { elation: number };
}

/**
 * 用户自定义的角色：数值加几条常见的战技、终结技效果。用来模拟没收录或还在测试服的角色，
 * 机制复杂的（召唤物、变身、特殊资源）表达不了，结果里会提示。
 */
export interface CustomCharacter {
  name: string;
  baseSpd: number;
  maxEnergy: number;
  /** 普攻、战技回能和终结技返还，吃能量恢复效率。 */
  energy: { basic: number; skill: number; ultimate: number };
  /** 战技给目标：行动提前 %、恢复能量（固定）。 */
  skillAllyAdvance: number;
  skillAllyEnergy: number;
  /** 终结技：自身行动提前 %、我方全体行动提前 %、获得额外回合、自身速度提高 %（持续回合）。 */
  ultSelfAdvance: number;
  ultTeamAdvance: number;
  ultExtraTurn: boolean;
  ultSpeedPct: number;
  ultSpeedTurns: number;
}

const CUSTOM_LIMITS: [keyof CustomCharacter, number, number][] = [
  ["baseSpd", 1, 300], ["maxEnergy", 1, 1000], ["skillAllyAdvance", 0, 100], ["skillAllyEnergy", 0, 500],
  ["ultSelfAdvance", 0, 100], ["ultTeamAdvance", 0, 100], ["ultSpeedPct", 0, 500], ["ultSpeedTurns", 1, 20],
];

function customKit(member: MemberInput, custom: CustomCharacter) {
  return simple({
    id: member.id,
    notSimulated: ["自定义角色只计入填写的数值和效果"],
    rules: [
      {
        on: "skill",
        do: (k) => {
          const target = k.otherTarget();
          if (!target) return;
          if (custom.skillAllyAdvance > 0) k.advanceUnit("战技", target, custom.skillAllyAdvance);
          if (custom.skillAllyEnergy > 0) k.gainFor("战技", target, custom.skillAllyEnergy, { fixed: true });
        },
      },
      {
        on: "ultimate",
        do: (k) => {
          if (custom.ultSpeedPct > 0) k.speed("终结技", k.self, "pct", custom.ultSpeedPct, custom.ultSpeedTurns);
          if (custom.ultSelfAdvance > 0) k.advanceSelf("终结技", custom.ultSelfAdvance);
          if (custom.ultTeamAdvance > 0) k.advanceAll("终结技", custom.ultTeamAdvance);
          if (custom.ultExtraTurn) k.engine.extraTurn(k.self, "终结技：额外回合");
        },
      },
    ],
  })();
}

/** 自定义角色不查资料，数值全由用户给。超出范围的数直接报错，不悄悄改。 */
function customSpec(member: MemberInput, custom: CustomCharacter, data: GameData): UnitSpec {
  for (const [key, min, max] of CUSTOM_LIMITS) {
    const value = custom[key] as number;
    if (!Number.isFinite(value) || value < min || value > max) throw new Error(`自定义角色「${custom.name}」的数值不对：${key} 需要在 ${min} 到 ${max} 之间。`);
  }
  const gains = Object.values(custom.energy);
  if (gains.some((value) => !Number.isFinite(value) || value < 0 || value > 500)) throw new Error(`自定义角色「${custom.name}」的回能需要在 0 到 500 之间。`);
  const gear = gearOf(member, data);
  return {
    id: member.id,
    name: custom.name.trim() || "自定义角色",
    baseSpd: custom.baseSpd,
    traceSpd: member.traceSpd ?? 0,
    lcBaseSpd: member.lcBaseSpd ?? coneBaseSpeed(gear),
    gear,
    pctSpd: member.pctSpd,
    flatSpd: member.flatSpd,
    maxEnergy: custom.maxEnergy,
    ultCost: custom.maxEnergy,
    path: undefined,
    energyType: "standard",
    initialEnergy: member.initialEnergy,
    err: member.err,
    initAdv: member.initAdv,
    rotation: member.rotation ?? "skill",
    script: member.script,
    manualUltimates: member.manualUltimates,
    ultimateAttacks: true,
    energyGains: { ...custom.energy },
    eidolon: member.eidolon ?? 0,
    elation: false,
    targetSlot: member.targetSlot ?? null,
    equipment: { ...member.equipment },
    kit: customKit(member, custom),
  };
}

export interface BattleInput {
  team: MemberInput[];
  maxAV?: number;
  useTechnique?: boolean;
  /** 模式的轮次结构，来自 modes.json。不填按混沌回忆。 */
  cycle?: CycleStructure;
  /** 敌人数量，默认 1。只影响「每击中 1 个目标」这类回能。 */
  enemyCount?: number;
  dancePct?: number;
  /** 欢愉队的可调参数，只有队伍里有欢愉角色才用到。 */
  elation?: Partial<ElationConfig>;
}

interface AxisCharacter {
  path?: string;
  speedBase: number;
  energyMax: number | null;
  energyGains: Record<string, number>;
}

export interface GameData {
  axis: {
    characters: Record<string, AxisCharacter>;
    lightcones?: Record<string, { path: string; params: number[][] }>;
    relicSets?: Record<string, unknown>;
  };
  characters: { id: string | number; name: string; pathName?: string; traceSpeed?: number }[];
}

export const ELATION_DEFAULTS: ElationConfig = {
  useAeonAha: null,
  ultAdvanceAha: 20,
  ultSpdPct: 30,
  trace3Advance: true,
  e1Wishpower: 5,
  sanduTeamSpdPct: null,
  sanduFervorGain: null,
  sanduPunchlineGain: null,
  summerLcSpdPct: 24,
  sigLcPunchline: 10,
  aeonAhaBaseSpd: null,
  aeonAhaLcBaseSpd: null,
  ahaSpdPct: 0,
  ahaAdvancePct: 0,
  feiyingHaohuoMode: "punchline",
  feiyingHaohuoEnergy: 20,
};

const ROSTER = new Map(CATALOG.roster.map((entry) => [entry.id, entry]));

/** 终结技消耗和能量上限不同的角色。其余角色消耗等于上限。 */
const ULT_COST: Record<string, number> = {
  1220: 6, // 飞霄：【飞黄】6 点可开大，最多累计 12
  1308: 9, // 黄泉：【残梦】
  1221: 120, // 云璃：上限 240，消耗 120
  1415: 24, // 昔涟：【追忆】首次 24，之后 12
  1408: 12, // 白厄：【火种】
};
/**
 * 终结技不靠能量的角色用的资源名（4.6.54 版本天赋文案），页面上能量那一列按这个名字显示。
 * 遐蝶的【新蕊】靠我方掉血累积，引擎不模拟，不写名字，页面就不显示这一列。
 */
const ENERGY_NAMES: Record<string, string> = {
  1220: "飞黄",
  1308: "残梦",
  1408: "火种",
  1415: "追忆",
  1506: "隐藏分",
  1511: "愿力",
};
/** 算不出开大时点的角色的默认值：用户可以改。 */
export const DEFAULT_MANUAL_ULTIMATES: Record<string, number[]> = { 1407: [2] };

/**
 * 终结技不算攻击的角色，按 4.6 版本文案：没有「对敌方…造成伤害」，或者只是变身（白厄）。
 * 千冶•刃的第一次开大不造成伤害，第二次由她自己的模块发事件。
 */
const NON_ATTACK_ULTIMATES = new Set([
  "1009", "1101", "1104", "1105", "1110", "1112", "1202", "1211", "1215", "1217", "1306", "1309", "1310",
  "1313", "1317", "1402", "1407", "1408", "1409", "1415", "1502", "1503", "1507", "1512", "8005", "8006", "8009", "8010",
]);
/** 从旧引擎迁来的 11 人：攻击事件沿用旧引擎的范围，自己结算，阶段 6 下线旧引擎时再统一。 */
const MIGRATED_KITS = new Set(["1511", "1503", "1513", "1304", "1502", "1501", "8009", "1505", "1506", "1313", "1309"]);

/** 校验并整理装备输入。光锥命途和角色不同时，效果不生效（游戏规则），但不算输入错误。 */
function gearOf(member: MemberInput, data: GameData): UnitGear {
  const relics = (member.relics ?? []).map(({ id, pieces }) => {
    if (!data.axis.relicSets?.[id]) throw new Error(`没有找到遗器套装 ${id}，请重新选择。`);
    if (pieces !== 2 && pieces !== 4) throw new Error(`遗器件数只能是 2 或 4，收到 ${pieces}`);
    return { id, pieces };
  });
  if (!member.lightcone) return { relics };
  const { id, superimpose = 1 } = member.lightcone;
  const cone = data.axis.lightcones?.[id];
  if (!cone) throw new Error(`没有找到光锥 ${id}，请重新选择。`);
  if (!Number.isInteger(superimpose) || superimpose < 1 || superimpose > 5) {
    throw new Error(`光锥叠影需要是 1~5 的整数，收到 ${superimpose}`);
  }
  const active = cone.path === data.axis.characters[member.id]?.path;
  return { lightcone: { id, params: cone.params[superimpose - 1] ?? [], active }, relics };
}

/** 光锥文案里的「基础速度提高」，进百分比乘区。 */
function coneBaseSpeed(gear: UnitGear): number {
  const { lightcone } = gear;
  const index = lightcone?.active ? LIGHTCONE_EFFECTS[lightcone.id]?.baseSpeedParam : undefined;
  return index === undefined || !lightcone ? 0 : lightcone.params[index];
}

function unitSpec(member: MemberInput, data: GameData, names: Map<string, GameData["characters"][number]>): UnitSpec {
  if (member.custom) return customSpec(member, member.custom, data);
  const axis = data.axis.characters[member.id];
  const entry = ROSTER.get(member.id);
  const local = names.get(member.id);
  if (!axis && !entry) throw new Error(`没有找到角色 ${member.id}，请重新选择。`);
  const gains = axis?.energyGains ?? {};
  // 技能都不回标准能量的角色用的是特殊资源（【残梦】【飞黄】等）。
  const usesResource = !axis?.energyMax || Object.values(gains).every((value) => !value);
  const energyKind = entry?.energy ?? (usesResource ? "resource" : "standard");
  const energyType: EnergyType = energyKind === "standard" ? "standard" : "resource";
  // 星神★阿哈没选光锥时默认带专武（叠 1），和旧存档一致；选了专武就按选的叠影算。
  const hasSigLc = member.id === "1511" && (member.equipment?.hasSigLc ?? (!member.lightcone || member.lightcone.id === SIG_LC));
  const gear = gearOf(member, data);
  const maxEnergy = entry?.maxSp ?? axis?.energyMax ?? 100;
  return {
    id: member.id,
    name: entry?.name ?? local?.name ?? member.id,
    baseSpd: member.baseSpd ?? axis?.speedBase ?? entry?.baseSpd ?? 100,
    traceSpd: member.traceSpd ?? local?.traceSpeed ?? entry?.traceSpd ?? 0,
    lcBaseSpd: member.lcBaseSpd ?? (hasSigLc && !member.lightcone ? entry?.lcBaseSpd ?? 0 : coneBaseSpeed(gear)),
    gear,
    pctSpd: member.pctSpd,
    flatSpd: member.flatSpd,
    maxEnergy,
    ultCost: energyKind === "wishpower" ? 8 : member.id === "1505" ? Math.min(240, maxEnergy) : ULT_COST[member.id] ?? maxEnergy,
    path: local?.pathName ?? entry?.path,
    energyType,
    energyName: ENERGY_NAMES[member.id],
    initialEnergy: member.initialEnergy,
    err: member.err,
    initAdv: member.initAdv,
    rotation: member.rotation ?? (entry?.rotation === "basic" ? "basic" : "skill"),
    script: member.script,
    manualUltimates: member.manualUltimates ?? DEFAULT_MANUAL_ULTIMATES[member.id],
    ultimateAttacks: !NON_ATTACK_ULTIMATES.has(member.id) && !MIGRATED_KITS.has(member.id),
    energyGains: { basic: gains.Normal ?? 20, skill: gains.BPSkill ?? 30, ultimate: gains.Ultra ?? 5 },
    eidolon: member.eidolon ?? 0,
    elation: entry?.elation ?? local?.pathName === "欢愉",
    targetSlot: member.targetSlot ?? null,
    equipment: { hasSigLc, ...member.equipment },
    kit: KITS[member.id]?.(),
    measured: member.measured,
  };
}

export function createBattle(input: BattleInput, data: GameData): AxisEngine {
  const names = new Map(data.characters.map((item) => [String(item.id), item]));
  const units = input.team.map((member) => unitSpec(member, data, names));
  const modules: BattleModule[] = units.some((unit) => unit.elation) ? [new Elation({ ...ELATION_DEFAULTS, ...input.elation })] : [];
  return new AxisEngine({
    maxAV: input.maxAV ?? 300,
    units,
    cycle: input.cycle,
    useTechnique: input.useTechnique ?? true,
    enemyCount: input.enemyCount,
    modules,
    lateModules: [new Equipment({ dancePct: input.dancePct ?? 24 })],
  });
}
