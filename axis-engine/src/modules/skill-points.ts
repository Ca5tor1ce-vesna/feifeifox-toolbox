/**
 * 战技点（全队共享）：上限 5，战斗开始时 3；普攻 +1、战技 -1、终结技 0 消耗。
 * 战技点不足时不能放战技：这一动改成普攻，并在时间轴上留一条说明。
 *
 * 只在 `useSkillPoints` 打开时安装，默认不安装，别的机制一点不受影响。
 *
 * 已确认的例外（4.6.54 版本资料 + 用户确认）：
 * - 强化普攻**一律不回复战技点**。
 * - 丹恒•饮月：一次「龙力自在」强化 3 层，扣 3 点。
 * - Archer「伪•螺旋剑」：每次 −2 点。
 * - 青雀：额外能力【争番】施放战技时恢复 1 点，每场只触发 1 次。
 * - Archer / 远坂凛：在场时战技点上限各 +2（两人同队上限 9）。
 * - 【云无留迹的过客】4 件套：战斗开始时 +1（开局 4）。
 *
 * 对外接口（角色 kit 用）：
 * - `registerBuffer` 注册抵扣池（火花【爆点】）：扣点时先扣池子，不够再扣全队 SP。
 * - `spend / restore / drainTo` 记账并发出 `spChanged`，供「目标消耗或恢复战技点时」的机制挂钩。
 *
 * 还没接的战技点机制全部登记在 `registerUnsupported`（一处集中），不开系统时不登记。
 */
import type { AxisEngine } from "../engine.ts";
import { fmt } from "../format.ts";
import type { ActionKind, BattleModule } from "../types.ts";
import type { Unit } from "../unit.ts";

export const SKILL_POINT_MAX = 5;
export const SKILL_POINT_INITIAL = 3;

/** 单次「战技」消耗：默认 1，个别角色覆盖。 */
const SKILL_COST: Record<string, number> = {
  /** 丹恒•饮月：一次「龙力自在」强化 3 层。 */
  "1213": 3,
  /** Archer「伪•螺旋剑」。 */
  "1015": 2,
};
/** 在场就提高战技点上限的角色：Archer 额外能力 1、远坂凛额外能力 1，各 +2。 */
const CAP_BONUS: [string, number][] = [["1015", 2], ["1508", 2]];
/** 青雀：额外能力【争番】施放战技时恢复 1 点，每场 1 次。 */
const QINGQUE_ID = "1201";

/** 抵扣池：扣战技点时先从这里拿。`available()` 是不动状态地看还有多少点。 */
export interface SkillPointBuffer {
  available(): number;
  take(amount: number): number;
}

export class SkillPoints implements BattleModule {
  readonly id = "skill-points";
  /** 当前战技点，0~上限。 */
  sp = SKILL_POINT_INITIAL;
  /** 青雀的【争番】是否已经用过。 */
  private zhengfanUsed = false;
  private readonly buffers = new Map<Unit, SkillPointBuffer>();
  private engine!: AxisEngine;

  install(engine: AxisEngine): void {
    this.engine = engine;
    // 开局值：基础 3；【云无留迹的过客】4 件套战斗开始时恢复 1 个战技点。
    this.sp = SKILL_POINT_INITIAL + (this.hasRelic("101") ? 1 : 0);
    engine.addResourceView(() => ({ sp: this.sp }));
    engine.on("actionDone", ({ unit, casts }) => this.settle(unit, casts));
    this.registerUnsupported();
  }

  /** 队里有没有人带某套遗器（这里只用到 4 件套的效果）。 */
  private hasRelic(id: string): boolean {
    return this.engine.units.some((unit) => (unit.gear?.relics ?? []).some((relic) => relic.id === id && relic.pieces >= 4));
  }

  /** 战技点上限：基础 5 加上在场角色的加成（Archer / 远坂凛 各 +2）。 */
  get cap(): number {
    let cap = SKILL_POINT_MAX;
    for (const unit of this.engine.units) {
      for (const [id, bonus] of CAP_BONUS) if (unit.id === id) cap += bonus;
    }
    return cap;
  }

  /** 注册抵扣池（火花【爆点】）。 */
  registerBuffer(unit: Unit, buffer: SkillPointBuffer): void {
    this.buffers.set(unit, buffer);
  }

