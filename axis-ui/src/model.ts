/**
 * 新排轴页的页面状态和结果整理。这里不碰 DOM，能直接在 Node 里测。
 * 引擎只认 MemberInput；页面状态里多的是用户的选择（遗器栏、逐动覆盖），这里负责翻译。
 */
import { activeDamage, damageView, type DamageSetup, type DamageView } from "./damage.ts";
import { createBattle, type CustomCharacter, DEFAULT_MANUAL_ULTIMATES, type GameData, type MemberInput } from "../../axis-engine/src/battle.ts";
import { CATALOG } from "../../axis-engine/src/catalog.ts";
import { hasKit } from "../../axis-engine/src/characters/index.ts";
import type { AxisEngine } from "../../axis-engine/src/engine.ts";
import { AHA_WEIGHTS, type Elation } from "../../axis-engine/src/modules/elation.ts";
import { LIGHTCONE_EFFECTS, RELIC_EFFECTS } from "../../axis-engine/src/modules/gear-effects.ts";
import type { ActionKind, AxisEvent, UltMode, UnsupportedMechanic } from "../../axis-engine/src/types.ts";

/** 留大的开大点：哪个角色的第几动之后。 */
export interface UltMark {
  id: string;
  action: number;
}

/** 秘技效果跟着当前操控的角色走、进战斗时给进场角色的（4.6.54 版本资料）：真珠、刻律德菈。 */
export const LEAD_TECHNIQUE_IDS = ["1503", "1412"];

export interface PageMember {
  id: string;
  eidolon: number;
  /** 3.4 老角色加强：false 按原版算；没填（undefined）按强化版。只对有强化版的角色有意义。 */
  enhanced?: boolean;
  /** 姬子•启行在队里时用不用助战技：没填按默认（能白用的队友里第一个用的那位用）。 */
  assist?: "use" | "never";
  /** 副词条和鞋子的固定速度。光锥和套装给的速度引擎自己算，不要填这里。 */
  flatSpd: number;
  err: number;
  /** null 表示按默认（标准能量 50%，特殊资源 0）。 */
  initialEnergy: number | null;
  initAdv: number;
  lightconeId: string;
  superimpose: number;
  cavernId: string;
  ornamentId: string;
  targetSlot: number | null;
  rotation: ActionKind | null;
  /** 逐动覆盖：第 n 动（从 1 数）用什么。 */
  overrides: Record<string, ActionKind>;
  /** 逐动改目标：第 n 动（从 1 数）的技能给哪位队友（id，换站位也不乱）。旧存档没有。 */
  targetOverrides?: Record<string, string>;
  manualUltimates: number[] | null;
  /** 开大方式：auto 有大就开；hold 留大，只在开大点之后开。旧存档没有，按 auto。 */
  ultMode?: UltMode;
  /** 留大的开大点：哪个角色（id，换站位也不乱）的第几动之后。 */
  ultAfter?: UltMark[];
  /** 读取过哪份配装，只用来显示。 */
  buildName: string;
  /** 自定义角色的数值和效果；收录的角色是 null。 */
  custom: CustomCharacter | null;
  /** 读取「实际装配」时的真实属性（欢愉度），条件效果按它判断；没读过是 undefined。 */
  measured?: { elation: number } | null;
  /** 读取「实际装配」时的面板，算伤害用；没读过是 undefined。 */
  panel?: Readonly<Record<string, number>> | null;
}

/** 欢愉队的可调参数。队伍里有对应角色才显示，平时用不着理解。 */
export interface ElationSettings {
  /** 没带星神★阿哈时，也按她的底速算【阿哈时刻】。 */
  useAeonAha: boolean;
  trace3Advance: boolean;
  ultAdvanceAha: number;
  ultSpdPct: number;
  /** 【三赌牌局】全队提速。null 按升格等级（1 级 15%，阿哈 2 魂起 25%）。 */
  sanduTeamSpdPct: number | null;
  ahaSpdPct: number;
  ahaAdvancePct: number;
}

export interface PageState {
  modeId: string;
  t: number;
  /** 手动指定模拟到多少 AV，null 表示按模式和轮数。 */
  customAV: number | null;
  useTechnique: boolean;
  /** 进场角色（开怪时操控谁）的 id：真珠、刻律德菈的秘技给他。null 按各自的技能目标。 */
  leadId: string | null;
  /** 几人同时能开大时的先后（id），没列到的按站位。 */
  ultOrder: string[];
  enemyCount: number;
  team: PageMember[];
  elation: ElationSettings;
  rowFilter: RowFilter;
  showDetail: boolean;
}

