/**
 * 全角色行动轴的事件核心：只管行动条、回合流程、回能和时间轴，不认识任何具体角色。
 * 角色机制写在 CharacterKit 里，跨角色的机制（比如欢愉）写在 BattleModule 里。
 *
 * 这一版只模拟我方：AxisEvents 里的敌方事件不会发出。
 */
import type { DamageLedger } from "./damage/ledger.ts";
import { fmt } from "./format.ts";
import type {
  ActionKind,
  AdvanceOverflow,
  AxisConfig,
  AxisEvent,
  AxisEvents,
  AxisResult,
  BattleModule,
  CharacterKit,
  CycleStructure,
  RecordOptions,
  SpeedBuff,
  UnsupportedMechanic,
} from "./types.ts";
import { DIST_BASE, Unit, type Actor, type SummonActor, type SummonSpec } from "./unit.ts";

export const EPS = 1e-9;
export const MAX_NEST = 24;
const MAX_TEAM = 4;
const MAX_AV = 1000;
const MAX_LOOP = 20000;
const DEFAULT_MAX_TIMELINE = 4000;
const MOC_CYCLE: CycleStructure = { firstCycleAV: 150, cycleAV: 100 };
const ACTION_NAMES: Record<ActionKind, string> = { basic: "普攻", skill: "战技" };
/** 时间轴上算「施放了普攻或战技」的记录类型。 */
const CAST_TYPES = ["basic", "skill", "enhanced_basic"];

type Handler<K extends keyof AxisEvents> = (payload: AxisEvents[K]) => void;
type Entry = { priority: number; handler: (payload: never) => void };

export class AxisEngine {
  readonly units: Unit[];
  readonly warnings: string[] = [];
  readonly notes: string[] = [];
  readonly timeline: AxisEvent[] = [];
  /** 拉条溢出，见 noteOverflow。 */
  readonly overflows: AdvanceOverflow[] = [];
  readonly summons: SummonActor[] = [];
  readonly maxAV: number;
  readonly enemyCount: number;
  av = 0;
  truncated = false;
  /** 嵌套结算深度。防止回能和追击互相触发时无限递归。 */
  depth = 0;
  opening = false;

  private readonly maxTimeline: number;
  private readonly cycle: CycleStructure;
  private readonly useTechnique: boolean;
  private readonly leadSlot: number | null;
  /** 几名角色同时能开大时按这个顺序开（用户指定的在前，其余按站位）。 */
  readonly ultQueue: readonly Unit[];
  private readonly scopeNote: string;
  private readonly handlers = new Map<keyof AxisEvents, Entry[]>();
  private readonly speedModifiers: ((unit: Unit) => { pct?: number; flat?: number })[] = [];
  private readonly resourceViews: ((unit: Unit | null) => Record<string, unknown>)[] = [];
  private readonly modules = new Map<string, BattleModule>();
  private extraDepth = 0;
  private ultimateHolds = 0;
  private casts: string[] = [];
  private readonly actionOf = new WeakMap<AxisEvent, number>();
  /** 正在自己这一动里出招的单位（开大、阿哈时刻里的欢愉技不算这一动）。逐动改目标靠它。 */
  private acting: Unit | null = null;
  /** 第几动选中了哪位队友：键是「站位:动数」。 */
  private readonly actionTargets = new Map<string, number>();
  private readonly extraUnsupported: UnsupportedMechanic[] = [];
  /**
   * 正在结算的动作，拉条溢出挂在它上面。开大、阿哈时刻直接给出事件；自己这一动给出起点，取这之后自己的第一个出招。
   * 开大里插了额外回合时，回来再结算的拉条仍算这次开大的（真珠 E2 拉队友在额外回合之后）。
   */
  private readonly causes: { event: AxisEvent | null; start: number; unit: Unit | null }[] = [];
  private readonly onceKeys = new Set<string>();