  /** 消耗战技点：先走抵扣池，不够再扣全队。`reason` 会出现在提示里。 */
  spend(unit: Unit, points: number, reason: string): void {
    if (points <= 0) return;
    const fromBuffer = this.buffers.get(unit)?.take(points) ?? 0;
    if (fromBuffer > 0) {
      this.engine.emit("spChanged", { unit, amount: -fromBuffer, reason: `【抵扣池】${reason}`, spend: true, restore: false });
    }
    const rest = points - fromBuffer;
    if (rest > 0) {
      const before = this.sp;
      this.sp = Math.max(0, this.sp - rest);
      this.note(unit, `-${rest} → 战技点 ${fmt(before, 0)} → ${fmt(this.sp, 0)}（上限 ${this.cap}）`, reason);
      this.engine.emit("spChanged", { unit, amount: -rest, reason, spend: true, restore: false });
    }
  }

  /** 恢复战技点（按上限截断）。 */
  restore(unit: Unit, points: number, reason: string): void {
    if (points <= 0) return;
    const before = this.sp;
    this.sp = Math.min(this.cap, this.sp + points);
    const gained = this.sp - before;
    if (gained <= 0) return;
    this.note(unit, `+${gained} → 战技点 ${fmt(before, 0)} → ${fmt(this.sp, 0)}（上限 ${this.cap}）`, reason);
    this.engine.emit("spChanged", { unit, amount: gained, reason, spend: false, restore: true });
  }

  /** 消耗到指定点数（远坂凛终结技「消耗至 2」）。返回实际消耗的点数。 */
  drainTo(unit: Unit, target: number, reason: string): number {
    const points = this.sp - target;
    if (points <= 0) return 0;
    this.spend(unit, points, reason);
    return points;
  }

  private note(unit: Unit, detail: string, reason: string): void {
    this.engine.record("note", unit, "战技点", { details: [`${reason}：${detail}`] });
  }

  /**
   * 依赖战技点、但这一版还没接的机制：写进「未计入」提示，让用户知道轴上的 SP 是保守值。
   */
  private registerUnsupported(): void {
    const byUnit: [string, string[]][] = [
      ["1306", ["战技点：终结技的溢出记录（最多 10 点，每回合补回）、单回合消耗 ≥3 时下次战技不消耗（未计入）"]],
      ["1015", ["战技点：【回路连接】连续施放战技（本工具按逐动出招，连放取决于战技点、可用逐动覆盖）"]],
      ["1508", ["战技点：与 Archer 的连携追加攻击（+4 点，可触发 1 次；未计入）"]],
      ["1506", ["战技点：【爆爆爆蛋】概率恢复战技点（未计入）"]],
      ["1215", ["战技点：【承载】/行迹【还阳】——战技点恢复效果触发时回复能量（未计入）"]],
      ["1312", ["战技点：天赋消耗战技点回能（未计入）"]],
      ["1501", [
        "战技点：【互动陷阱】可在本次技能内重复发动最多 20 次、每次 −1 点（玩家决定次数，未计入）",
        "战技点：战技/强化战技「施放本技能不视为使用战技」（未计入，现在按普通战技算）",
      ]],
    ];
    for (const unit of this.engine.units) {
      for (const [id, mechanics] of byUnit) if (unit.id === id) for (const mechanic of mechanics) this.engine.addUnsupported(unit, mechanic);
      for (const relic of unit.gear?.relics ?? []) {
        if (relic.id === "324" && relic.pieces >= 2) {
          this.engine.addUnsupported(unit, "遗器【天国@直播间】2 件：同回合消耗 ≥3 点战技点时提高暴伤（伤害类，未计入）");
        }
      }
    }
  }

  /** 战技点不够放战技：这一动改成普攻。抵扣池（爆点）里的点数也算可用。 */
  beforeAct({ unit, kind }: { unit: Unit; kind: ActionKind }): ActionKind | undefined {
    if (kind !== "skill") return undefined;
    const need = SKILL_COST[unit.id] ?? 1;
    const pool = this.buffers.get(unit)?.available() ?? 0;
    if (this.sp + pool >= need) return undefined;
    this.engine.record("note", unit, "战技点不足", {
      details: [`战技点 ${fmt(this.sp, 0)}/${this.cap}：这一动的战技改为普攻`],
    });
    return "basic";
  }

  /** 这一动实际施放的普攻、战技决定收支；终结技不进 casts，所以是 0 消耗。 */
  private settle(unit: Unit, casts: readonly string[]): void {
    for (const cast of casts) {
      if (cast === "basic") this.restore(unit, 1, "普攻");
      else if (cast === "skill") this.spend(unit, SKILL_COST[unit.id] ?? 1, "战技");
      // 强化普攻一律不回复，也不消耗。
    }
    if (unit.id === QINGQUE_ID && !this.zhengfanUsed && casts.includes("skill")) {
      this.zhengfanUsed = true;
      this.restore(unit, 1, "青雀额外能力【争番】");
    }
  }
}
