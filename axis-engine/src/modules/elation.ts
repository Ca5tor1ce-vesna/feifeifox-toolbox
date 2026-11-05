/**
 * 欢愉机制：笑点、【阿哈时刻】、好活当赏和【欢愉万相】。
 * 只有队伍里有欢愉角色时才需要它；具体角色的效果写在各自的模块里。
 *
 * 依据 4.6.53 版本资料，加上用户补充的实战规则。
 */
import { EPS, MAX_NEST, type AxisEngine } from "../engine.ts";
import { fmt } from "../format.ts";
import type { BattleModule, CharacterKit } from "../types.ts";
import { DIST_BASE, type SummonActor, type Unit } from "../unit.ts";

export const AHA_WEIGHTS = [0.2, 0.1, 0.05, 0.025];

export interface ElationConfig {
  useAeonAha: boolean | null;
  ultAdvanceAha: number;
  ultSpdPct: number;
  trace3Advance: boolean;
  e1Wishpower: number;
  /** 【三赌牌局】全队提速、热意和笑点。null 按升格等级：1 级 15% / +1 / +1，2 级 25% / +2 / +2。 */
  sanduTeamSpdPct: number | null;
  sanduFervorGain: number | null;
  sanduPunchlineGain: number | null;
  summerLcSpdPct: number;
  sigLcPunchline: number;
  aeonAhaBaseSpd: number | null;
  aeonAhaLcBaseSpd: number | null;
  ahaSpdPct: number;
  ahaAdvancePct: number;
  feiyingHaohuoMode: "punchline" | "flat";
  feiyingHaohuoEnergy: number;
}

export interface Haohuo {
  turns: number;
  count: number;
  label: string;
}

export interface HaohuoGrant {
  applied: number;
  count: number;
  label: string;
  fromEnergy: boolean;
}

/** 欢愉角色模块可以额外实现的钩子。 */
export interface ElationKit extends CharacterKit {
  /** 参演编号，有它才能施放欢愉技。越小越先。 */
  elationNumber?: number;
  /** 无视编号，始终最后施放（星神★阿哈）。 */
  castsLast?: boolean;
  /** 完整替换欢愉技（砂金•戏浪的《举杯！》）。 */
  castElation?: () => void;
  /** 欢愉技的说明行。 */
  elationDetails?: () => string[];
  /** 欢愉技的回能，默认基础 5。 */
  onElationCast?: () => void;
  /** 所有欢愉技共用结算的前后。 */
  beforeElationCommon?: () => void;
  afterElationCommon?: () => void;
  /** 好活当赏持有上限，返回实际获得量。 */
  clampHaohuo?: (count: number) => number;
  haohuoTurns?: () => number;
  /** 队友获得好活当赏（绯英的转移）。 */
  onAllyHaohuo?: (ally: Unit, applied: number) => void;
  /** 队友的好活当赏到期（绯英的转移）。 */
  onAllyHaohuoExpired?: (ally: Unit, item: Haohuo) => void;
  onHaohuo?: (grant: HaohuoGrant) => void;
  onPunchlineGain?: (amount: number) => void;
  onAhaMomentEnd?: () => void;
  /** 【欢愉万相】开始时写进说明的固有行迹效果，按升格等级。 */
  ascensionNote?: (level: 1 | 2) => string;
  ascensionTrace?: string;
  /** 受到队友治疗或护盾（阿哈行迹 2）。 */
  onHealOrShield?: (label: string) => void;
  /** 把【阿哈时刻】笑点首达 40 的愿力给阿哈。 */
  onPunchline40?: () => void;
  isAscended?: () => boolean;
  /** 结果里展示的角色状态。 */
  mechanics?: () => Record<string, unknown>;
}

export const kitOf = (unit: Unit): ElationKit | undefined => unit.kit as ElationKit | undefined;

export class Elation implements BattleModule {
  readonly id = "elation";
  readonly cfg: ElationConfig;
  punchline = 0;
  punchline40Done = false;
  punchlineConsumed = 0;
  punchlineGranted = 0;
  ahaFlat = 0;
  normalCount = 0;
  extraCount = 0;
  useAeonAha = false;
  ahaBaseSpd = 94;
  ahaLcBaseSpd = 12;
  ahaInitialSpeed = 0;
  aha!: SummonActor;
  private engine!: AxisEngine;
  private readonly haohuo = new Map<Unit, Haohuo[]>();

  constructor(cfg: ElationConfig) {
    this.cfg = cfg;
  }