  constructor(config: AxisConfig) {
    const count = Array.isArray(config.units) ? config.units.length : 0;
    if (count === 0) throw new Error("参数 team 需要是 1~4 个成员的列表");
    if (count > MAX_TEAM) throw new Error(`参数 team 最多 ${MAX_TEAM} 人，收到 ${count}`);
    if (!(config.maxAV >= 1 && config.maxAV <= MAX_AV)) {
      throw new Error(`参数 maxAV 需要在 1~${MAX_AV} 之间，收到 ${config.maxAV}`);
    }
    const seen = new Set<string>();
    for (const spec of config.units) {
      if (seen.has(spec.id)) throw new Error(`队伍中不能重复选择角色：${spec.name}。`);
      seen.add(spec.id);
      if (!(spec.baseSpd > 0)) throw new Error(`${spec.name} 的基础速度需要大于 0，收到 ${spec.baseSpd}`);
    }
    this.maxAV = config.maxAV;
    this.enemyCount = config.enemyCount ?? 1;
    this.maxTimeline = config.maxTimeline ?? DEFAULT_MAX_TIMELINE;
    this.cycle = config.cycle ?? MOC_CYCLE;
    this.useTechnique = config.useTechnique ?? true;
    this.scopeNote = config.scopeNote ?? "只模拟我方行动，不模拟敌方行动、受击、消灭和击破。";
    this.units = config.units.map((spec, slot) => new Unit(slot, spec));
    const lead = config.leadSlot ?? null;
    if (lead !== null && !(Number.isInteger(lead) && lead >= 0 && lead < count)) throw new Error(`进场角色的站位不对：需要在 0~${count - 1} 之间，收到 ${lead}`);
    this.leadSlot = lead;
    const order = config.ultOrder ?? [];
    for (const slot of order) {
      if (!(Number.isInteger(slot) && slot >= 0 && slot < count)) throw new Error(`开大顺序里的站位不对：需要在 0~${count - 1} 之间，收到 ${slot}`);
    }
    const first = [...new Set(order)].map((slot) => this.units[slot]);
    this.ultQueue = [...first, ...this.units.filter((unit) => !first.includes(unit))];
    for (const unit of this.units) {
      for (const point of unit.ultAfter) {
        if (!(Number.isInteger(point.slot) && point.slot >= 0 && point.slot < count && Number.isInteger(point.action) && point.action >= 1)) {
          throw new Error(`${unit.name} 的开大点不对：需要是队伍里某人的第 1 动及以后，收到站位 ${point.slot} 第 ${point.action} 动`);
        }
      }
    }
    for (const unit of this.units) unit.speedOf = (target) => this.computeSpeed(target);
    for (const module of config.modules ?? []) this.installModule(module);
    for (const unit of this.units) unit.kit?.install?.(this, unit);
    for (const module of config.lateModules ?? []) this.installModule(module);
  }

  private installModule(module: BattleModule): void {
    this.modules.set(module.id, module);
    module.install(this);
  }

  /** 取已安装的模块（角色 kit 用，比如战技点系统的抵扣与记账接口）。 */
  findModule<T extends BattleModule>(id: string): T | undefined {
    return this.modules.get(id) as T | undefined;
  }

  // ----------------------------- 钩子 ----------------------------- //

  /**
   * 注册钩子。priority 越小越先结算，相同时按注册顺序。
   * 结算顺序会影响回能和插大的时点，所以不依赖角色站位，由机制自己声明。
   */
  on<K extends keyof AxisEvents>(name: K, handler: Handler<K>, priority = 100): void {
    const list = this.handlers.get(name) ?? [];
    const entry: Entry = { priority, handler: handler as Entry["handler"] };
    const index = list.findIndex((item) => item.priority > priority);
    if (index < 0) list.push(entry);
    else list.splice(index, 0, entry);
    this.handlers.set(name, list);
  }

  /** 发事件。模块（如战技点）也需要发自己的事件，所以这里是公开的。 */
  emit<K extends keyof AxisEvents>(name: K, payload: AxisEvents[K]): void {
    for (const entry of this.handlers.get(name) ?? []) (entry.handler as Handler<K>)(payload);
  }

  addSpeedModifier(modifier: (unit: Unit) => { pct?: number; flat?: number }): void {
    this.speedModifiers.push(modifier);
  }

  /** 时间轴每条记录的 res 里附带哪些资源。 */
  addResourceView(view: (unit: Unit | null) => Record<string, unknown>): void {
    this.resourceViews.push(view);
  }