export interface Mode {
  id: string;
  name: string;
  shortName?: string;
  firstCycleAV: number;
  cycleAV: number;
  maxT: number;
}

export interface CatalogItem {
  id: string;
  name: string;
  path?: string;
  pathName?: string;
  rarity?: number;
  icon?: string;
  splash?: string;
  traceSpeed?: number;
  desc?: string[];
}

export interface PageData {
  game: GameData;
  characters: CatalogItem[];
  lightcones: CatalogItem[];
  relicSets: CatalogItem[];
  modes: Mode[];
}

export const newMember = (id: string): PageMember => ({
  id,
  eidolon: 0,
  flatSpd: 0,
  err: 0,
  initialEnergy: null,
  initAdv: 0,
  lightconeId: "",
  superimpose: 1,
  cavernId: "",
  ornamentId: "",
  targetSlot: null,
  rotation: null,
  overrides: {},
  manualUltimates: null,
  buildName: "",
  custom: null,
});

export const CUSTOM_PREFIX = "custom-";
export const isCustomId = (id: string): boolean => id.startsWith(CUSTOM_PREFIX);
export const newCustomCharacter = (): CustomCharacter => ({
  name: "自定义角色",
  baseSpd: 100,
  maxEnergy: 120,
  energy: { basic: 20, skill: 30, ultimate: 5 },
  skillAllyAdvance: 0,
  skillAllyEnergy: 0,
  ultSelfAdvance: 0,
  ultTeamAdvance: 0,
  ultExtraTurn: false,
  ultSpeedPct: 0,
  ultSpeedTurns: 2,
});
/** 新的自定义角色。id 只要在队伍里不重复，存档和逐动覆盖都按它找人。 */
export const newCustomMember = (): PageMember => ({
  ...newMember(`${CUSTOM_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`),
  custom: newCustomCharacter(),
});

/** 存档里的自定义角色：缺的字段用默认值补，类型不对的丢掉。 */
function restoreCustom(raw: unknown): CustomCharacter | null {
  if (!raw || typeof raw !== "object") return null;
  const base = newCustomCharacter();
  const source = raw as Record<string, unknown>;
  for (const key of Object.keys(base) as (keyof CustomCharacter)[]) {
    if (key === "energy") {
      const energy = source.energy as Record<string, unknown> | undefined;
      for (const kind of ["basic", "skill", "ultimate"] as const) {
        if (typeof energy?.[kind] === "number") base.energy[kind] = energy[kind] as number;
      }
    } else if (typeof source[key] === typeof base[key]) {
      (base[key] as unknown) = source[key];
    }
  }
  return base;
}

export const newElationSettings = (): ElationSettings => ({
  useAeonAha: false,
  trace3Advance: true,
  ultAdvanceAha: 20,
  ultSpdPct: 30,
  sanduTeamSpdPct: null,
  ahaSpdPct: 0,
  ahaAdvancePct: 0,
});

export const newState = (): PageState => ({ modeId: "moc", t: 2, customAV: null, useTechnique: true, leadId: null, ultOrder: [], enemyCount: 1, team: [], elation: newElationSettings(), rowFilter: "all", showDetail: false });

/** 选人列表：图鉴里的角色，加上图鉴还没收录、但资料和模块都有的角色（没有本地头像）。 */
export function pageCharacters(game: GameData): CatalogItem[] {
  const local = game.characters as CatalogItem[];
  const known = new Set(local.map((item) => String(item.id)));
  // 图鉴里没有、但资料和模块都有的角色（比如测试服包里的角色）也能选。开拓者的性别变体资料里有、没有单独模块，不列。
  const beta = Object.entries(game.axis.characters)
    .filter(([id]) => !known.has(id) && hasKit(id))
    .map(([id, item]): CatalogItem => {
      const entry = CATALOG.roster.find((row) => row.id === id);
      return { id, name: entry?.name ?? id, path: item.path, pathName: entry?.path ?? "欢愉", rarity: 5 };
    });
  return [...beta, ...local];
}

/**
 * 存档里有、读进来却没了的角色（比如还没进正式服的测试服角色），给页面提示用。
 * 名字先查图鉴，再查旧欢愉队目录，都没有就用 id。
 */