  install(engine: AxisEngine): void {
    this.engine = engine;
    const ahaUnit = engine.findUnit("1511");
    this.useAeonAha = this.cfg.useAeonAha === null ? ahaUnit !== undefined : this.cfg.useAeonAha || ahaUnit !== undefined;
    this.ahaBaseSpd = this.cfg.aeonAhaBaseSpd ?? ahaUnit?.baseSpd ?? 94;
    this.ahaLcBaseSpd = this.cfg.aeonAhaLcBaseSpd ?? ahaUnit?.lcBaseSpd ?? 12;
    this.aha = engine.addActor({
      name: "【阿哈时刻】",
      selfManaged: true,
      speed: () => this.ahaSpeed(),
      onTurn: () => this.doAha(false, 0),
    });
    engine.on("battleStart", () => {
      this.aha.remDist = Math.max(0, DIST_BASE - (DIST_BASE * this.cfg.ahaAdvancePct) / 100);
    });
    engine.on("speedSnapshot", () => { this.ahaInitialSpeed = this.ahaSpeed(); });
    engine.on("turnEnd", ({ unit, buffsExpired }) => this.onTurnEnd(unit, buffsExpired), 10);
    engine.addResourceView((unit) => {
      const aha = engine.findUnit("1511");
      const fervor = engine.kitOf<ElationKit & { fervor: number }>("1513");
      const view: Record<string, unknown> = {
        punchline: this.punchline,
        wishpower: aha ? aha.energy : null,
        fervor: fervor ? fervor.fervor : null,
      };
      if (unit && unit.id === "1511") view.energy = null;
      return view;
    });
  }

  // ----------------------------- 查询 ----------------------------- //

  elationUnits(): Unit[] {
    return this.engine.units.filter((unit) => unit.elation);
  }

  /** 当前可施放欢愉技的角色：按参演编号，星神★阿哈始终最后。 */
  elationCasters(): Unit[] {
    const casters = this.engine.units.filter((unit) => unit.elation && kitOf(unit)?.elationNumber !== undefined);
    const rest = casters.filter((unit) => !kitOf(unit)?.castsLast)
      .sort((a, b) => (kitOf(a)?.elationNumber ?? 0) - (kitOf(b)?.elationNumber ?? 0));
    return [...rest, ...casters.filter((unit) => kitOf(unit)?.castsLast)];
  }

  huanyuActive(): boolean {
    return kitOf(this.engine.findUnit("1511") ?? ({} as Unit))?.isAscended?.() ?? false;
  }

  /**
   * 「欢愉」命途升格的等级：没升格是 0。星神★阿哈 2 魂「使「欢愉」命途升格效果获得加强」，
   * 各角色的【欢愉万相★】行迹都按 2 级算（4.6.54 版本星魂文案，各行迹 1、2 级参数见 4.6.53）。
   */
  ascensionLevel(): 0 | 1 | 2 {
    if (!this.huanyuActive()) return 0;
    return (this.engine.findUnit("1511")?.eidolon ?? 0) >= 2 ? 2 : 1;
  }

  ahaBaseValue(): number {
    return this.useAeonAha ? this.ahaBaseSpd + this.ahaLcBaseSpd : 80;
  }

  ahaSpeed(): number {
    const speeds = this.elationUnits().map((unit) => unit.speed()).sort((a, b) => b - a);
    let weighted = 0;
    AHA_WEIGHTS.forEach((weight, index) => { weighted += weight * (speeds[index] ?? 0); });
    return (this.ahaBaseValue() + weighted + this.ahaFlat) * (1 + this.cfg.ahaSpdPct / 100);
  }

  haohuoOf(unit: Unit): Haohuo[] {
    let list = this.haohuo.get(unit);
    if (!list) {
      list = [];
      this.haohuo.set(unit, list);
    }
    return list;
  }

  haohuoSum(unit: Unit): number {
    return this.haohuoOf(unit).reduce((sum, item) => sum + item.count, 0);
  }

  // ----------------------------- 资源 ----------------------------- //

  advanceAha(pct: number): void {
    this.engine.advance(this.aha, pct, { selfSource: true });
  }

  gainPunchline(amount: number): void {
    if (amount === 0) return;
    const before = this.punchline;
    this.punchline += amount;
    this.punchlineGranted += amount;
    if (amount > 0) for (const unit of this.engine.units) kitOf(unit)?.onPunchlineGain?.(amount);
    // 「首次达到」：这一次添加之前低于 40，添加之后不低于 40。已经在 40 以上时再加，不算再次达到。
    if (!this.punchline40Done && before < 40 && this.punchline >= 40) {
      this.punchline40Done = true;
      const aha = this.engine.findUnit("1511");
      if (aha) kitOf(aha)?.onPunchline40?.();
    }
  }

