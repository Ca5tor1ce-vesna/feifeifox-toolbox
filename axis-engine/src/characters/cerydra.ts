/**
 * 刻律德菈（1412）：给指定队友上【军功】，攒充能升【爵位】，持有者放战技触发【奇袭】。
 *
 * 口径（2026-11-05 用户提供的技能文案）：
 * - 【军功】只对最新被施加的目标生效；目标改变时充能重置为 0。
 * - 充能上限 8：自身战技 +1、持有【军功】的角色施放普攻或战技 +1、终结技 +2。
 * - 充能到 6 点自动把【军功】升级为【爵位】（并解除控制类负面状态），【爵位】视为同时持有【军功】。
 * - 持有【爵位】者对敌方施放战技时触发【奇袭】：复制一次即将施放的技能并提前施放，随后施放原技能；
 *   奇袭不会再次触发奇袭。奇袭结束后消耗 6 点充能，【爵位】降回【军功】。
 * - 奇袭期间无法获得充能。
 *
 * 【奇袭】按「独立施放」计（2026-11-05 用户确认）：回能和攻击事件各算一次，
 * 但不重复上 buff、拉条、额外回合这类副作用。
 */
import { fmt } from "../format.ts";
import type { KitContext } from "../types.ts";
import type { Unit } from "../unit.ts";
import { Kit } from "./base.ts";

const CHARGE_CAP = 8;
const QUEEN_AT = 6;
const QIXI_COST = 6;
/** 行迹【征服者】：施放战技时自身和目标 +20 速，持续 3 回合。 */
const TRACE_SPEED = 20;
const TRACE_TURNS = 3;

export class CerydraKit extends Kit {
  readonly id = "1412";
  readonly enemyDependent = [
    "【爵位】的战技暴击伤害 +72%、全属性抗性穿透 +10%（本工具不模拟伤害）",
    "天赋：持有【军功】的角色攻击力 + 刻律德菈攻击力的 24%（伤害类，不模拟）",
    "天赋附加伤害：60% 攻击力、最多 20 次、施放终结技重置（伤害类，不模拟）",
    "解除控制类负面状态（本工具不模拟敌方控制）",
  ];
  /** 充能，0~8。 */
  charge = 0;
  /** 【军功】当前持有者，null 表示场上没人持有。 */
  mark: Unit | null = null;
  /** 是否已升级为【爵位】。 */
  queen = false;
  /** 本次行动触发了奇袭，等这一动结束再扣充能、降回【军功】。 */
  private qixiPending = false;
  /** 奇袭副本正在结算：期间不再获得充能，也不会再触发一次奇袭。 */
  private inQiXi = false;
  /** 正在结算复制副本的攻击事件，这段里的回能不算进「原技能回能」。 */
  private inDuplicate = false;
  /** 这一动里原技能实际回了多少能量，副本按同量补一份。 */
  private capture: { unit: Unit; total: number } | null = null;

  protected setup(): void {
    // 天赋：持有【军功】的角色施放普攻或战技时 +1 充能；奇袭期间不获得。
    this.engine.on("attack", ({ unit, kind }) => {
      if (this.inQiXi || this.mark !== unit) return;
      if (kind !== "basic" && kind !== "skill") return;
      this.addCharge(1, `${unit.name} 施放${kind === "basic" ? "普攻" : "战技"}`);
    });

    // 奇袭：持有【爵位】者施放战技时，先插一次副本（回能与攻击事件各算一次）。
    // 回能无法在这里直接给：不少角色的战技回能写在模块规则里（白厄的【火种】就是），
    // 所以这里只先补攻击事件，回能在这一动结束后按「原技能实际回能」补一份。
    this.engine.on("skillStart", ({ unit, kind, extra }) => {
      if (kind !== "skill" || !this.queen || this.inQiXi || this.mark !== unit) return;
      this.inQiXi = true;
      this.capture = { unit, total: 0 };
      this.engine.record("note", unit, "奇袭", {
        details: ["复制一次即将施放的战技并提前施放", "回能与攻击事件各算一次；不重复上 buff", "奇袭期间无法获得充能"],
        extra,
      });
      this.inDuplicate = true;
      try {
        this.engine.attack(unit, "skill", extra);
      } finally {
        this.inDuplicate = false;
      }
      this.qixiPending = true;
    });

    // 记录原技能这一动实际回的能量（复制副本时按同量补一份）。
    this.engine.on("energyGain", ({ unit, requested }) => {
      if (this.inDuplicate || !this.capture || this.capture.unit !== unit) return;
      // 记「该回多少」（已乘能量恢复效率、还没被上限截掉），不记实际进账：原技能回满时副本不该跟着变少。
      this.capture.total += requested;
    });

    // 奇袭结束：补副本回能、消耗 6 点充能，【爵位】降回【军功】。
    this.engine.on("actionDone", ({ unit }) => {
      if (!this.qixiPending || this.mark !== unit) return;
      this.qixiPending = false;
      this.inQiXi = false;
      const copyEnergy = this.capture?.total ?? 0;
      this.capture = null;
      // copyEnergy 已经乘过能量恢复效率，按固定值给，不能再乘一次（2026-11-06：19.4% 充能时副本回了 42.77，应为 35.82）。
      if (copyEnergy > 0) this.engine.gainEnergy(unit, copyEnergy, { fixed: true, reason: "奇袭副本" });
      const before = this.charge;
      this.charge = Math.max(0, this.charge - QIXI_COST);
      this.engine.record("note", unit, "奇袭结束", {
        details: [
          `副本回能 +${fmt(copyEnergy)}`,
          `消耗 ${QIXI_COST} 点充能（${fmt(before)} → ${fmt(this.charge)}）`,
          "【爵位】降回【军功】",
        ],
      });
      this.queen = false;
    });
  }

