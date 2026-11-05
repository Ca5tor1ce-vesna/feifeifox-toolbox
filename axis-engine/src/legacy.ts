/**
 * 旧版阿哈配速接口的适配层：接受同样的 payload，返回同样结构的结果。
 * 一方面用来和旧引擎的基准逐字段比对，另一方面让只给角色 id 的队伍也能直接算：
 * 没填的参数都用角色表的默认值。
 */
import { CATALOG } from "./catalog.ts";
import { AhaKit } from "./characters/aha.ts";
import { AventurineKit } from "./characters/aventurine.ts";
import { FeiyingKit } from "./characters/feiying.ts";
import { PearlKit } from "./characters/pearl.ts";
import { RobinKit } from "./characters/robin.ts";
import { SandKit } from "./characters/sand.ts";
import { SilverWolf999Kit } from "./characters/silverwolf999.ts";
import { SparxieKit } from "./characters/sparxie.ts";
import { SundayKit } from "./characters/sunday.ts";
import { TrailblazerElationKit } from "./characters/trailblazer-elation.ts";
import { YaoguangKit } from "./characters/yaoguang.ts";
import { AxisEngine, EPS } from "./engine.ts";
import { fmt } from "./format.ts";
import { AHA_WEIGHTS, Elation, kitOf, type ElationConfig, type ElationKit } from "./modules/elation.ts";
import { Equipment } from "./modules/equipment.ts";
import type { ActionKind, CharacterKit, UnitSpec } from "./types.ts";
import { DIST_BASE, type Unit } from "./unit.ts";

const NUM_LIMIT = 1e9;
const MAX_TEAM = 4;
const MAX_AV = 1000;
const CYCLE0_AV = 150;
const CYCLE_AV = 100;
const AHA_DIVISORS = [5, 10, 20, 40];
const AV_NODES = [150, 250, 350, 450];
const NUM_RE = /^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]+)?$/;

type Raw = Record<string, unknown>;
type RosterEntry = (typeof CATALOG.roster)[number];

const ROSTER = new Map<string, RosterEntry>(CATALOG.roster.map((entry) => [entry.id, entry]));
const ALIASES = new Map<string, string>(CATALOG.roster.flatMap((entry) => entry.aliases.map((alias): [string, string] => [alias.toLowerCase(), entry.id])));

const KITS: Record<string, () => CharacterKit> = {
  1511: () => new AhaKit(),
  1503: () => new PearlKit(),
  1513: () => new SandKit(),
  1304: () => new AventurineKit(),
  1502: () => new YaoguangKit(),
  1501: () => new SparxieKit(),
  8009: () => new TrailblazerElationKit(),
  1505: () => new FeiyingKit(),
  1506: () => new SilverWolf999Kit(),
  1313: () => new SundayKit(),
  1309: () => new RobinKit(),
};

// ----------------------------- 参数校验 ----------------------------- //

const repr = (value: unknown): string => {
  if (value === undefined || value === null) return "None";
  return typeof value === "string" ? `'${value}'` : String(value);
};

const fmtAuto = (value: number): string => {
  const text = fmt(value, 2);
  return text.endsWith(".00") ? text.slice(0, -3) : text;
};

function num(container: Raw, key: string, fallback: number, lo = -NUM_LIMIT, hi = NUM_LIMIT): number {
  const value = container[key];
  if (value === undefined || value === null || value === "") return fallback;
  let number: number;
  if (typeof value === "string") {
    const text = value.trim();
    if (!NUM_RE.test(text)) throw new Error(`参数 ${key} 需要是数字，收到 ${repr(value)}`);
    number = Number(text);
  } else {
    number = typeof value === "boolean" ? (value ? 1 : 0) : Number(value);
  }
  if (!Number.isFinite(number) || Math.abs(number) > NUM_LIMIT) throw new Error(`参数 ${key} 超出范围，收到 ${repr(value)}`);
  if (number < lo || number > hi) throw new Error(`参数 ${key} 需要在 ${fmtAuto(lo)}~${fmtAuto(hi)} 之间，收到 ${fmtAuto(number)}`);
  return number;
}

function truthy(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (value !== null && typeof value === "object") return Object.keys(value).length > 0;
  return Boolean(value);
}

function bool(container: Raw, key: string, fallback: boolean): boolean {
  const value = container[key];
  return value === undefined || value === null ? fallback : truthy(value);
}