export function droppedMembers(rawTeam: unknown, restored: PageMember[], data: PageData): string[] {
  if (!Array.isArray(rawTeam)) return [];
  const kept = new Set(restored.map((member) => member.id));
  const names = new Map(data.characters.map((item) => [String(item.id), item.name]));
  const dropped: string[] = [];
  for (const member of rawTeam) {
    const id = String((member as { id?: unknown })?.id ?? "");
    if (!id || kept.has(id) || isCustomId(id)) continue;
    const name = names.get(id) ?? CATALOG.roster.find((row) => row.id === id)?.name ?? id;
    if (!dropped.includes(name)) dropped.push(name);
  }
  return dropped;
}

export const droppedNotice = (names: string[]): string =>
  names.length ? `队伍里的${names.map((name) => `「${name}」`).join("、")}不在当前版本的资料里（可能还没进正式服），已从队伍移出。` : "";

/** 从存档恢复：只认已知字段，角色和模式不存在了就丢掉，不让旧存档把页面弄坏。 */
export function restoreState(saved: unknown, data: PageData): PageState {
  const state = newState();
  if (!saved || typeof saved !== "object") return state;
  const raw = saved as Partial<PageState>;
  if (data.modes.some((mode) => mode.id === raw.modeId)) state.modeId = raw.modeId as string;
  if (Number.isInteger(raw.t) && (raw.t as number) >= 0) state.t = raw.t as number;
  if (typeof raw.useTechnique === "boolean") state.useTechnique = raw.useTechnique;
  if (typeof raw.leadId === "string") state.leadId = raw.leadId;
  if (Array.isArray(raw.ultOrder)) state.ultOrder = raw.ultOrder.filter((id): id is string => typeof id === "string");
  if (Number.isInteger(raw.enemyCount) && (raw.enemyCount as number) >= 1) state.enemyCount = raw.enemyCount as number;
  if (typeof raw.customAV === "number" && raw.customAV >= 1 && raw.customAV <= MAX_WINDOW_AV) state.customAV = raw.customAV;
  if (ROW_FILTERS.some((item) => item.id === raw.rowFilter)) state.rowFilter = raw.rowFilter as RowFilter;
  if (typeof raw.showDetail === "boolean") state.showDetail = raw.showDetail;
  if (raw.elation && typeof raw.elation === "object") {
    for (const key of Object.keys(state.elation) as (keyof ElationSettings)[]) {
      const value = raw.elation[key];
      if (key === "sanduTeamSpdPct" && (value === null || typeof value === "number")) {
        state.elation.sanduTeamSpdPct = value;
        continue;
      }
      if (typeof value === typeof state.elation[key]) (state.elation[key] as unknown) = value;
    }
  }
  const known = new Set(data.characters.map((item) => String(item.id)));
  const seen = new Set<string>();
  for (const member of Array.isArray(raw.team) ? raw.team : []) {
    const id = String(member?.id);
    const custom = isCustomId(id) ? restoreCustom((member as Partial<PageMember>)?.custom) : null;
    if ((!known.has(id) && !custom) || seen.has(id) || seen.size >= 4) continue;
    seen.add(id);
    const restored: PageMember = { ...newMember(id), ...member, id, custom };
    // 开大方式和开大点：认不出的丢掉，不让旧存档或手改的存档把页面弄坏。
    if (restored.ultMode !== "hold") delete restored.ultMode;
    restored.ultAfter = Array.isArray(restored.ultAfter)
      ? restored.ultAfter.filter((mark) => typeof mark?.id === "string" && Number.isInteger(mark.action) && mark.action >= 1)
      : [];
    // 逐动改目标同样只留认得出的：键是正整数动数，值是队友 id。
    const targets = restored.targetOverrides && typeof restored.targetOverrides === "object" ? restored.targetOverrides : {};
    const kept = Object.entries(targets).filter(([key, id]) => /^[1-9]d*$/.test(key) && typeof id === "string");
    if (kept.length > 0) restored.targetOverrides = Object.fromEntries(kept);
    else delete restored.targetOverrides;
    state.team.push(restored);
  }
  return state;
}

/** 某人在不在留大。遐蝶有自己的「第几动后开大」，不走这里。 */
export const holdsUltimate = (member: PageMember): boolean => member.ultMode === "hold" && !needsManualUltimate(member.id);

/** 点卡片切换开大点：有就去掉，没有就加上。 */
export function toggleUltMark(member: PageMember, mark: UltMark): void {
  const list = member.ultAfter ?? [];
  const has = list.some((item) => item.id === mark.id && item.action === mark.action);
  member.ultAfter = has ? list.filter((item) => !(item.id === mark.id && item.action === mark.action)) : [...list, mark];
}

