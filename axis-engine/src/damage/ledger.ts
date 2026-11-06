/** 伤害账本：记下每次攻击，按当时的状态交给伤害模型算。不改时间轴，不开就完全不参与战斗。 */
import type { AxisEngine } from "../engine.ts";
import type { BattleModule } from "../types.ts";
import type { Unit } from "../unit.ts";
import type { DamageHit, DamageOptions, DamageReport, DamageRow, ZoneBuff } from "./types.ts";

/** 先于其他监听：天赋、追击都是这一下打出去之后才发生的，不能算进这一下。 */
const BEFORE_REACTIONS = -1000;

export class DamageLedger implements BattleModule {
  readonly id = "damage";
  private engine!: AxisEngine;
  private readonly rows: DamageRow[] = [];
  private buffs: (ZoneBuff & { armed: boolean })[] = [];
  /** 每个站位最后一次已经记过的终结技（第几次开大）。 */
  private readonly ultimatesSeen = new Map<number, number>();
  private readonly options: DamageOptions;

  constructor(options: DamageOptions = {}) {
    this.options = options;
  }

  install(engine: AxisEngine): void {
    this.engine = engine;
    engine.on("attack", ({ unit, kind, extra }) => {
      if (kind === "ultimate") this.ultimatesSeen.set(unit.slot, unit.ultimates);
      this.recordHit(unit, kind, extra, "attack");
    }, BEFORE_REACTIONS);
    // 有些终结技不算攻击事件（不触发别人的天赋），但照样可能打伤害：也记一行，有没有伤害看资料。
    engine.on("ultimate", ({ unit }) => {
      if (unit.ultimateAttacks || this.ultimatesSeen.get(unit.slot) === unit.ultimates) return;
      this.recordHit(unit, "ultimate", false, "ultimate");
    }, BEFORE_REACTIONS);
    // 和速度增益同一条规则：回合开始时已存在的才减，额外回合不减。
    engine.on("turnStart", ({ unit }) => {
      for (const buff of this.buffs) if (buff.clock === unit.slot) buff.armed = true;
    });
    engine.on("turnEnd", ({ unit }) => this.tick(unit.slot));
  }

  /** 同 id 的加成重新上一次时覆盖旧的，持续时间重算。 */
  addBuff(buff: ZoneBuff): void {
    this.removeBuff(buff.id);
    this.buffs.push({ ...buff, armed: false });
  }

  removeBuff(id: string): void {
    this.buffs = this.buffs.filter((buff) => buff.id !== id);
  }

  /** 这一刻对这个站位生效的加成：自己的、全队的、敌人身上的。 */
  buffsFor(slot: number): ZoneBuff[] {
    return this.buffs.filter((buff) => buff.holder === slot || buff.holder === "team" || buff.holder === "enemy");
  }

  private tick(slot: number): void {
    this.buffs = this.buffs.filter((buff) => {
      if (buff.clock !== slot || !buff.armed || buff.turns === null) return true;
      buff.turns -= 1;
      return buff.turns > 0;
    });
  }

  /** 这一下对应的时间轴记录：往回找同一个人的同种记录，找不到就用他最近的一条。 */
  private eventOf(unit: Unit, kind: string): number | null {
    const { timeline, truncated } = this.engine;
    if (truncated) return null;
    let nearest: number | null = null;
    for (let index = timeline.length - 1; index >= 0; index -= 1) {
      const event = timeline[index];
      if (event.slot !== unit.slot) continue;
      if (event.type === kind) return index;
      nearest ??= index;
      if (event.av < this.engine.av) break;
    }
    return nearest;
  }

  /** 记一次伤害。持续伤害、击破、附加伤害这类没有攻击事件的，由发生它的模块自己调，kind 写资料里的键。 */
  recordHit(unit: Unit, kind: string, extra = false, source: DamageHit["source"] = "other"): void {
    const hit: DamageHit = {
      index: this.rows.length,
      av: this.engine.av,
      slot: unit.slot,
      unitId: unit.id,
      unitName: unit.name,
      kind,
      extra,
      source,
      event: this.eventOf(unit, kind),
      enemyCount: this.engine.enemyCount,
      eidolon: unit.eidolon,
    };
    const { model, enemy, stats } = this.options;
    const outcome = model?.evaluate(hit, { attacker: stats?.[unit.id] ?? null, enemy: enemy ?? null, buffs: this.buffsFor(unit.slot) }) ?? null;
    this.rows.push({ ...hit, outcome });
  }

  report(): DamageReport {
    const counted = this.rows.filter((row) => row.outcome);
    const byUnit = this.engine.units.map((unit) => {
      const rows = this.rows.filter((row) => row.slot === unit.slot);
      return {
        slot: unit.slot,
        unitId: unit.id,
        unitName: unit.name,
        hits: rows.length,
        total: rows.reduce((sum, row) => sum + (row.outcome?.expected ?? 0), 0),
      };
    });
    const missing = new Map<string, DamageReport["missing"][number]>();
    if (this.options.model) {
      for (const row of this.rows.filter((item) => !item.outcome)) {
        const key = `${row.unitId}/${row.kind}`;
        const item = missing.get(key) ?? { unitId: row.unitId, unitName: row.unitName, kind: row.kind, count: 0 };
        item.count += 1;
        missing.set(key, item);
      }
    }
    return {
      rows: this.rows,
      total: counted.length ? counted.reduce((sum, row) => sum + row.outcome!.expected, 0) : null,
      byUnit,
      missing: [...missing.values()],
    };
  }
}