  module<T extends BattleModule>(id: string): T | undefined {
    return this.modules.get(id) as T | undefined;
  }

  /** 这场战斗里第一次问这个 key 时返回 true（「同类效果无法叠加」）。 */
  onceInBattle(key: string): boolean {
    if (this.onceKeys.has(key)) return false;
    this.onceKeys.add(key);
    return true;
  }

  /** 角色模块以外的「未计入」条目（比如装备效果）。 */
  addUnsupported(unit: Unit, mechanic: string): void {
    this.extraUnsupported.push({ unit: unit.name, mechanic });
  }

  setMemosprite(unit: Unit, present: boolean): void {
    if (unit.memosprite === present) return;
    unit.memosprite = present;
    this.emit("memosprite", { unit, present });
  }

  // ----------------------------- 查询 ----------------------------- //

  unit(id: string): Unit {
    const found = this.findUnit(id);
    if (!found) throw new Error(`队伍里没有角色 ${id}`);
    return found;
  }

  findUnit(id: string): Unit | undefined {
    return this.units.find((unit) => unit.id === id);
  }

  kitOf<T extends CharacterKit>(id: string): T | undefined {
    return this.findUnit(id)?.kit as T | undefined;
  }

  unitAt(slot: number | null): Unit | undefined {
    return slot === null ? undefined : this.units.find((unit) => unit.slot === slot);
  }

  /** 指定目标：优先用户选的站位（不能是自己），否则用默认站位，是自己就顺延。 */
  resolveTarget(caster: Unit | undefined, prefer: number | null = null): number {
    const n = this.units.length;
    // 逐动改目标：只管这一动自己的普攻、战技；同一动后面开大、阿哈时刻插进来的欢愉技仍按平时的目标。
    const scripted = caster && this.acting === caster && !caster.castingUltimate ? caster.targetScript[caster.actions - 1] : undefined;
    if (caster && scripted !== undefined && scripted !== null && scripted >= 0 && scripted < n && scripted !== caster.slot) return scripted;
    if (caster && caster.targetSlot !== null) {
      const requested = caster.targetSlot;
      if (requested >= 0 && requested < n && requested !== caster.slot) return requested;
    }
    const candidate = prefer ?? 0;
    if (candidate >= 0 && candidate < n && (!caster || candidate !== caster.slot)) return candidate;
    if (caster) return this.units.find((unit) => unit.slot !== caster.slot)?.slot ?? caster.slot;
    return 0;
  }

  // ----------------------------- 速度 ----------------------------- //

  /** 基础白值与光锥白值吃百分比；行迹与其他固定速度在乘区之外。 */
  private computeSpeed(unit: Unit): number {
    let pct = unit.pctSpd;
    let flat = unit.flatSpd;
    for (const buff of unit.buffs) {
      if (buff.kind === "pct") pct += buff.value;
      else if (buff.kind === "flat") flat += buff.value;
    }
    for (const modifier of this.speedModifiers) {
      const extra = modifier(unit);
      pct += extra.pct ?? 0;
      flat += extra.flat ?? 0;
    }
    const speed = (unit.baseSpd + unit.lcBaseSpd) * (1 + pct / 100) + flat + unit.traceSpd;
    return speed > 0 ? speed : 0.0001;
  }

  /** 同名增益刷新数值和回合数，不叠加。变速不动距离，已跑的进度自然保留。 */
  addSpeedBuff(unit: Unit, buff: SpeedBuff): void {
    const existing = unit.buffs.find((item) => item.label === buff.label);
    if (existing) Object.assign(existing, buff, { armed: false });
    else unit.buffs.push({ ...buff, armed: false });
  }

  // ----------------------------- 行动条 ----------------------------- //