/** 队里有秘技给进场角色的人时，才需要选进场角色。 */
export const needsLead = (state: PageState): boolean => state.useTechnique && state.team.some((member) => LEAD_TECHNIQUE_IDS.includes(member.id));

/** 开大顺序：用户排过的在前（只留还在队里的），其余按站位。 */
export function ultOrderIds(state: PageState): string[] {
  const ids = state.team.map((member) => member.id);
  const first = state.ultOrder.filter((id, index, list) => ids.includes(id) && list.indexOf(id) === index);
  return [...first, ...ids.filter((id) => !first.includes(id))];
}

/** 页面状态里按 id 记的东西（进场角色、开大顺序、开大点）翻成引擎要的站位；人不在队里了就不算。 */
export function battleTargets(state: PageState): { leadSlot: number | null; ultOrder: number[]; ultAfter: (MemberInput["ultAfter"])[]; targetScript: (MemberInput["targetScript"])[] } {
  const slotOf = new Map(state.team.map((member, slot) => [member.id, slot]));
  const lead = needsLead(state) && state.leadId ? slotOf.get(state.leadId) ?? null : null;
  return {
    leadSlot: lead,
    ultOrder: ultOrderIds(state).map((id) => slotOf.get(id)!),
    ultAfter: state.team.map((member) => (holdsUltimate(member)
      ? (member.ultAfter ?? []).flatMap((mark) => (slotOf.has(mark.id) ? [{ slot: slotOf.get(mark.id)!, action: mark.action }] : []))
      : undefined)),
    // 逐动改目标：没改过的动留 undefined（引擎按平时的目标）；目标不在队里了就当没改。
    targetScript: state.team.map((member) => {
      const entries = Object.entries(member.targetOverrides ?? {}).filter(([, id]) => slotOf.has(id) && id !== member.id);
      if (entries.length === 0) return undefined;
      const script: (number | null)[] = [];
      for (const [key, id] of entries) script[Number(key) - 1] = slotOf.get(id)!;
      return Array.from({ length: script.length }, (_, i) => script[i] ?? null);
    }),
  };
}

export const modeOf = (state: PageState, data: PageData): Mode =>
  data.modes.find((mode) => mode.id === state.modeId) ?? data.modes[0];

export const MAX_WINDOW_AV = 1000;

export const windowAV = (state: PageState, mode: Mode): number =>
  state.customAV ?? mode.firstCycleAV + Math.min(state.t, mode.maxT) * mode.cycleAV;

export function toMemberInput(member: PageMember): MemberInput {
  const relics: NonNullable<MemberInput["relics"]> = [];
  if (member.cavernId) relics.push({ id: member.cavernId, pieces: 4 });
  if (member.ornamentId) relics.push({ id: member.ornamentId, pieces: 2 });
  const last = Math.max(0, ...Object.keys(member.overrides).map(Number));
  return {
    id: member.id,
    eidolon: member.eidolon,
    enhanced: member.enhanced,
    assist: member.assist,
    flatSpd: member.flatSpd,
    err: member.err,
    initAdv: member.initAdv,
    initialEnergy: member.initialEnergy ?? undefined,
    targetSlot: member.targetSlot,
    custom: member.custom ?? undefined,
    rotation: member.rotation ?? undefined,
    // 没覆盖的位置要留 undefined：引擎靠它判断这一动是不是用户指定的。
    script: last > 0 ? Array.from({ length: last }, (_, i) => member.overrides[i + 1]) as ActionKind[] : undefined,
    manualUltimates: member.manualUltimates ?? undefined,
    lightcone: member.lightconeId ? { id: member.lightconeId, superimpose: member.superimpose } : undefined,
    relics,
    measured: member.measured ?? undefined,
  };
}

export const needsManualUltimate = (id: string): boolean => id in DEFAULT_MANUAL_ULTIMATES;
export const defaultManualUltimates = (id: string): number[] => DEFAULT_MANUAL_ULTIMATES[id] ?? [];
export const coneMattersForAxis = (id: string): boolean => Boolean(LIGHTCONE_EFFECTS[id]?.apply || LIGHTCONE_EFFECTS[id]?.baseSpeedParam !== undefined);
export const setMattersForAxis = (id: string): boolean =>
  Boolean(RELIC_EFFECTS[`${id}:2`]?.apply || RELIC_EFFECTS[`${id}:4`]?.apply);

// ---------------------------- 结果 ---------------------------- //

/** 【阿哈时刻】在时间轴上的名字。它不属于任何角色，头像位用欢愉命途徽记。 */
export const AHA_NAME = "【阿哈时刻】";

