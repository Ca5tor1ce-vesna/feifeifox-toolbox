import type { DamageReport } from "./damage/types.ts";
import type { AxisEngine } from "./engine.ts";
import type { SummonActor, Unit } from "./unit.ts";

export type ActionKind = "basic" | "skill";

/** standard 按能量恢复效率回能；resource 是愿力、隐藏分这类特殊资源，不吃能量恢复效率。 */
export type EnergyType = "standard" | "resource";

export interface CycleStructure {
  firstCycleAV: number;
  cycleAV: number;
}

/** 带持续回合的属性增益。err 是能量恢复效率（%），名字沿用最早只有速度时的叫法。 */
/** 姬子•启行的助战技谁来用：auto 按默认（能白用的队友里第一个用的那位），use 有次数就用，never 不用。 */
export type AssistPreference = "auto" | "use" | "never";

export interface SpeedBuff {
  kind: "pct" | "flat" | "err";
  value: number;
  /**
   * null 表示常驻；否则在持有者的普通回合结束时递减，额外回合不递减。
   * 只有回合开始时已存在的增益才减：自己回合内才获得的，当回合结束不减。
   * 资料：Honkai: Star Rail Wiki「Speed」和中文社区分析，非官方说明。
   */
  turns: number | null;
  label: string;
  /** 回合开始时已存在。引擎自己维护。 */
  armed?: boolean;
}

export interface KitContext {
  engine: AxisEngine;
  self: Unit;
}

export interface ActContext extends KitContext {
  kind: ActionKind;
  extra: boolean;
}

export interface EnergyGain {
  amount: number;
  fixed: boolean;
  reason: string;
  /** 这笔能量来自好活当赏结算，不再反向转成好活当赏（绯英）。 */
  fromHaohuo: boolean;
}

export interface UltimatePayment {
  details?: string[];
  resources?: Record<string, unknown>;
}

/** 一个角色的机制模块。钩子都是可选的，没有写的部分走通用行为。 */
export interface CharacterKit {
  id: string;
  /** 依赖敌方的机制。这一版不模拟敌方，这里列出的条目不触发，并写进结果的「未计入」提示。 */
  enemyDependent?: string[];
  /** 这名角色的资料有特别说明（比如来自测试版），会写进结果提示。 */
  dataNotice?: string;
  install?: (engine: AxisEngine, self: Unit) => void;
  /** 进入战斗，早于秘技。 */
  onEntry?: (context: KitContext) => void;
  /** 秘技，只在开启秘技时触发。 */
  onTechnique?: (context: KitContext) => void;
  /** 所有人的秘技都结算完之后。 */
  onTechniqueDone?: (context: KitContext) => void;
  /** 战斗开始触发的行迹和被动，与秘技无关。 */
  onBattleStart?: (context: KitContext) => void;
  /** 开局结算的最后一步，之后才允许插大。 */
  onOpeningEnd?: (context: KitContext) => void;
  onTurnStart?: (context: KitContext) => void;
  /** 替换默认出招。没有提供时走 engine.defaultAct。 */
  act?: (context: ActContext) => void;
  afterAct?: (context: ActContext) => void;
  /** 替换默认回能（愿力、隐藏分、绯英的能量转换）。 */
  gainEnergy?: (context: KitContext, gain: EnergyGain) => void;
  /** 默认：能开就开。银狼在【无敌玩家】期间不能开大。 */
  canUltimate?: (context: KitContext) => boolean;
  /** 替换默认的扣能量，返回要写进时间轴的说明。 */
  payUltimate?: (context: KitContext) => UltimatePayment | void;
  onUltimate?: (context: KitContext) => void;
  onTurnEnd?: (context: KitContext) => void;
}

export interface BattleModule {
  id: string;
  install: (engine: AxisEngine) => void;
  /**
   * 这一动开始前改写要出的招（比如战技点不足时把战技改回普攻）。
   * 返回 undefined 表示不改；返回别的动作就按返回的结算。
   */
  beforeAct?: (context: { engine: AxisEngine; unit: Unit; kind: ActionKind }) => ActionKind | undefined;
}

/** 身上的光锥和遗器。params 是当前叠影的数值，active 表示命途相符、效果生效。 */
export interface UnitGear {
  lightcone?: { id: string; params: readonly number[]; active: boolean };
  relics: { id: string; pieces: number }[];
}

export interface UnitSpec {
  id: string;
  gear?: UnitGear;
  name: string;
  baseSpd: number;
  /** 光锥基础速度，进百分比乘区。 */
  lcBaseSpd?: number;
  /** 行迹固定速度，在百分比乘区之外。 */
  traceSpd?: number;
  pctSpd?: number;
  flatSpd?: number;
  maxEnergy: number;
  /** 终结技消耗，默认等于能量上限。 */
  ultCost?: number;
  energyType?: EnergyType;
  /** 终结技靠什么充能：默认「能量」，特殊资源写资源名（【残梦】【愿力】等），页面按这个名字显示。 */
  energyName?: string;
  /** 默认标准能量 50%、特殊资源 0。 */
  initialEnergy?: number;
  err?: number;
  initAdv?: number;
  rotation?: ActionKind;
  /** 逐动覆盖：第 n 动（含额外回合）用什么，用完后回到 rotation。 */
  script?: ActionKind[];
  /** 第几动之后开大（不看能量），用于算不出开大时点的角色。 */
  manualUltimates?: number[];
  /** 终结技算一次攻击，由引擎发出攻击事件。自己结算攻击的模块不要打开。 */
  ultimateAttacks?: boolean;
  energyGains?: Partial<Record<ActionKind | "ultimate", number>>;
  eidolon?: number;
  /** 按强化版算（只对有强化版的角色有意义）。 */
  enhanced?: boolean;
  /** 姬子•启行的助战技：auto 按默认规则，use 有次数就用，never 不用。 */
  assist?: AssistPreference;
  /** 命途中文名，有些机制按命途生效。 */
  path?: string;
  elation?: boolean;
  /** 指定目标所在的站位（令使、美学底本、星期日战技等）。 */
  targetSlot?: number | null;
  equipment?: Record<string, boolean>;
  kit?: CharacterKit;
  /** 实际装配的真实属性（见 MemberInput.measured）。 */
  measured?: { elation: number };
}