  /**
   * 拉条。打在正在行动的单位上时，自身来源挂起到回合结束后再扣，
   * 外部来源不生效（舞！舞！舞！原文如此）。
   * 【阿哈时刻】的额外回合是「在回合中但距离大于 0」，这时照常立即扣减。
   * source：给别的队友拉条时传施放者，用来判断施放者是不是被禁止给队友拉条（【特邀嘉宾】）。
   * 给自己的召唤物拉条不传。
   * 剩余距离不够扣时行动条到 0 为止，多出来的部分作废，记进 overflows（100% 及以上本来就是「立即行动」，不记）。
   */
  advance(actor: Actor, pct: number, options: { selfSource?: boolean; source?: Unit } = {}): void {
    if (pct <= 0) return;
    const source = options.source;
    if (source && actor !== source && source.allyAdvanceBlock) {
      this.record("note", source, "无法给其他队友拉条", { details: [`${source.name} 持有${source.allyAdvanceBlock}：${actor.name} 的行动提前 ${fmt(pct, 0)}% 不生效`] });
      return;
    }
    if (actor.inTurn && actor.remDist <= 0) {
      if (options.selfSource) actor.pendingAdvance += pct;
      return;
    }
    const before = actor.remDist;
    const dist = (DIST_BASE * pct) / 100;
    actor.remDist = Math.max(0, before - dist);
    if (pct < 100) this.noteOverflow(actor, pct, before);
  }

  /**
   * 记一次拉条溢出：拉之前还剩 before 距离，拉 pct% 超出的部分作废。不进时间轴（旧格式和冻结基准不变），
   * 挂在正在结算的那个动作上（见 causes，没有就是最后一条事件）；页面据此在卡片上挂角标。
   * 2026-11-06 群里反馈：开了阿哈行迹3 开局提前，阿哈时刻反而少一次，就是开大拉条溢出。
   */
  noteOverflow(actor: Actor, pct: number, before: number): void {
    const wasted = (DIST_BASE * pct) / 100 - before;
    const speed = actor.speed();
    // 不到 1 点距离（万分之一条）是浮点误差或刚好拉满，不算。
    if (wasted < 1 || speed <= 0) return;
    this.overflows.push({
      av: this.av,
      after: this.causeEvent(),
      target: actor.name,
      pct,
      leftAv: before / speed,
      wastedAv: wasted / speed,
    });
  }

  /** 技能选中了另一名我方角色（选自己或没有目标不算）。只在技能真正施放时调用一次。 */
  targetAlly(caster: Unit, target: Unit | null | undefined, ability: string): void {
    if (!target || target === caster) return;
    if (this.acting === caster && !caster.castingUltimate) this.actionTargets.set(`${caster.slot}:${caster.actions}`, target.slot);
    this.emit("allyTargeted", { caster, target, ability });
  }

  /** 助战技发动了一次（姬子•启行的模块调用）。 */
  assisted(owner: Unit, user: Unit, free: boolean): void {
    this.emit("assist", { owner, user, free });
  }

  /**
   * 全队拉条。施放者正在自己回合里（自己行动完满能开大）时，自己那口按自身来源挂起，回合结束后再扣，和风套一样；
   * 别的正在行动的队友照常不吃（攻略 BV1fH4y1j74t：已经在行动回合内的不再有变化）。
   * 以前这里直接跳过施放者，花火带舞！舞！舞！自己行动完开大就少拉一口（攻略 BV1sW421P7t8：风翁 158 速四轮八动，再带舞舞舞 159 速九动）。
   */
  advanceAllies(source: Unit, pct: number): void {
    for (const unit of this.units) {
      this.advance(unit, pct, { selfSource: unit === source, source });
    }
  }

  /** 行动延后：增加剩余距离。打在正在行动的单位上的时序待实测，这里算进回合结束后的距离。 */
  delay(actor: Actor, pct: number): void {
    if (pct <= 0) return;
    if (actor.inTurn && actor.remDist <= 0) actor.pendingAdvance -= pct;
    else actor.remDist += (DIST_BASE * pct) / 100;
  }

  addActor(spec: SummonSpec): SummonActor {
    const actor: SummonActor = {
      name: spec.name,
      remDist: spec.remDist ?? DIST_BASE,
      pendingAdvance: 0,
      inTurn: false,
      paused: false,
      selfManaged: spec.selfManaged ?? false,
      role: spec.role ?? "summon",
      speed: spec.speed,
      onTurn: spec.onTurn,
    };
    this.summons.push(actor);
    return actor;
  }

  removeActor(actor: SummonActor): void {
    const index = this.summons.indexOf(actor);
    if (index >= 0) this.summons.splice(index, 1);
  }