export const TYPE_NAMES: Record<string, string> = {
  basic: "普攻",
  skill: "战技",
  enhanced_basic: "强化普攻",
  ultimate: "终结技",
  fua: "追加攻击",
  memosprite: "忆灵技",
  elation_skill: "欢愉技",
  aha: "阿哈时刻",
  aha_extra: "阿哈时刻额外回合",
  extra_turn: "额外回合",
  note: "说明",
  battle: "开战",
};

/** 行动轴上画点的类型。额外回合后面紧跟它的施放，不重复画。 */
const MARK_TYPES = new Set(["basic", "skill", "enhanced_basic", "ultimate", "fua", "memosprite", "elation_skill", "aha", "aha_extra"]);

export interface Row {
  /** 稳定的键：同一条轨道的第 n 个事件。改配置时靠它让点平滑滑到新位置。 */
  key: string;
  laneKey: string;
  slot: number | null;
  av: number;
  t: number;
  type: string;
  label: string;
  name: string;
  details: string[];
  extra: boolean;
  energy: number | null;
  /** 这一列是什么：一般是能量，特殊资源的角色是资源名（愿力、残梦……）。 */
  energyName: string;
  /** 第几动（从 1 数）；只有能覆盖的普攻、战技才有。 */
  action?: number;
  /** 这一动的技能选中了哪位队友（站位）；没选队友的没有。逐动改目标用它。 */
  target?: number;
  mark: boolean;
  /** 这条事件时的特殊资源，比如「笑点 20 · 愿力 3」。 */
  resources: string;
  /** 紧跟这条事件发生的拉条溢出（剩余距离不够扣，多出的作废）。没有就不带。 */
  overflows?: RowOverflow[];
}

export interface RowOverflow {
  /** 被拉条的单位。 */
  target: string;
  pct: number;
  /** 拉条前离行动还差多少 AV。 */
  leftAv: number;
  wastedAv: number;
}

export interface UnitView {
  slot: number;
  id: string;
  name: string;
  icon: string;
  splash: string;
  openingSpeed: number;
  energy: number;
  actions: number;
  ultimates: number;
  extraTurns: number;
}

export interface AxisView {
  maxAV: number;
  firstCycleAV: number;
  cycleAV: number;
  units: UnitView[];
  rows: Row[];
  warnings: string[];
  notes: string[];
  unsupported: UnsupportedMechanic[];
  truncated: boolean;
  /** 队伍里有欢愉角色才有。 */
  elation: ElationView | null;
  /** 开了伤害才有。 */
  damage: DamageView | null;
}

export interface ElationView {
  speed: number;
  finalSpeed: number;
  singleAV: number;
  triggers: number;
  extraTriggers: number;
  punchlineGranted: number;
  punchlineConsumed: number;
  /** 每个轮次边界前触发了几次。 */
  counts: { label: string; count: number }[];
  formula: string;
}

const laneKeyOf = (event: AxisEvent): string | null => {
  if (event.kind === "unit") return event.slot === null ? null : `u${event.slot}`;
  if (event.kind === "summon" || event.kind === "aha") return `s${event.name}`;
  return null;
};

const RESOURCE_NAMES: [string, string][] = [["punchline", "笑点"], ["wishpower", "愿力"], ["fervor", "热意"]];

function resourceText(res: Record<string, unknown>): string {
  return RESOURCE_NAMES
    .filter(([key]) => typeof res[key] === "number")
    .map(([key, name]) => `${name} ${Math.round(res[key] as number)}`)
    .join(" · ");
}