function resolveUid(raw: unknown): string {
  const key = String(raw ?? "").trim();
  if (!key) throw new Error("队伍里有角色没给 id");
  return ALIASES.get(key.toLowerCase()) ?? key;
}

// ----------------------------- 输入 ----------------------------- //

interface LegacyConfig extends ElationConfig {
  maxAV: number;
  useTech: boolean;
  dancePct: number;
}

function parseConfig(payload: Raw): LegacyConfig {
  const mode = String(payload.feiyingHaohuoEnergyMode || "punchline");
  if (mode !== "punchline" && mode !== "flat") throw new Error(`参数 feiyingHaohuoEnergyMode 需要是 punchline/flat，收到 ${repr(mode)}`);
  const optional = (key: string, fallback: number): number | null => {
    const value = payload[key];
    return value === undefined || value === null || value === "" ? null : num(payload, key, fallback, 0, 1000);
  };
  const useAeon = payload.useAeonAha;
  return {
    maxAV: num(payload, "maxAV", 300, 1, MAX_AV),
    useAeonAha: useAeon === undefined || useAeon === null ? null : truthy(useAeon),
    useTech: bool(payload, "useTech", true),
    trace3Advance: bool(payload, "trace3Advance", true),
    ultAdvanceAha: num(payload, "ultAdvanceAha", 20, 0, 100),
    e1Wishpower: num(payload, "e1Wishpower", 5, 0, 10),
    ultSpdPct: num(payload, "ultSpdPct", 30, -100, 1000),
    sanduTeamSpdPct: num(payload, "sanduTeamSpdPct", 15, -100, 1000),
    sanduFervorGain: num(payload, "sanduFervorGain", 1, 0, 10),
    sanduPunchlineGain: num(payload, "sanduPunchlineGain", 1, 0, 10),
    dancePct: num(payload, "dancePct", 24, 0, 100),
    summerLcSpdPct: num(payload, "summerLcSpdPct", 24, -100, 1000),
    sigLcPunchline: num(payload, "sigLcPunchline", 10, 0, 100),
    aeonAhaBaseSpd: optional("aeonAhaBaseSpd", 94),
    aeonAhaLcBaseSpd: optional("aeonAhaLcBaseSpd", 12),
    ahaSpdPct: num(payload, "ahaSpdPct", 0, -100, 1000),
    ahaAdvancePct: num(payload, "ahaAdvancePct", 0, 0, 100),
    feiyingHaohuoMode: mode,
    feiyingHaohuoEnergy: num(payload, "feiyingHaohuoEnergy", 20, 0, 10000),
  };
}

/** 旧结果要原样回显的输入。 */
interface LegacyUnitInfo {
  uid: string;
  energyType: string;
  energyName: string;
  permPct: number;
  permFlat: number;
  buffPct: number;
  buffFlat: number;
  rotation: string;
  initialEnergy: number;
  equipment: Record<string, boolean>;
  targetSlot: number | null;
}

const EQUIP_KEYS = ["vonwacq", "godJoy", "windSet4", "danceS5", "hasSummerLc", "hasPearlLc", "hasYaoLc", "hasFeiyLc", "hasSundayLc", "hasRobinLc", "hasWolfLc"];

