/** 绯英（1505）。能量与好活当赏双向同步但不递归互触发；上限 480，开大消耗 240。 */
import { EPS, MAX_NEST } from "../engine.ts";
import { fmt } from "../format.ts";
import type { Haohuo, HaohuoGrant } from "../modules/elation.ts";
import { kitOf } from "../modules/elation.ts";
import type { EnergyGain, KitContext } from "../types.ts";
import type { Unit } from "../unit.ts";
import { Kit } from "./base.ts";

export class FeiyingKit extends Kit {
  readonly id = "1505";
  readonly elationNumber = 146;
  readonly ascensionTrace = "欢愉万相★书中折花";
  // 旧说明已经把两级写在一起，保持原文。
  readonly ascensionNote = (): string => "绯英固有行迹【欢愉万相★书中折花】生效：1/2级溢出能量最多 60/240，开大后恢复且不触发天赋好活当赏；伤害无视 10%/24% 防御；每累计 480 点好活当赏，下次终结技倍率提高原倍率的 75%/150%";
  /** 距下一次【狐狸老师】累计的能量。 */
  total = 0;
  /** 升格后累计的好活当赏，每 480 给一层终结技增伤。 */
  banger = 0;
  ultBonus = 0;
  private restore = 0;
  private stacks = 0;

  private ahaLevel2(): boolean {
    return this.el.ascensionLevel() === 2;
  }

  gainEnergy({ engine, self }: KitContext, gainInfo: EnergyGain): void {
    const requested = gainInfo.fixed ? gainInfo.amount : gainInfo.amount * (1 + self.totalErr() / 100);
    let cap = self.maxEnergy;
    if (this.el.huanyuActive()) cap += this.ahaLevel2() ? 240 : 60;
    const before = self.energy;
    self.energy = Math.min(cap, self.energy + requested);
    const gain = Math.max(0, self.energy - before);
    const details = [`能量 ${fmt(before)} → ${fmt(self.energy)} / ${fmt(cap, 0)}`, `实际 +${fmt(gain)}`];
    if (requested - gain > EPS) details.push(`上限截掉 ${fmt(requested - gain)}（不计入天赋累计）`);
    engine.record("energy_gain", self, `绯英回能·${gainInfo.reason || "回能"}`, {
      details,
      resources: { energyBefore: before, energyGain: gain, energyRequested: requested, energyCap: cap },
    });
    if (gain > 0 && !gainInfo.fromHaohuo) this.el.grantHaohuo([self], Math.min(gain, 100), "绯英·能量转好活当赏", { fromEnergy: true });
    this.total += Math.min(gain, 240);
    this.checkMilestone();
    self.energyTotal += gain;
    engine.maybeUltimate(self);
  }

  /** 累计每 240 能量触发一次【狐狸老师】追击。 */
  private checkMilestone(): void {
    const { engine, self } = this;
    if (engine.depth > MAX_NEST) {
      if (this.total >= 240) {
        engine.truncated = true;
        engine.warnings.push("狐狸老师回能连锁超过嵌套上限，结果已截断，请检查自定义充能效率");
      }
      return;
    }
    engine.depth += 1;
    try {
      engine.holdUltimates(() => {
        while (this.total >= 240 && !engine.truncated) {
          this.total -= 240;
          self.followUps += 1;
          engine.record("fua", self, "【狐狸老师】追加攻击", { details: ["基础回能 10 × (1+ERR)"] });
          engine.gainEnergy(self, 10, { reason: "狐狸老师" });
          engine.attack(self, "fua");
          if (self.eidolon >= 1) this.el.castElationSkill(self);
        }
      });
    } finally {
      engine.depth -= 1;
    }
  }

  /** E6：好活当赏延长 1 回合。 */
  haohuoTurns = (): number => (this.self.eidolon >= 6 ? 3 : 2);

  /** 瞰众乐：参演编号更小的队友获得好活当赏时转移一部分，E2 提高。 */
  onAllyHaohuo = (ally: Unit, applied: number): void => {
    const number = kitOf(ally)?.elationNumber;
    if (number === undefined || number >= this.elationNumber) return;
    const copied = applied * (this.self.eidolon >= 2 ? 0.75 : 0.5);
    this.engine.record("note", this.self, "瞰众乐·好活当赏转移", { details: [`${ally.name}（编号 ${number}）→ 好活当赏 +${fmt(copied)}`] });
    this.el.grantHaohuo([this.self], copied, "瞰众乐");
  };