  /** 同 AV 时按入队顺序：角色按站位在前，其他单位在后。 */
  private nextActor(): { actor: Actor; av: number } | null {
    let best: { actor: Actor; av: number } | null = null;
    for (const actor of [...this.units, ...this.summons]) {
      if (actor.paused) continue;
      const av = this.av + actor.remDist / actor.speed();
      if (best === null || av < best.av) best = { actor, av };
    }
    return best;
  }

  private advanceTime(av: number): void {
    const dt = av - this.av;
    if (dt > 0) {
      for (const actor of [...this.units, ...this.summons]) {
        if (actor.paused) continue;
        actor.remDist = Math.max(0, actor.remDist - dt * actor.speed());
      }
    }
    this.av = av;
  }

  // ----------------------------- 回能与终结技 ----------------------------- //

  gainEnergy(unit: Unit, amount: number, options: { fixed?: boolean; reason?: string; fromHaohuo?: boolean } = {}): void {
    if (amount === 0) return;
    const gainOptions = { amount, fixed: options.fixed ?? false, reason: options.reason ?? "", fromHaohuo: options.fromHaohuo ?? false };
    if (unit.kit?.gainEnergy) {
      unit.kit.gainEnergy({ engine: this, self: unit }, gainOptions);
      return;
    }
    const scaled = unit.energyType === "standard" && !gainOptions.fixed;
    const requested = scaled ? amount * (1 + unit.totalErr() / 100) : amount;
    const before = unit.energy;
    unit.energy = Math.min(unit.energyCap, unit.energy + requested);
    const gain = unit.energy - before;
    unit.energyTotal += gain;
    this.emit("energyGain", { unit, gain, requested, reason: gainOptions.reason });
    this.maybeUltimate(unit);
  }

  /**
   * 能开就开。开局结算、额外回合和资源连锁期间不插大，等它们结束后再统一检查。
   * 留大的角色只在到了开大点（holdPending）之后开，一个点只开一次。
   */
  maybeUltimate(unit: Unit): void {
    if (this.depth > MAX_NEST || this.extraDepth > 0 || this.ultimateHolds > 0 || this.opening || unit.castingUltimate) return;
    const context = { engine: this, self: unit };
    for (let guard = 0; guard < 4 && unit.energy >= unit.ultCost - EPS; guard += 1) {
      if (unit.ultMode === "hold" && !unit.holdPending) return;
      if (unit.kit?.canUltimate && !unit.kit.canUltimate(context)) return;
      unit.holdPending = false;
      this.castUltimate(unit);
    }
  }

  /** 全队检查一次能不能开大，按开大顺序。 */
  sweepUltimates(except?: Unit): void {
    for (const unit of this.ultQueue) if (unit !== except) this.maybeUltimate(unit);
  }

  /** 进场角色：用了秘技且指定了时才有。真珠、刻律德菈的秘技效果转到他身上。 */
  techniqueHolder(): Unit | undefined {
    return this.useTechnique ? this.unitAt(this.leadSlot) : undefined;
  }

  /** 留大：actor 刚做完一动，到了谁的开大点就让谁开；能量不够先记下，攒够再开。 */
  private reachUltPoints(actor: Unit): void {
    for (const unit of this.ultQueue) {
      if (unit.ultMode !== "hold" || !unit.ultAfter.some((point) => point.slot === actor.slot && point.action === actor.actions)) continue;
      const where = `${actor === unit ? "自己" : actor.name}的第 ${actor.actions} 动后`;
      if (unit.holdPending) this.record("note", unit, "留大：到了开大点", { details: [`${where}，上一个开大点的大还没放出来，合并成一次`] });
      unit.holdPending = true;
      if (unit.energy < unit.ultCost - EPS) {
        this.record("note", unit, "留大：到了开大点", { details: [`${where}，${unit.energyName} ${fmt(unit.energy, 0)}/${fmt(unit.ultCost, 0)} 不够，攒够了就开`] });
        continue;
      }
      this.maybeUltimate(unit);
    }
  }

  /** 这段结算期间不插大（一次回能连锁还没算完时，不能中途开大）。 */
  holdUltimates(work: () => void): void {
    this.ultimateHolds += 1;
    try {
      work();
    } finally {
      this.ultimateHolds -= 1;
    }
  }