export interface AxisConfig {
  maxAV: number;
  units: UnitSpec[];
  /** 默认混沌回忆结构（首轮 150、其后每轮 100）；各模式的值来自 modes.json。 */
  cycle?: CycleStructure;
  /** 是否结算秘技，默认结算。 */
  useTechnique?: boolean;
  /** 敌人数量，默认 1。不模拟敌方，只用来算「每击中 1 个目标」这类回能。 */
  enemyCount?: number;
  /** 在角色模块之前安装：角色模块会用到它们的状态。 */
  modules?: BattleModule[];
  /** 在角色模块之后安装：同一事件上排在角色机制之后结算（比如遗器效果）。 */
  lateModules?: BattleModule[];
  maxTimeline?: number;
  /** 写在结果说明里的模型范围，默认一句通用说明。 */
  scopeNote?: string;
}

export interface AxisEvent {
  av: number;
  t: number;
  kind: "unit" | "system" | "summon" | "aha";
  slot: number | null;
  name: string;
  type: string;
  extra: boolean;
  label: string;
  details: string[];
  res: Record<string, unknown>;
}

export interface RecordOptions {
  details?: string[];
  kind?: AxisEvent["kind"];
  extra?: boolean;
  name?: string;
  resources?: Record<string, unknown>;
}

export interface UnsupportedMechanic {
  unit: string;
  mechanic: string;
}

export interface UnitSummary {
  id: string;
  name: string;
  slot: number;
  speed: number;
  energy: number;
  actions: number;
  turns: number;
  ultimates: number;
  extraTurns: number;
}

export interface AxisResult {
  maxAV: number;
  timeline: AxisEvent[];
  units: UnitSummary[];
  warnings: string[];
  notes: string[];
  unsupported: UnsupportedMechanic[];
  truncated: boolean;
  /** 开了伤害账本才有（BattleInput.damage）。 */
  damage?: DamageReport;
}

/**
 * 钩子事件。后四个是留给敌方模拟的接口：这一版引擎不会发出它们，
 * 以后加敌方模拟时角色模块不用改写法。
 */
export interface AxisEvents {
  battleStart: Record<string, never>;
  /** 所有人的开局速度都定下来了，开局拉条还没结算（翁瓦克要用这个速度判断）。 */
  speedSnapshot: Record<string, never>;
  battleTraits: { unit: Unit };
  openingAdvance: { unit: Unit };
  turnStart: { unit: Unit };
  /** 这一动刚开始、还没结算。刻律德菈的【奇袭】要靠它在原技能之前插一次副本。 */
  skillStart: { unit: Unit; kind: ActionKind; extra: boolean };
  /**
   * 战技点变化（只在开启战技点系统时发出）。amount 是逻辑变化：
   * 扣【爆点】这类「视为消耗战技点」的效果也按消耗发，即使 SP 数值没动。
   */
  spChanged: { unit: Unit; amount: number; reason: string; spend: boolean; restore: boolean };
  attack: { unit: Unit; kind: string; extra: boolean };
  /** 队友的技能（战技、终结技、忆灵技）选中了另一名我方角色（单体或扩散圈能选到的）。白厄靠它拿【火种】。 */
  allyTargeted: { caster: Unit; target: Unit; ability: string };
  /** 姬子•启行的助战技发动了一次。owner 是姬子•启行，user 是使用者（送的那次是她自己），free 表示协议送的。 */
  assist: { owner: Unit; user: Unit; free: boolean };
  ultimate: { unit: Unit };
  turnEnd: { unit: Unit; buffsExpired: boolean };
  /** 这一动结束。casts 是实际施放的普攻、战技（含强化），角色模块可能改掉请求的出招。 */
  actionDone: { unit: Unit; casts: readonly string[]; extra: boolean };
  /** 时间轴上的一步（角色回合、召唤物回合或【阿哈时刻】）整个结算完。 */
  stepDone: Record<string, never>;
  /** 忆灵上场或消失。 */
  memosprite: { unit: Unit; present: boolean };
  /** 召唤物、忆灵或倒计时的回合结算完。【阿哈时刻】这类自己管回合的不发。 */
  summonTurn: { actor: SummonActor };
  energyGain: { unit: Unit; gain: number; requested: number; reason: string };
  enemyAction: { unit: Unit | null };
  unitHit: { unit: Unit };
  enemyKilled: { unit: Unit | null };
  weaknessBreak: { unit: Unit | null };
}
