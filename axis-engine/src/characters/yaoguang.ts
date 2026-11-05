/** 爻光（1502）。 */
import { fmt } from "../format.ts";
import { ATTACK_ORDER, TALENT_ATTACK_KINDS } from "../modules/elation.ts";
import type { KitContext } from "../types.ts";
import { Kit } from "./base.ts";

export class YaoguangKit extends Kit {
  readonly id = "1502";
  readonly elationNumber = 116;
  readonly ascensionTrace = "欢愉万相★心灵感应";
  readonly ascensionNote = (level: 1 | 2): string => level === 1
    ? "爻光固有行迹【欢愉万相★心灵感应】生效：【大吉大利】倍率提高原倍率的 20%（20%→24%），终结技固定能量 +12、笑点 +10"
    : "爻光固有行迹【欢愉万相★心灵感应】2级：【大吉大利】倍率提高原倍率的 40%（20%→28%），终结技固定能量 +30、笑点 +10";
  /** 结界剩余回合。 */
  field = 0;

  protected setup(): void {
    this.engine.addSpeedModifier(() => (this.field > 0 && this.self.eidolon >= 2 ? { pct: 12 } : {}));
    // 天赋【大吉大利】。伤害不结算，这里只记说明；欢愉技同样算施放攻击。
    this.engine.on("attack", ({ kind }) => {
      const attacking = TALENT_ATTACK_KINDS.includes(kind) || kind === "elation_skill";
      if (!attacking || this.el.haohuoOf(this.self).length === 0 || !this.el.huanyuActive()) return;
      this.engine.record("note", this.self, "大吉大利", {
        details: ["【大吉大利】欢愉伤害 24%（原倍率 20% × 1.20）", "固有行迹【欢愉万相★心灵感应】：倍率提高原倍率的 20%", "不视为 1 次攻击"],
      });
    }, ATTACK_ORDER.yaoguangTalent);
  }

  onTechnique({ engine, self }: KitContext): void {
    engine.record("tech", self, "爻光秘技：自动施放战技", { details: ["结界 3 回合（不吃战技点）"] });
    this.skill(false);
  }

  protected basic(extra: boolean): void {
    const { engine, self } = this;
    const details = ["基础回能 30（普攻）"];
    if (this.field > 0) {
      this.el.gainPunchline(3);
      details.push("结界内 +3 笑点");
    }
    engine.record("basic", self, `${self.name} 的普攻`, { details, extra });
    engine.gainEnergy(self, 30, { reason: "普攻" });
    engine.attack(self, "basic", extra);
  }

  protected skill(extra: boolean): void {
    const { engine, self } = this;
    this.field = 3;
    engine.record("skill", self, `${self.name} 的战技`, { details: ["结界 3 回合", "结界内自己普攻/战技 +3 笑点", "基础回能 30 × (1+ERR)"], extra });
    this.el.gainPunchline(3);
    engine.gainEnergy(self, 30, { reason: "战技" });
    engine.attack(self, "skill", extra);
  }

  /** 文案：「每回合开始时持续回合数减 1」。 */
  onTurnStart({ engine, self }: KitContext): void {
    if (this.field <= 0) return;
    this.field -= 1;
    if (this.field === 0) engine.record("note", self, "结界结束");
  }

  onUltimate({ engine, self }: KitContext): void {
    const el = this.el;
    const fixed = self.eidolon >= 1 ? 40 : 20;
    const details = ["笑点 +5", `【阿哈时刻】额外回合（计入 ${fmt(fixed, 0)} 笑点，不消耗笑点池）`];
    // 固有行迹 150229：1 级 +20% / +12 能量，阿哈 2 魂升格加强后 2 级 +40% / +30 能量。
    const level = el.ascensionLevel();
    const energy = level === 2 ? 30 : 12;
    if (level) details.push(`欢愉万相★心灵感应：【大吉大利】倍率提高原倍率的 ${level === 2 ? 40 : 20}%；+${energy} 固定能量 +10 笑点`);
    engine.record("note", self, "爻光终结技", { details });
    el.gainPunchline(5);
    el.doAha(true, fixed);
    if (level) {
      engine.gainEnergy(self, energy, { fixed: true, reason: "心灵感应" });
      el.gainPunchline(10);
    }
  }

  mechanics = () => {
    // 10 级天赋 20%。命途升格中再乘 1.20，2 级乘 1.40。
    const level = this.el.ascensionLevel();
    return { fieldTurns: this.field, dajiElationDamage: 0.2 * (1 + [0, 0.2, 0.4][level]), mindLinkActive: level > 0 };
  };
}