function buildRows(engine: AxisEngine, timeline: AxisEvent[]): Row[] {
  const counts = new Map<string, number>();
  const overflowsOf = groupOverflows(engine, timeline);
  return timeline.map((event) => {
    const laneKey = laneKeyOf(event);
    const mark = laneKey !== null && MARK_TYPES.has(event.type);
    const bucket = mark ? (laneKey as string) : `~${laneKey}`;
    const nth = counts.get(bucket) ?? 0;
    counts.set(bucket, nth + 1);
    // 终结技不靠能量的角色（黄泉【残梦】、昔涟【追忆】等）这一列显示自己的资源。
    // 星神★阿哈的 energy 为了旧格式留空，愿力在 wishpower 里；银狼LV.999 显示含溢出的隐藏分合计。
    const unit = event.slot !== null ? engine.units[event.slot] : undefined;
    const energyName = unit?.energyName ?? "能量";
    // 特殊资源没有名字的（遐蝶【新蕊】）是引擎不模拟的，不显示，免得一直是 0 让人误会。
    const hidden = unit?.energyType === "resource" && energyName === "能量";
    const energy = hidden ? null : unit?.id === "1511" ? event.res.wishpower : unit?.id === "1506" ? event.res.hiddenScore : event.res.energy;
    const action = event.type === "basic" || event.type === "skill" || event.type === "enhanced_basic" ? engine.actionIndexOf(event) : undefined;
    const target = action !== undefined && event.slot !== null ? engine.actionTargetOf(event.slot, action) : undefined;
    return {
      key: `${bucket}-${nth}`,
      laneKey: laneKey ?? "",
      slot: event.slot,
      av: event.av,
      t: event.t,
      type: event.type,
      label: event.label,
      name: event.name,
      details: event.details,
      extra: event.extra,
      energy: typeof energy === "number" ? energy : null,
      energyName,
      action,
      ...(target !== undefined ? { target } : {}),
      mark,
      resources: resourceText(event.res),
      ...(overflowsOf.has(event) ? { overflows: overflowsOf.get(event) } : {}),
    };
  });
}

/** 这张卡上发生的拉条溢出（主动作、顺带的动作和说明行）。 */
export const cardOverflows = (card: AxisCard): RowOverflow[] =>
  [...(card.main ? [card.main] : []), ...card.follows, ...card.notes].flatMap((row) => row.overflows ?? []);

/** 卡片详情里的一行说明。 */
export const overflowText = (item: RowOverflow): string => {
  const head = `${item.target} 拉条 ${Math.round(item.pct)}%`;
  // 被拉的人同一时刻本来就要行动了：这口拉条整个作废。
  if (item.leftAv < 0.05) return `${head}：已经轮到行动，${item.wastedAv.toFixed(1)} AV 全部作废`;
  return `${head}：本来只差 ${item.leftAv.toFixed(1)} AV，溢出 ${item.wastedAv.toFixed(1)} AV 作废`;
};

/** 拉条溢出按发生时最后一条事件分组；还没有事件时算在第一条上。 */
function groupOverflows(engine: AxisEngine, timeline: AxisEvent[]): Map<AxisEvent, RowOverflow[]> {
  const groups = new Map<AxisEvent, RowOverflow[]>();
  for (const item of engine.overflows) {
    const event = item.after ?? timeline[0];
    if (!event) continue;
    const list = groups.get(event) ?? [];
    list.push({ target: item.target, pct: item.pct, leftAv: item.leftAv, wastedAv: item.wastedAv });
    groups.set(event, list);
  }
  return groups;
}

function elationView(engine: AxisEngine, rows: Row[], maxAV: number, mode: Mode): ElationView | null {
  const el = engine.module<Elation>("elation");
  if (!el) return null;
  const ranked = [...el.elationUnits()].sort((a, b) => b.speed() - a.speed()).slice(0, 4);
  const parts = ranked.map((unit, index) => `${unit.speed().toFixed(1)} × ${AHA_WEIGHTS[index]}`);
  const counts: ElationView["counts"] = [];
  for (let t = 0, av = mode.firstCycleAV; av <= maxAV + 1e-9; t += 1, av += mode.cycleAV) {
    counts.push({ label: `${t}T（${av} AV）`, count: rows.filter((row) => (row.type === "aha" || row.type === "aha_extra") && row.av <= av + 1e-9).length });
  }
  const flat = el.ahaFlat ? ` + ${el.ahaFlat.toFixed(1)}` : "";
  const pct = el.cfg.ahaSpdPct ? ` × (1 + ${el.cfg.ahaSpdPct}%)` : "";
  return {
    speed: el.ahaInitialSpeed,
    finalSpeed: el.ahaSpeed(),
    singleAV: el.ahaInitialSpeed > 0 ? 10000 / el.ahaInitialSpeed : 0,
    triggers: el.normalCount,
    extraTriggers: el.extraCount,
    punchlineGranted: el.punchlineGranted,
    punchlineConsumed: el.punchlineConsumed,
    counts,
    formula: `底速 ${el.ahaBaseValue().toFixed(1)} + ${parts.join(" + ") || "无欢愉角色"}${flat}${pct} = ${el.ahaInitialSpeed.toFixed(2)}`,
  };
}