  /** 开不败：任意队友的好活当赏到期时转移一部分，E2 全额。 */
  onAllyHaohuoExpired = (ally: Unit, item: Haohuo): void => {
    const copied = item.count * (this.self.eidolon >= 2 ? 1 : 0.5);
    this.engine.record("note", this.self, "开不败·好活当赏转移", { details: [`${ally.name} 状态结束 → 好活当赏 +${fmt(copied)}`] });
    this.el.grantHaohuo([this.self], copied, "开不败");
  };

  onHaohuo = ({ applied, count, label, fromEnergy }: HaohuoGrant): void => {
    const el = this.el;
    if (el.huanyuActive() && applied > EPS) {
      this.banger += applied;
      while (this.banger >= 480 - EPS) {
        this.banger -= 480;
        this.ultBonus += 1;
      }
    }
    if (fromEnergy) return;
    // 天赋：单次通过好活当赏计算的能量不超过 100 点。flat 模式仅供自定义试算。
    const gain = el.cfg.feiyingHaohuoMode === "flat" ? el.cfg.feiyingHaohuoEnergy : Math.min(count, 100);
    if (gain > 0) this.engine.gainEnergy(this.self, gain, { fixed: true, reason: `好活当赏·${label}`, fromHaohuo: true });
  };

  onTechnique({ engine, self }: KitContext): void {
    engine.record("tech", self, "绯英秘技", { details: ["自身好活当赏 +20"] });
    this.el.grantHaohuo([self], 20, "绯英秘技");
  }

  protected skill(extra: boolean): void {
    const { engine, self, el } = this;
    engine.record("skill", self, `${self.name} 的战技`, { details: ["笑点 +10", "基础回能 30 × (1+ERR)"], extra });
    el.gainPunchline(10);
    engine.gainEnergy(self, 30, { reason: "战技" });
    engine.attack(self, "skill", extra);
  }

  onElationCast = (): void => {
    const { engine, self } = this;
    engine.gainEnergy(self, 5, { reason: "欢愉技" });
    this.el.grantHaohuo([self], self.eidolon >= 1 ? 15 : 5, "绯英欢愉技");
  };

  payUltimate({ self }: KitContext) {
    const before = self.energy;
    this.restore = 0;
    this.stacks = 0;
    if (this.el.huanyuActive()) {
      this.restore = Math.max(0, self.energy - self.maxEnergy);
      this.stacks = this.ultBonus;
      this.ultBonus = 0;
    }
    self.energy = Math.max(0, self.energy - this.restore - self.ultCost);
    return {
      details: [`释放前能量 ${fmt(before)}，消耗 ${fmt(self.ultCost, 0)}`],
      resources: { energyBefore: before, energyCost: self.ultCost },
    };
  }

  onUltimate({ engine, self }: KitContext): void {
    const level2 = this.ahaLevel2();
    const { restore, stacks } = this;
    if (this.el.huanyuActive() || restore > EPS || stacks > 0) {
      const details: string[] = [];
      if (restore > EPS) {
        engine.gainEnergy(self, restore, { fixed: true, reason: "书中折花·溢出恢复", fromHaohuo: true });
        details.push(`书中折花：溢出能量 ${fmt(restore)} 在开大后恢复（不触发天赋好活当赏）`);
      }
      if (stacks > 0) details.push(`书中折花：本次终结技倍率提高原倍率的 ${fmt(stacks * (level2 ? 150 : 75), 0)}%（${stacks} 层，伤害不模拟）`);
      if (restore <= EPS && stacks <= 0) details.push("书中折花：本次没有可恢复的溢出能量");
      details.push(`伤害无视 ${level2 ? 24 : 10}% 防御（伤害不模拟）`);
      engine.record("note", self, "欢愉万相★书中折花", { details });
    }
    // E6：首次终结技固定 +120，之后每再施放 4 次终结技触发 1 次。
    if (self.eidolon >= 6 && (self.ultimates - 1) % 4 === 0) {
      engine.record("note", self, "E6 少女，见浮生入梦", { details: ["固定能量 +120"] });
      engine.gainEnergy(self, 120, { fixed: true, reason: "E6" });
    }
    engine.attack(self, "ultimate");
  }

  mechanics = () => ({
    energySinceFuA: this.total,
    energyOverflow: Math.max(0, this.self.energy - this.self.maxEnergy),
    feiyUltBonus: this.ultBonus,
  });
}
