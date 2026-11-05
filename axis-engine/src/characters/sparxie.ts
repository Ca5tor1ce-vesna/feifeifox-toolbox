/** 火花（1501）。 */
import { fmt } from "../format.ts";
import type { KitContext } from "../types.ts";
import { Kit } from "./base.ts";

export class SparxieKit extends Kit {
  readonly id = "1501";
  readonly elationNumber = 144;
  readonly ascensionTrace = "欢愉万相★兔子戏法";
  readonly ascensionNote = (level: 1 | 2): string => level === 1
    ? "火花固有行迹【欢愉万相★兔子戏法】生效：欢愉技倍率提高原倍率的 50%，我方伤害无视 15% 防御；每 10 点好活当赏使【红红火火】额外 +1 笑点，最多 +8。本工具不掷互动陷阱，因此不加这份笑点"
    : "火花固有行迹【欢愉万相★兔子戏法】2级：欢愉技倍率提高原倍率的 120%，我方伤害无视 20% 防御；每 10 点好活当赏使【红红火火】额外 +1 笑点，最多 +12。本工具不掷互动陷阱，因此不加这份笑点";

  elationDetails = (): string[] => {
    const lines: string[] = [];
    const level = this.el.ascensionLevel();
    if (level) lines.push(`欢愉万相★兔子戏法：欢愉技倍率提高原倍率的 ${level === 2 ? 120 : 50}%（伤害不模拟）`, `我方伤害无视 ${level === 2 ? 20 : 15}% 防御（伤害不模拟）`);
    lines.push("基础回能 5 × (1+ERR)");
    return lines;
  };

  /** E2：【阿哈时刻】每次结束立刻获得 1 个额外回合。 */
  onAhaMomentEnd = (): void => {
    if (this.self.eidolon >= 2) this.el.extraTurnWithGrants(this.self, "火花 E2·【阿哈时刻】结束额外回合");
  };

  protected skill(extra: boolean): void {
    const { engine, self, el } = this;
    engine.record("skill", self, `${self.name} 的战技`, { details: ["笑点 +4", "战技本身 0 能量", "同回合接强化普攻《百花齐放》"], extra });
    el.gainPunchline(4);
    engine.record("enhanced_basic", self, "百花齐放，胜者独享！", { details: ["基础回能 40 × (1+ERR)"], extra });
    engine.gainEnergy(self, 40, { reason: "强化普攻" });
    engine.attack(self, "enhanced_basic", extra);
  }

  onUltimate({ engine, self }: KitContext): void {
    const others = engine.units.filter((unit) => unit.elation && unit !== self).length;
    const bonus = others >= 3 ? 8 : others === 2 ? 4 : others >= 1 ? 2 : 0;
    const gain = 2 + bonus + (self.eidolon >= 4 ? 5 : 0);
    engine.record("note", self, "火花终结技", { details: [`其他欢愉 ${others} 人 → 笑点 +${fmt(gain, 0)}`] });
    this.el.gainPunchline(gain);
  }
}