/** 跑一场。输入有问题时抛可读的错误，由页面显示，不留上一次的结果。 */
export function computeAxis(state: PageState, data: PageData, damage: DamageSetup | null = activeDamage()): AxisView {
  const mode = modeOf(state, data);
  const maxAV = windowAV(state, mode);
  const targets = battleTargets(state);
  const engine = createBattle({
    team: state.team.map((member, slot) => ({
      ...toMemberInput(member),
      ...(targets.targetScript[slot] ? { targetScript: targets.targetScript[slot] } : {}),
      ...(holdsUltimate(member) ? { ultMode: "hold" as const, ultAfter: targets.ultAfter[slot] } : {}),
    })),
    maxAV,
    useTechnique: state.useTechnique,
    leadSlot: targets.leadSlot,
    ultOrder: targets.ultOrder,
    cycle: { firstCycleAV: mode.firstCycleAV, cycleAV: mode.cycleAV },
    enemyCount: state.enemyCount,
    // 不勾时交给引擎按队伍判断：带了星神★阿哈就用她的底速。
    // 「按星神★阿哈的底速算」只在有她的模块时生效；正服没有她，旧存档里打开过也不算。
    elation: { ...state.elation, useAeonAha: state.elation.useAeonAha && hasKit("1511") ? true : null },
    damage: damage ? { model: damage.model, stats: Object.fromEntries(state.team.flatMap((member) => (member.panel ? [[member.id, member.panel]] : []))) } : undefined,
  }, data.game);
  const result = engine.run();
  const catalog = new Map(data.characters.map((item) => [String(item.id), item]));
  const rows = buildRows(engine, result.timeline);
  const units = result.units.map((unit, index): UnitView => {
    const item = catalog.get(unit.id);
    return {
      slot: unit.slot,
      id: unit.id,
      name: unit.name,
      icon: item?.icon ?? "",
      splash: item?.splash ?? "",
      openingSpeed: engine.units[index].initialSpeed,
      energy: unit.energy,
      actions: unit.actions,
      ultimates: unit.ultimates,
      extraTurns: unit.extraTurns,
    };
  });
  return {
    maxAV,
    firstCycleAV: mode.firstCycleAV,
    cycleAV: mode.cycleAV,
    units,
    rows,
    // 「未计入」单独成组展示，这里只留其余的提醒。
    warnings: result.warnings.filter((text) => !text.startsWith("未计入")),
    notes: result.notes,
    unsupported: result.unsupported,
    truncated: result.truncated,
    elation: elationView(engine, rows, maxAV, mode),
    damage: result.damage ? damageView(result.damage, rows.map((row) => row.key), TYPE_NAMES, maxAV, units.filter((_, slot) => !state.team[slot].panel).map((unit) => unit.name), !!damage?.preview) : null,
  };
}

// ---------------------------- 行动顺序筛选 ---------------------------- //

export type RowFilter = "all" | "turn" | "core" | "ultimate" | "extra" | "aha" | "elation";

export const ROW_FILTERS: { id: RowFilter; label: string; title: string; elationOnly?: boolean }[] = [
  { id: "all", label: "全部", title: "所有行动" },
  { id: "turn", label: "跑条", title: "跑满行动条才有的行动：普攻、战技和【阿哈时刻】" },
  { id: "core", label: "关键", title: "终结技、额外回合和【阿哈时刻】" },
  { id: "ultimate", label: "终结技", title: "只看终结技" },
  { id: "extra", label: "额外回合", title: "只看额外回合" },
  { id: "aha", label: "阿哈时刻", title: "只看【阿哈时刻】", elationOnly: true },
  { id: "elation", label: "欢愉技", title: "只看欢愉技", elationOnly: true },
];

const matchesFilter = (row: Row, filter: RowFilter): boolean => {
  switch (filter) {
    case "turn": return ["basic", "skill", "enhanced_basic", "aha"].includes(row.type);
    case "core": return ["ultimate", "aha", "aha_extra", "extra_turn"].includes(row.type);
    case "ultimate": return row.type === "ultimate";
    case "extra": return row.extra || row.type === "extra_turn" || row.type === "aha_extra";
    case "aha": return row.name === AHA_NAME;
    case "elation": return row.type === "elation_skill";
    default: return true;
  }
};

// ---------------------------- 轴上的卡片 ---------------------------- //

/** 轴上的一张卡：一个主动作，加上同一时刻顺带出来的动作和说明。
 * start：开战（秘技、进场效果）；aha：【阿哈时刻】和它带出的欢愉技；ult：终结技；unit：其余主动作。 */