  /** 【军功】只对最新目标生效；换目标时充能归零。 */
  private setMark(target: Unit, label: string): void {
    if (target === this.mark) return;
    const before = this.charge;
    this.mark = target;
    this.charge = 0;
    this.queen = false;
    const details = [`【军功】转移到 ${target.name}`];
    if (before > 0) details.push(`目标改变：充能 ${fmt(before)} → 0`);
    this.engine.record("note", target, label, { details });
  }

  private addCharge(amount: number, label: string): void {
    if (amount <= 0) return;
    const before = this.charge;
    this.charge = Math.min(CHARGE_CAP, this.charge + amount);
    this.engine.record("note", this.self, "充能", {
      details: [`${label} → 充能 ${fmt(before)} → ${fmt(this.charge)}（上限 ${CHARGE_CAP}）`],
    });
    this.maybeUpgrade();
  }

  private maybeUpgrade(): void {
    if (this.queen || this.charge < QUEEN_AT || !this.mark) return;
    this.queen = true;
    this.engine.record("note", this.mark, "【军功】升级为【爵位】", {
      details: [`充能达到 ${QUEEN_AT} 点：自动升级并解除控制类负面状态`, "【爵位】视为同时持有【军功】"],
    });
  }

  onTechnique({ engine }: KitContext): void {
    // 【军功】跟着当前操控的角色走，进战斗时在进场角色身上；没指定进场角色时按战技目标算。
    const holder = engine.techniqueHolder();
    const details = ["使用秘技后获得【军功】", "战斗开始时自动对持有【军功】的角色施放 1 次战技（不消耗战技点）"];
    if (holder) details.push(`进场角色 ${holder.name} 持有【军功】`);
    engine.record("tech", this.self, "秘技【先手优势】", { details });
    this.skill(false, holder);
  }

  onUltimate({ engine, self }: KitContext): void {
    this.addCharge(2, `${self.name} 的终结技`);
    if (!this.mark) {
      const first = engine.units[0];
      if (first) {
        this.mark = first;
        engine.record("note", first, "终结技：补【军功】", {
          details: ["场上没有持有【军功】的角色", `队伍第一位角色 ${first.name} 获得【军功】`],
        });
        this.maybeUpgrade();
      }
    }
  }

  protected skill(extra: boolean, forced?: Unit): void {
    const { engine, self } = this;
    const target = forced ?? engine.unitAt(engine.resolveTarget(self)) ?? self;
    engine.targetAlly(self, target, "战技");
    this.setMark(target, "战技：施加【军功】");
    // 行迹【征服者】。
    engine.addSpeedBuff(self, { kind: "flat", value: TRACE_SPEED, turns: TRACE_TURNS, label: "行迹【征服者】" });
    engine.record("note", self, "行迹【征服者】", { details: [`${self.name} 速度 +${TRACE_SPEED} 点，持续 ${TRACE_TURNS} 回合`] });
    if (target !== self) {
      engine.addSpeedBuff(target, { kind: "flat", value: TRACE_SPEED, turns: TRACE_TURNS, label: "行迹【征服者】" });
      engine.record("note", target, "行迹【征服者】", { details: [`${target.name} 速度 +${TRACE_SPEED} 点，持续 ${TRACE_TURNS} 回合`] });
    }
    engine.defaultAct(self, "skill", extra);
    this.addCharge(1, `${self.name} 的战技`);
    if (self.eidolon >= 1 && target !== self) engine.gainEnergy(target, 2, { fixed: true, reason: "E1" });
  }

  mechanics = () => ({ charge: this.charge, queen: this.queen, markSlot: this.mark?.slot ?? null });
}