  grantHaohuo(targets: Unit[], count: number, label: string, options: { fromEnergy?: boolean } = {}): void {
    for (const unit of targets) {
      const kit = kitOf(unit);
      const applied = kit?.clampHaohuo ? kit.clampHaohuo(count) : count;
      if (kit?.clampHaohuo && applied <= EPS) continue;
      this.haohuoOf(unit).push({ turns: kit?.haohuoTurns?.() ?? 2, count: applied, label });
      for (const other of this.engine.units) {
        if (other !== unit) kitOf(other)?.onAllyHaohuo?.(unit, applied);
      }
      kit?.onHaohuo?.({ applied, count, label, fromEnergy: options.fromEnergy ?? false });
    }
  }

  onTurnEnd(unit: Unit, buffsExpired: boolean): void {
    if (buffsExpired && unit.elation) this.engine.notes.push(`${unit.name} 的速度加成到期，【阿哈时刻】速度已重算`);
    const kept: Haohuo[] = [];
    const expired: Haohuo[] = [];
    for (const item of this.haohuoOf(unit)) {
      item.turns -= 1;
      (item.turns > 0 ? kept : expired).push(item);
    }
    this.haohuo.set(unit, kept);
    for (const other of this.engine.units) {
      if (other === unit) continue;
      for (const item of expired) kitOf(other)?.onAllyHaohuoExpired?.(unit, item);
    }
  }

  // ----------------------------- 欢愉技 ----------------------------- //

  /** 所有欢愉技共用的结算：角色自己的部分和专武《向浪花掷下盛夏》的【风口】。 */
  elationCommon(unit: Unit): void {
    const kit = kitOf(unit);
    kit?.beforeElationCommon?.();
    if (unit.equip.hasSummerLc) {
      this.engine.addSpeedBuff(unit, { kind: "pct", value: this.cfg.summerLcSpdPct, turns: null, label: "【风口】" });
      this.engine.notes.push(`${unit.name} 施放欢愉技触发【风口】：速度 +${fmt(this.cfg.summerLcSpdPct, 0)}%`);
    }
    kit?.afterElationCommon?.();
  }

  castElationSkill(unit: Unit): void {
    const engine = this.engine;
    if (engine.depth > MAX_NEST) return;
    engine.depth += 1;
    try {
      const kit = kitOf(unit);
      if (kit?.castElation) {
        kit.castElation();
        return;
      }
      engine.record("elation_skill", unit, `${unit.name} 的欢愉技`, { details: ["不产生笑点", ...(kit?.elationDetails?.() ?? ["基础回能 5 × (1+ERR)"])] });
      if (kit?.onElationCast) kit.onElationCast();
      else engine.gainEnergy(unit, 5, { reason: "欢愉技" });
      this.elationCommon(unit);
      engine.attack(unit, "elation_skill");
    } finally {
      engine.depth -= 1;
    }
  }

  // ----------------------------- 额外回合 ----------------------------- //

  /** 带笑点和好活当赏的额外回合。笑点只在这个回合内有效，结束时收回。 */
  extraTurnWithGrants(unit: Unit, label: string, grants: { punchline?: number; haohuo?: number; after?: () => void } = {}): void {
    const punchline = grants.punchline ?? 0;
    const haohuo = grants.haohuo ?? 0;
    const details: string[] = [];
    if (punchline > 0) details.push(`笑点 +${fmt(punchline, 0)}（额外回合结束时结算）`);
    if (haohuo > 0) details.push(`好活当赏 +${fmt(haohuo, 0)}`);
    this.engine.extraTurn(unit, label, {
      details,
      before: () => {
        if (haohuo > 0) this.grantHaohuo([unit], haohuo, label);
        if (punchline > 0) this.gainPunchline(punchline);
      },
      after: () => {
        if (punchline > 0) {
          const removed = Math.min(this.punchline, punchline);
          this.punchline -= removed;
          let tail = "";
          if (this.huanyuActive()) {
            this.punchline += removed * 0.1;
            tail = "（欢愉万相返还 10%）";
          }
          this.engine.record("note", unit, "额外回合笑点结算", { details: [`回收 ${fmt(removed, 0)} 笑点${tail}`], extra: true });
        }
        grants.after?.();
      },
    });
  }