  /** 拉条溢出该挂在哪条事件上。 */
  private causeEvent(): AxisEvent | null {
    const top = this.causes[this.causes.length - 1];
    if (top?.event) return top.event;
    if (top?.unit) {
      const own = this.timeline.slice(top.start).find((event) => event.kind === "unit" && event.slot === top.unit?.slot && CAST_TYPES.includes(event.type));
      if (own) return own;
    }
    return this.timeline[this.timeline.length - 1] ?? null;
  }

  /** 在 work 里发生的拉条溢出挂到 event 上（刚记下的那条事件，默认时间轴最后一条）。 */
  withCause(work: () => void, event: AxisEvent | null = this.timeline[this.timeline.length - 1] ?? null): void {
    this.causes.push({ event, start: this.timeline.length, unit: null });
    try {
      work();
    } finally {
      this.causes.pop();
    }
  }

  /** 先扣资源再结算效果：嵌套事件里如果资源还没扣，会被满能量再触发一次。 */
  castUltimate(unit: Unit): void {
    if (this.depth > MAX_NEST) {
      this.warnings.push("嵌套层数超过上限，跳过一次终结技结算");
      return;
    }
    this.depth += 1;
    unit.castingUltimate = true;
    const context = { engine: this, self: unit };
    try {
      let payment;
      if (unit.kit?.payUltimate) payment = unit.kit.payUltimate(context);
      else unit.energy = Math.max(0, unit.energy - unit.ultCost);
      unit.ultimates += 1;
      this.record("ultimate", unit, `${unit.name} 的终结技`, {
        details: payment?.details,
        resources: payment?.resources,
      });
      this.withCause(() => {
        unit.kit?.onUltimate?.(context);
        this.emit("ultimate", { unit });
        if (unit.ultimateAttacks) this.attack(unit, "ultimate");
        if (unit.energyType === "standard") {
          this.gainEnergy(unit, unit.energyGains.ultimate, { reason: "终结技返还" });
        }
      });
    } finally {
      unit.castingUltimate = false;
      this.depth -= 1;
    }
  }

  // ----------------------------- 回合 ----------------------------- //

  private act(unit: Unit, extra: boolean): void {
    if (unit.skipAction) {
      // 这一动已经用掉了（比如非开拓同行用了助战技）：不出招、不占逐动覆盖的序号，照常算「行动后」。
      this.record("note", unit, "这一动用掉了", { details: [unit.skipAction], extra });
      unit.skipAction = null;
      this.emit("actionDone", { unit, casts: [], extra });
      return;
    }
    let kind = unit.script[unit.actions] ?? unit.rotation;
    unit.actions += 1;
    // 出招改写：模块可以拦下这一动（战技点不足时不能放战技）。
    for (const module of this.modules.values()) {
      const next = module.beforeAct?.({ engine: this, unit, kind });
      if (next && next !== kind) kind = next;
    }
    const context = { engine: this, self: unit, kind, extra };
    const outerCasts = this.casts;
    const casts: string[] = [];
    this.casts = casts;
    this.emit("skillStart", { unit, kind, extra });
    const outerActing = this.acting;
    this.acting = unit;
    this.causes.push({ event: null, start: this.timeline.length, unit });
    try {
      if (unit.kit?.act) unit.kit.act(context);
      else this.defaultAct(unit, kind, extra);
      unit.kit?.afterAct?.(context);
    } finally {
      this.causes.pop();
      this.acting = outerActing;
    }
    this.casts = outerCasts;
    this.emit("actionDone", { unit, casts, extra });
    // 手动开大：指定的那一动放不了（比如死龙还在场）就顺延到下一动，不悄悄丢掉。
    if (unit.manualUltimates.includes(unit.actions)) unit.manualPending += 1;
    if (unit.manualPending > 0 && unit.kit?.canUltimate?.(context) !== false) {
      unit.manualPending -= 1;
      this.castUltimate(unit);
    }
    this.reachUltPoints(unit);
  }