function buildUnit(slot: number, uid: string, raw: Raw, seen: Set<string>): { spec: UnitSpec; info: LegacyUnitInfo } {
  const entry = ROSTER.get(uid);
  const equipRaw = (raw.equipment && typeof raw.equipment === "object" && !Array.isArray(raw.equipment) ? raw.equipment : {}) as Raw;
  const rawName = raw.name;
  const name = typeof rawName === "string" && rawName.trim() ? rawName.trim() : String(entry?.name ?? uid);
  const hasSigLc = bool(equipRaw, "hasSigLc", uid === "1511");
  const elation = bool(raw, "elation", Boolean(entry?.elation));
  const baseSpd = num(raw, "baseSpd", entry?.baseSpd ?? 100, 0, 10000);
  // 光锥基础速度在百分比乘区内：默认只在 hasSigLc 时算专武白值。
  const lcBaseSpd = num(raw, "lcBaseSpd", hasSigLc ? entry?.lcBaseSpd ?? 0 : 0, 0, 10000);
  const traceSpd = num(raw, "traceSpd", entry?.traceSpd ?? 0, -1000, 10000);
  let permPct = num(raw, "permPct", 0, -100, 10000);
  const permFlat = num(raw, "permFlat", 0, -10000, 10000);
  const buffPct = num(raw, "buffPct", 0, -100, 10000);
  const buffFlat = num(raw, "buffFlat", 0, -10000, 10000);
  let err = num(raw, "err", 0, -100, 10000);
  const eidolon = Math.trunc(num(raw, "eidolon", 0, 0, 6));
  const initAdv = num(raw, "initAdv", 0, 0, 100);
  const maxSp = num(raw, "maxSp", entry?.maxSp ?? 120, 1, 100000);
  const rotation = String(raw.rotation || entry?.rotation || "skill");
  if (rotation !== "auto" && rotation !== "basic" && rotation !== "skill") throw new Error(`参数 rotation 需要是 auto/basic/skill，收到 ${repr(rotation)}`);
  const energyType = entry?.energy ?? "standard";
  const target = raw.targetSlot;
  const targetSlot = target === undefined || target === null || target === "" ? null : Math.trunc(num(raw, "targetSlot", 0, 0, 3));

  const equipment: Record<string, boolean> = { hasSigLc };
  for (const key of EQUIP_KEYS) equipment[key] = bool(equipRaw, key, false);
  if (equipment.vonwacq) err += 5;
  if (equipment.godJoy) permPct += 6;
  if (equipment.hasYaoLc) err += 12;
  if (equipment.hasFeiyLc) err += 10 + (Math.min(Math.max(0, maxSp - 120), 360) / 10) * 0.3;

  // 标准能量角色进战 = 上限 50%；愿力、隐藏分等特殊资源从 0 开始。
  const defaultEnergy = energyType === "standard" ? maxSp * 0.5 : 0;
  const initialEnergy = num(raw, "initialEnergy", defaultEnergy, 0, energyType === "wishpower" ? 10 : maxSp);
  const ultCost = energyType === "wishpower" ? 8 : uid === "1505" ? Math.min(240, maxSp) : maxSp;
  const id = seen.has(uid) ? `${uid}#${slot}` : uid;
  seen.add(uid);

  return {
    spec: {
      id,
      name,
      baseSpd,
      lcBaseSpd,
      traceSpd,
      pctSpd: permPct + buffPct,
      flatSpd: permFlat + buffFlat,
      maxEnergy: maxSp,
      ultCost,
      energyType: energyType === "standard" ? "standard" : "resource",
      initialEnergy,
      err,
      initAdv,
      rotation: (rotation === "basic" ? "basic" : "skill") as ActionKind,
      eidolon,
      elation,
      targetSlot,
      equipment,
      kit: KITS[uid]?.(),
    },
    info: { uid, energyType, energyName: entry?.energyName ?? "能量", permPct, permFlat, buffPct, buffFlat, rotation, initialEnergy, equipment, targetSlot },
  };
}

// ----------------------------- 输出 ----------------------------- //