  // ----------------------------- 【阿哈时刻】 ----------------------------- //

  doAha(isExtra: boolean, fixed: number): void {
    const engine = this.engine;
    if (engine.depth > MAX_NEST) return;
    engine.depth += 1;
    const run = () => this.ahaBody(isExtra, fixed);
    try {
      if (isExtra) engine.inExtraWindow(run);
      else run();
    } finally {
      engine.depth -= 1;
    }
    if (isExtra) for (const ally of engine.units) engine.maybeUltimate(ally);
  }

  private ahaBody(isExtra: boolean, fixed: number): void {
    const engine = this.engine;
    const a = this.aha;
    // 额外回合可能嵌在普通【阿哈时刻】里（比如爻光在其中开大），结束时要还原外层状态。
    const wasInTurn = a.inTurn;
    a.inTurn = true;
    // 同普通回合：到达时归零。额外回合不重置距离，不能动。
    if (!isExtra) a.remDist = 0;
    const casters = this.elationCasters();
    const recipients = this.elationUnits();
    const rowOptions = { kind: "aha" as const, name: "【阿哈时刻】" };
    if (isExtra) {
      this.extraCount += 1;
      engine.record("aha_extra", null, `【阿哈时刻】额外回合（计入 ${fmt(fixed, 0)} 笑点）`, {
        ...rowOptions,
        details: ["不消耗笑点池", "不重置【阿哈时刻】行动条距离"],
        extra: true,
      });
    } else {
      this.normalCount += 1;
      engine.record("aha", null, "【阿哈时刻】触发", {
        ...rowOptions,
        details: ["解除欢愉角色负面", "可施放欢愉技的角色各施放 1 次（不产笑点）", "无人可施放则 Let There Be Laughter", "回合结束消耗全部笑点"],
      });
    }
    if (casters.length > 0) {
      for (const unit of casters) this.castElationSkill(unit);
    } else {
      engine.record("note", null, "Let There Be Laughter", {
        ...rowOptions,
        details: ["场上没有可施放欢愉技的角色", "保底效果（文档未给数值，不产笑点、不改笑点池）"],
        extra: isExtra,
      });
    }
    if (isExtra) {
      if (fixed > 0) this.grantHaohuo(recipients, fixed, "阿哈时刻额外回合");
    } else {
      const consumed = this.punchline;
      this.punchline = 0;
      this.punchlineConsumed += consumed;
      const details = [`消耗笑点 ${fmt(consumed, 0)}`];
      if (this.huanyuActive()) {
        const refund = consumed * 0.1;
        this.punchline += refund;
        details.push(`欢愉万相返还 10%（+${fmt(refund)}）`);
      }
      engine.record("note", null, "【阿哈时刻】笑点结算", { ...rowOptions, details });
      if (consumed > 0) this.grantHaohuo(recipients, consumed, "阿哈时刻");
    }
    // 天赋：阿哈回合结束后可再次触发。额外回合也是阿哈的回合。
    // 触发仍要求笑点从低于 40 再升上去，所以这里清标志不会在池子仍 ≥40 时连发。
    this.punchline40Done = false;
    this.ahaFlat = 0;
    if (!isExtra) {
      a.remDist = Math.max(0, DIST_BASE - (DIST_BASE * a.pendingAdvance) / 100);
      a.pendingAdvance = 0;
    } else if (!wasInTurn) {
      a.remDist = Math.max(0, a.remDist - (DIST_BASE * a.pendingAdvance) / 100);
      a.pendingAdvance = 0;
    }
    // 嵌套的额外回合不结算挂起的拉条：留给外层回合结束时，从重置后的距离里扣。
    a.inTurn = wasInTurn;
    for (const unit of engine.units) kitOf(unit)?.onAhaMomentEnd?.();
  }
}

export const elationOf = (engine: AxisEngine): Elation => {
  const module = engine.module<Elation>("elation");
  if (!module) throw new Error("欢愉角色需要欢愉机制模块");
  return module;
};

export const ATTACK_ORDER = {
  trailblazerTalent: 10,
  robinTalent: 20,
  aventurineBlind: 30,
  sandTalent: 40,
  yaoguangTalent: 60,
} as const;

/** 天赋「队友攻击时」的触发面，不含欢愉技。 */
export const TALENT_ATTACK_KINDS = ["basic", "skill", "enhanced_basic", "ultimate", "fua", "memosprite"];
