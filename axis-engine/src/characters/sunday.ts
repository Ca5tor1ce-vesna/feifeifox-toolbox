/** 星期日（1313）。 */
import { fmt } from "../format.ts";
import type { KitContext } from "../types.ts";
import { Kit } from "./base.ts";

const SUNDAY_LC_ENERGY = 6;

export class SundayKit extends Kit {
  readonly id = "1313";

  onBattleStart({ engine, self }: KitContext): void {
    engine.record("note", self, "行迹【崇高拂尘】", { details: ["战斗开始能量 +25"] });
    engine.gainEnergy(self, 25, { reason: "崇高拂尘" });
  }

  onTurnStart({ engine, self }: KitContext): void {
    if (self.eidolon < 4) return;
    engine.record("note", self, "E4 雕塑的卷首语", { details: ["回合开始能量 +8"] });
    engine.gainEnergy(self, 8, { reason: "E4" });
  }

  protected skill(extra: boolean): void {
    const { engine, self } = this;
    const details: string[] = [];
    const target = engine.unitAt(engine.resolveTarget(self));
    if (target) {
      engine.advance(target, 100);
      details.push(`${target.name} 拉条 100%`);
    }
    if (self.equip.hasSundayLc && target) {
      engine.gainEnergy(self, SUNDAY_LC_ENERGY, { reason: "专武" });
      details.push(`专武：能量 +${fmt(SUNDAY_LC_ENERGY)} × (1+ERR)`);
    }
    engine.record("skill", self, `${self.name} 的战技`, { details: [...details, "基础回能 30 × (1+ERR)"], extra });
    engine.gainEnergy(self, 30, { reason: "战技" });
    engine.attack(self, "skill", extra);
  }

  onUltimate({ engine, self }: KitContext): void {
    const target = engine.unitAt(engine.resolveTarget(self));
    const gain = target ? Math.max(40, 0.2 * target.maxEnergy) : 40;
    const details = [target ? `指定目标回复 ${fmt(gain)} 固定能量（不吃 ERR）` : "没有合法目标"];
    if (target && self.equip.hasSundayLc) details.push(`专武：自身能量 +${fmt(SUNDAY_LC_ENERGY)} × (1+ERR)`);
    engine.record("note", self, "星期日终结技", { details });
    if (!target) return;
    engine.gainEnergy(target, gain, { fixed: true, reason: "星期日终结技" });
    if (self.equip.hasSundayLc) engine.gainEnergy(self, SUNDAY_LC_ENERGY, { reason: "专武" });
  }

  mechanics = () => ({ emblem: false });
}