function buildOutput(engine: AxisEngine, el: Elation, cfg: LegacyConfig, infos: LegacyUnitInfo[]) {
  const ahaNow = el.ahaSpeed();
  const ranked = [...el.elationUnits()].sort((a, b) => b.speed() - a.speed());
  let weighted = 0;
  const ranks = ranked.slice(0, 4).map((unit, index) => {
    const speed = unit.speed();
    const add = AHA_WEIGHTS[index] * speed;
    weighted += add;
    return { rank: index + 1, name: unit.name, slot: unit.slot, speed, weight: AHA_WEIGHTS[index], divisor: AHA_DIVISORS[index], add };
  });
  const base = el.ahaBaseValue();
  const raw = base + weighted + el.ahaFlat;
  const countUpTo = (av: number) => engine.timeline.filter((row) => (row.type === "aha" || row.type === "aha_extra") && row.av <= av + EPS).length;
  const counts: Record<string, number> = {};
  for (const av of AV_NODES) counts[String(av)] = countUpTo(av);
  counts[fmt(cfg.maxAV, 0)] = countUpTo(cfg.maxAV);

  const bits = ranks.length > 0 ? ranks.map((rank) => `${fmt(rank.speed, 1)}/${rank.divisor}`).join(" + ") : "无欢愉队友";
  const pctText = cfg.ahaSpdPct ? ` × (1+${fmt(cfg.ahaSpdPct, 0)}%)` : "";
  const flatText = el.ahaFlat ? ` + ${fmt(el.ahaFlat, 1)}` : "";

  const unitActions: Record<string, number> = {};
  for (const unit of engine.units) unitActions[unit.name] = unit.actions;
  unitActions["【阿哈时刻】"] = el.normalCount + el.extraCount;
  const ahaUnit = engine.findUnit("1511");
  const ahaKit = ahaUnit ? (ahaUnit.kit as AhaKit) : undefined;
  const pearl = engine.findUnit("1503");

  return {
    maxAV: cfg.maxAV,
    aha: {
      useAeonAha: el.useAeonAha,
      base,
      baseSpd: el.ahaBaseSpd,
      lcBaseSpd: el.ahaLcBaseSpd,
      weighted,
      flatBonus: el.ahaFlat,
      pct: cfg.ahaSpdPct,
      raw,
      speed: el.ahaInitialSpeed,
      finalSpeed: ahaNow,
      singleAV: el.ahaInitialSpeed > 0 ? DIST_BASE / el.ahaInitialSpeed : 0,
      singleFinalAV: ahaNow > 0 ? DIST_BASE / ahaNow : 0,
      triggerCount: el.normalCount,
      extraTriggerCount: el.extraCount,
      ranks,
      formula: `基础 ${fmt(base, 1)} + ${bits}${flatText} = ${fmt(raw)}${pctText} → ${fmt(el.ahaInitialSpeed)}`,
      counts,
    },
    units: engine.units.map((unit, slot) => {
      const info = infos[slot];
      const speed = unit.speed();
      return {
        slot: unit.slot,
        id: info.uid,
        name: unit.name,
        elation: unit.elation,
        energyType: info.energyType,
        energyName: info.energyName,
        baseSpd: unit.baseSpd,
        lcBaseSpd: unit.lcBaseSpd,
        traceSpd: unit.traceSpd,
        permPct: info.permPct,
        permFlat: info.permFlat,
        buffPct: info.buffPct,
        buffFlat: info.buffFlat,
        err: unit.err,
        eidolon: unit.eidolon,
        maxSp: unit.maxEnergy,
        initAdv: unit.initAdv,
        initialEnergy: info.initialEnergy,
        targetSlot: info.targetSlot,
        rotation: info.rotation,
        equipment: { ...info.equipment },
        initialSpd: unit.initialSpeed,
        finalSpd: speed,
        singleAV: speed > 0 ? DIST_BASE / speed : 0,
        deltaVsAha: speed - el.ahaInitialSpeed,
        fasterThanAha: speed > el.ahaInitialSpeed + 0.05,
        actionCount: unit.actions,
        turnCount: unit.turns,
        ultCount: unit.ultimates,
        extraTurnCount: unit.extraTurns,
        fuaCount: unit.followUps,
        finalEnergy: unit.energy,
        finalRemDist: unit.remDist,
        mechanics: mechanicsOf(unit, el),
        notes: [...unit.notes],
      };
    }),
    // 旧格式没有银狼的隐藏分合计（新页面才用），去掉，旧基准保持原样。
    timeline: engine.timeline.map((row) => {
      if (!("hiddenScore" in row.res)) return row;
      const { hiddenScore: _hidden, ...res } = row.res;
      return { ...row, res };
    }),
    summary: {
      totalEvents: engine.timeline.length,
      unitActions,
      ahaTriggers: el.normalCount,
      ahaExtraTriggers: el.extraCount,
      punchlineGranted: el.punchlineGranted,
      punchlineConsumed: el.punchlineConsumed,
      truncated: engine.truncated,
    },
    resources: {
      punchline: el.punchline,
      ahaFlatBonus: el.ahaFlat,
      huanyuWanxiangTurns: ahaKit ? ahaKit.huanyu : null,
      sanduActive: engine.kitOf<SandKit>("1513")?.sanduActive() ?? false,
      lingshiSlot: ahaKit ? ahaKit.lingshiSlot : null,
      aesteSlot: pearl ? (pearl.kit as PearlKit).aesteSlot : 0,
    },
    warnings: [...engine.warnings],
    notes: [...engine.notes],
  };
}