  defaultAct(unit: Unit, kind: ActionKind, extra = false): void {
    const gain = unit.energyGains[kind];
    this.record(kind, unit, `${unit.name} 的${ACTION_NAMES[kind]}`, {
      details: [kind === "basic" ? `基础回能 ${fmt(gain, 0)}（普攻）` : `基础回能 ${fmt(gain, 0)} × (1+ERR)`],
      extra,
    });
    this.gainEnergy(unit, gain, { reason: ACTION_NAMES[kind] });
    this.attack(unit, kind, extra);
  }

  /** 一次攻击事件。追击、欢愉技和攻击型终结技也走这里，天赋的触发面由各角色自己判断。 */
  attack(unit: Unit, kind: string, extra = false): void {
    this.emit("attack", { unit, kind, extra });
  }

  /** 一个普通回合。到达时距离可能残留浮点误差，这里归零，否则回合内的自身拉条会被吞掉。 */
  takeTurn(unit: Unit): void {
    this.depth += 1;
    try {
      unit.inTurn = true;
      unit.remDist = 0;
      unit.turns += 1;
      for (const buff of unit.buffs) buff.armed = true;
      const context = { engine: this, self: unit };
      unit.kit?.onTurnStart?.(context);
      this.emit("turnStart", { unit });
      this.act(unit, false);
      let buffsExpired = false;
      unit.buffs = unit.buffs.filter((buff) => {
        if (buff.turns === null || !buff.armed) return true;
        buff.turns -= 1;
        if (buff.turns > 0) return true;
        if (buff.kind !== "err") buffsExpired = true;
        return false;
      });
      this.emit("turnEnd", { unit, buffsExpired });
      unit.kit?.onTurnEnd?.(context);
      this.resetDistance(unit);
    } finally {
      unit.inTurn = false;
      this.depth -= 1;
    }
  }

  private summonTurn(actor: SummonActor): void {
    if (actor.selfManaged) {
      actor.onTurn(actor);
      return;
    }
    actor.inTurn = true;
    actor.remDist = 0;
    actor.onTurn(actor);
    actor.inTurn = false;
    this.resetDistance(actor);
    this.emit("summonTurn", { actor });
  }

  private resetDistance(actor: Actor): void {
    // 回合内挂起的自身拉条加起来超过 100%：多出的照样作废。
    if (actor.pendingAdvance > 0) this.noteOverflow(actor, actor.pendingAdvance, DIST_BASE);
    actor.remDist = Math.max(0, DIST_BASE - (DIST_BASE * actor.pendingAdvance) / 100);
    actor.pendingAdvance = 0;
  }

  /**
   * 额外回合：不重置行动条、不递减增益；期间不插大，结束后全队检查一次。
   * before / after 是这次额外回合自带的结算，比如真珠给的好活当赏和笑点。
   */
  extraTurn(unit: Unit, label: string, options: { details?: string[]; before?: () => void; after?: () => void } = {}): void {
    if (this.depth > MAX_NEST) return;
    this.depth += 1;
    this.extraDepth += 1;
    try {
      unit.extraTurns += 1;
      this.record("extra_turn", unit, label, {
        details: ["不重置行动条距离、不递减常规 Buff 回合数", ...(options.details ?? [])],
        extra: true,
      });
      options.before?.();
      this.act(unit, true);
      options.after?.();
    } finally {
      this.extraDepth -= 1;
      this.depth -= 1;
    }
    this.sweepUltimates();
  }

  /** 额外的【阿哈时刻】这类结算同样不允许中途插大。 */
  inExtraWindow(work: () => void): void {
    this.extraDepth += 1;
    try {
      work();
    } finally {
      this.extraDepth -= 1;
    }
  }

  // ----------------------------- 时间轴 ----------------------------- //

  cycleOf(av: number): number {
    const { firstCycleAV, cycleAV } = this.cycle;
    if (av <= firstCycleAV + EPS) return 0;
    return Math.ceil((av - firstCycleAV) / cycleAV - EPS);
  }