export interface AxisCard {
  /** 主动作那一行的键，开战卡是 "start"。改配置时靠它保持选中和位置。 */
  key: string;
  kind: "start" | "unit" | "aha" | "ult";
  av: number;
  t: number;
  main: Row | null;
  /** 同一时刻挂在主动作后面的追加攻击、欢愉技、忆灵技。 */
  follows: Row[];
  /** 说明行（回能、拉条、资源结算……），平时不显示，点开卡片才看。 */
  notes: Row[];
}

const FOLLOW_TYPES = new Set(["fua", "elation_skill", "memosprite"]);
const sameAV = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;

/** 把逐条事件归成卡片。
 * 追加攻击、欢愉技、忆灵技和上一张卡同一时刻时并到那张卡上（阿哈战技的追击、阿哈时刻里各人的欢愉技、回合外欢愉技）。
 * 说明行跟着前一张卡；同一时刻、同一角色的主动作之前的说明（比如「回合开始」、额外回合）跟着那个主动作。 */
export function buildCards(rows: Row[]): AxisCard[] {
  const start: AxisCard = { key: "start", kind: "start", av: 0, t: 0, main: null, follows: [], notes: [] };
  const cards = [start];
  let previous = start;
  let pending: Row[] = [];
  for (const row of rows) {
    if (!row.mark) {
      pending.push(row);
      continue;
    }
    let card: AxisCard;
    if (FOLLOW_TYPES.has(row.type) && previous.kind !== "start" && sameAV(previous.av, row.av)) {
      card = previous;
      card.follows.push(row);
    } else {
      const kind = row.type === "ultimate" ? "ult" : row.name === AHA_NAME ? "aha" : "unit";
      card = { key: row.key, kind, av: row.av, t: row.t, main: row, follows: [], notes: [] };
      cards.push(card);
    }
    for (const note of pending) {
      const ahead = note.slot !== null && note.slot === row.slot && sameAV(note.av, row.av);
      (ahead ? card : previous).notes.push(note);
    }
    pending = [];
    previous = card;
  }
  previous.notes.push(...pending);
  return start.notes.length > 0 ? cards : cards.slice(1);
}

/** 卡片里的角色（主动作和顺带的动作），按角色筛选时用。 */
export const cardSlots = (card: AxisCard): (number | null)[] => [card.main?.slot ?? null, ...card.follows.map((row) => row.slot)];

/** 卡片是否符合筛选：主动作、顺带的动作或额外回合说明里有一条符合就算。开战卡只在「全部」里。 */
export function cardMatches(card: AxisCard, filter: RowFilter, slot: number | null): boolean {
  if (card.kind === "start") return filter === "all" && slot === null;
  if (slot !== null && !cardSlots(card).includes(slot)) return false;
  if (filter === "all") return true;
  const rows = [card.main as Row, ...card.follows, ...card.notes.filter((row) => row.type === "extra_turn")];
  return rows.some((row) => matchesFilter(row, filter));
}

/** 同一 AV 的卡片排在同一个「时刻」里，轴上只标一次时间。 */
export interface AxisMoment {
  key: string;
  av: number;
  t: number;
  cards: AxisCard[];
}

export function groupMoments(cards: AxisCard[]): AxisMoment[] {
  const list: AxisMoment[] = [];
  for (const card of cards) {
    const last = list[list.length - 1];
    if (last && card.kind !== "start" && last.cards[0].kind !== "start" && last.t === card.t && sameAV(last.av, card.av)) last.cards.push(card);
    else list.push({ key: card.key, av: card.av, t: card.t, cards: [card] });
  }
  return list;
}

// ---------------------------- 速度阈值反推 ---------------------------- //

export interface Threshold {
  targetAV: number;
  actions: number;
  advancePct: number;
  required: number;
  formula: string;
}

/** 需求速度 = 10000 × (动数 − 拉条%/100) ÷ 目标行动值。 */
export function speedThreshold(targetAV: number, actions: number, advancePct: number): Threshold {
  if (!(targetAV > 0)) throw new Error("目标行动值需要大于 0。");
  if (!(actions >= 1)) throw new Error("动数至少是 1。");
  if (!(advancePct >= 0)) throw new Error("累计拉条不能是负数。");
  const required = (10000 * (actions - advancePct / 100)) / targetAV;
  return { targetAV, actions, advancePct, required, formula: `10000 × (${actions} − ${advancePct}%) ÷ ${targetAV} = ${required.toFixed(2)}` };
}

/** 第 action 动实际放了什么。用来判断逐动覆盖有没有生效。 */
export const castsOf = (view: AxisView, slot: number, action: number): string[] =>
  view.rows.filter((row) => row.slot === slot && row.action === action).map((row) => row.type);