function mechanicsOf(unit: Unit, el: Elation) {
  const kit = kitOf(unit) as ElationKit | undefined;
  const trace = kit?.ascensionTrace ?? null;
  return {
    ...(kit?.mechanics?.() ?? {}),
    ascensionTrace: trace,
    ascensionActive: Boolean(trace) && el.huanyuActive(),
    haohuo: el.haohuoOf(unit).map((item) => ({ turns: item.turns, count: item.count, label: item.label })),
  };
}

// ----------------------------- 接口 ----------------------------- //

/** 按旧 payload 搭好一场战斗，还没开始跑。 */
export function buildLegacyBattle(payload: Raw) {
  if (payload === null || typeof payload !== "object") throw new Error("payload 需要是对象");
  const cfg = parseConfig(payload);
  const team = payload.team;
  if (!Array.isArray(team) || team.length === 0) throw new Error("参数 team 需要是 1~4 个成员的列表");
  if (team.length > MAX_TEAM) throw new Error(`参数 team 最多 ${MAX_TEAM} 人，收到 ${team.length}`);
  const seen = new Set<string>();
  const specs: UnitSpec[] = [];
  const infos: LegacyUnitInfo[] = [];
  team.forEach((raw, slot) => {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`参数 team[${slot}] 需要是对象`);
    const uid = resolveUid((raw as Raw).id);
    const entry = ROSTER.get(uid);
    if (entry && seen.has(uid)) throw new Error(`队伍中不能重复选择角色：${entry.name}。`);
    const { spec, info } = buildUnit(slot, uid, raw as Raw, seen);
    specs.push(spec);
    infos.push(info);
  });
  // 旧接口不管队伍里有没有欢愉角色，都会跑【阿哈时刻】，这里保持一致。
  const el = new Elation(cfg);
  const engine = new AxisEngine({
    maxAV: cfg.maxAV,
    units: specs,
    useTechnique: cfg.useTech,
    modules: [el],
    lateModules: [new Equipment({ dancePct: cfg.dancePct })],
    scopeNote: "不模拟敌方行动、受击/击杀回能；欢愉技按参演编号排序（阿哈最后），绯英按编号判断转移。",
  });
  return { engine, el, output: () => buildOutput(engine, el, cfg, infos) };
}

export function simulateLegacy(payload: Raw) {
  const battle = buildLegacyBattle(payload);
  battle.engine.run();
  return battle.output();
}

function cycleOf(av: number): number {
  if (av <= CYCLE0_AV + EPS) return 0;
  return Math.ceil((av - CYCLE0_AV) / CYCLE_AV - EPS);
}

/** 速度阈值反推：需求速度 = 10000 × (动数 − 拉条%/100) ÷ 目标行动值。 */
export function thresholdLegacy(payload: Raw) {
  let targetAV = num(payload, "targetAV", 0, 0, NUM_LIMIT);
  const t = payload.t;
  if (targetAV <= 0 && t !== undefined && t !== null && t !== "") targetAV = CYCLE0_AV + Math.trunc(num(payload, "t", 0, 0, 1000)) * CYCLE_AV;
  if (targetAV <= 0) throw new Error("需要 targetAV（或 t）指定目标行动值");
  const actions = num(payload, "actions", 2, 1, 200);
  const advancePct = num(payload, "advancePct", 0, 0, 10000);
  const effectiveTurns = actions - advancePct / 100;
  const requiredSpeed = (DIST_BASE * effectiveTurns) / targetAV;
  return {
    targetAV,
    t: cycleOf(targetAV),
    actions,
    advancePct,
    effectiveTurns,
    distance: DIST_BASE,
    requiredSpeed,
    cycleBoundary: CYCLE0_AV + cycleOf(targetAV) * CYCLE_AV,
    formula: `10000 × (${fmt(actions, 0)} − ${fmt(advancePct, 0)}%) ÷ ${fmt(targetAV, 0)} = ${fmt(requiredSpeed)}`,
    text: `${fmt(targetAV, 0)} AV 内打 ${fmt(actions, 0)} 动${advancePct ? `（累计拉条 ${fmt(advancePct, 0)}%）` : ""}需要 ${fmt(requiredSpeed)} 速`,
  };
}

export const legacyCatalog = () => CATALOG;

export function runLegacy(action: string, payload: Raw) {
  if (action === "simulate") return simulateLegacy(payload);
  if (action === "threshold") return thresholdLegacy(payload);
  if (action === "catalog") return legacyCatalog();
  throw new Error(`没有这个动作：${action}`);
}