  record(type: string, unit: Unit | null, label: string, options: RecordOptions = {}): void {
    const isCast = CAST_TYPES.includes(type) && (options.kind ?? "unit") === "unit";
    if (isCast) this.casts.push(type);
    if (this.timeline.length >= this.maxTimeline) {
      this.truncated = true;
      return;
    }
    const res: Record<string, unknown> = { energy: unit ? unit.energy : null };
    for (const view of this.resourceViews) Object.assign(res, view(unit));
    Object.assign(res, options.resources);
    const event: AxisEvent = {
      av: this.av,
      t: this.cycleOf(this.av),
      kind: options.kind ?? "unit",
      slot: unit ? unit.slot : null,
      name: options.name ?? unit?.name ?? "",
      type,
      extra: options.extra ?? false,
      label,
      details: [...(options.details ?? [])],
      res,
    };
    this.timeline.push(event);
    if (isCast && unit) this.actionOf.set(event, unit.actions);
  }

  /** 某站位第几动的技能选中了哪位队友的站位；这一动没选队友是 undefined。逐动改目标用它。 */
  actionTargetOf(slot: number, action: number): number | undefined {
    return this.actionTargets.get(`${slot}:${action}`);
  }

  /** 这条时间轴记录是持有者的第几动（从 1 数），不是施放记录时没有。逐动覆盖用它定位。 */
  actionIndexOf(event: AxisEvent): number | undefined {
    return this.actionOf.get(event);
  }

  // ----------------------------- 主循环 ----------------------------- //

  battleStart(): void {
    this.opening = true;
    this.record("battle", null, "进入战斗", {
      details: [`模拟窗口 [0, ${fmt(this.maxAV, 0)}] AV`],
      kind: "system",
      name: "战斗",
    });
    this.notes.push(this.scopeNote);
    this.emit("battleStart", {});
    const each = (hook: keyof Pick<CharacterKit, "onEntry" | "onTechnique" | "onTechniqueDone" | "onBattleStart" | "onOpeningEnd">) => {
      for (const unit of this.units) unit.kit?.[hook]?.({ engine: this, self: unit });
    };
    each("onEntry");
    if (this.useTechnique) {
      each("onTechnique");
      each("onTechniqueDone");
    }
    for (const unit of this.units) {
      unit.kit?.onBattleStart?.({ engine: this, self: unit });
      this.emit("battleTraits", { unit });
    }
    for (const unit of this.units) unit.initialSpeed = unit.speed();
    this.emit("speedSnapshot", {});
    for (const unit of this.units) {
      this.emit("openingAdvance", { unit });
      this.advance(unit, unit.initAdv);
    }
    each("onOpeningEnd");
    this.opening = false;
    this.sweepUltimates();
  }

  run(): AxisResult {
    this.battleStart();
    let loops = 0;
    for (; loops < MAX_LOOP; loops += 1) {
      const next = this.nextActor();
      if (next === null || next.av > this.maxAV + EPS) break;
      this.advanceTime(next.av);
      if (next.actor instanceof Unit) this.takeTurn(next.actor);
      else this.summonTurn(next.actor as SummonActor);
      this.emit("stepDone", {});
    }
    if (loops >= MAX_LOOP) this.truncated = true;
    return this.buildResult();
  }

  private buildResult(): AxisResult {
    const unsupported: UnsupportedMechanic[] = [
      ...this.units.flatMap((unit) => (unit.kit?.enemyDependent ?? []).map((mechanic) => ({ unit: unit.name, mechanic }))),
      ...this.extraUnsupported,
    ];
    const warnings = [...this.warnings];
    if (this.truncated) warnings.push("事件数量超过上限，结果已截断。");
    for (const unit of this.units) {
      if (unit.kit?.dataNotice) warnings.push(`${unit.name}：${unit.kit.dataNotice}`);
    }
    if (unsupported.length > 0) {
      const items = unsupported.map((item) => `${item.unit}：${item.mechanic}`).join("；");
      warnings.push(`未计入（这一版不模拟敌方和概率效果）：${items}`);
    }
    const damage = this.module<DamageLedger>("damage")?.report();
    return {
      ...(damage ? { damage } : {}),
      maxAV: this.maxAV,
      timeline: this.timeline,
      units: this.units.map((unit) => ({
        id: unit.id,
        name: unit.name,
        slot: unit.slot,
        speed: unit.speed(),
        energy: unit.energy,
        actions: unit.actions,
        turns: unit.turns,
        ultimates: unit.ultimates,
        extraTurns: unit.extraTurns,
      })),
      warnings,
      notes: this.notes,
      unsupported,
      truncated: this.truncated,
    };
  }
}
