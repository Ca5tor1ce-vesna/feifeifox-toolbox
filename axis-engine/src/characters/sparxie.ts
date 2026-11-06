/** 火花（1501）。 */
import { fmt } from "../format.ts";
import { SkillPoints } from "../modules/skill-points.ts";
import type { KitContext } from "../types.ts";
import { Kit } from "./base.ts";

export class SparxieKit extends Kit {
  readonly id = "1501";
  readonly elationNumber = 144;
  /**
   * 【爆点】（4.6.54 版本资料）：开局 0、文案没给上限，用来抵扣她的战技点消耗；
   * 消耗爆点视为消耗战技点。来源：欢愉技 +2、E2【阿哈时刻】结束 +2、终结技按欢愉人数 +1/1/4。
   * 只在开启战技点系统时记录（没开时不改任何结果）。
   */
  spark = 0;
  readonly ascensionTrace = "欢愉万相★兔子戏法";
  readonly ascensionNote = (level: 1 | 2): string => level === 1
    ? "火花固有行迹【欢愉万相★兔子戏法】生效：欢愉技倍率提高原倍率的 50%，我方伤害无视 15% 防御；每 10 点好活当赏使【红红火火】额外 +1 笑点，最多 +8。本工具不掷互动陷阱，因此不加这份笑点"
    : "火花固有行迹【欢愉万相★兔子戏法】2级：欢愉技倍率提高原倍率的 120%，我方伤害无视 20% 防御；每 10 点好活当赏使【红红火火】额外 +1 笑点，最多 +12。本工具不掷互动陷阱，因此不加这份笑点";

  private get points(): SkillPoints | undefined {
    return this.engine.findModule<SkillPoints>("skill-points");
  }

  protected setup(): void {
    const points = this.points;
    if (!points) return;
    this.engine.addResourceView((unit) => (unit === this.self ? { spark: this.spark } : {}));
    // 【爆点】抵扣她的战技点消耗：扣点时先扣爆点。
    points.registerBuffer(this.self, {
      available: () => this.spark,
      take: (amount) => {
        const used = Math.min(this.spark, amount);
        if (used <= 0) return 0;
        this.spark -= used;
        this.engine.record("note", this.self, "【爆点】抵扣", {
          details: [`用 ${used} 点爆点抵扣战技点消耗（剩余 ${this.spark}），视为消耗战技点`],
        });
        return used;
      },
    });
  }

  private gainSpark(amount: number, reason: string): void {
    if (!this.points) return;
    this.spark += amount;
    this.engine.record("note", this.self, "【爆点】", { details: [`${reason}：爆点 +${amount}（现有 ${this.spark}）`] });
  }

  onTechnique({ engine, self }: KitContext): void {
    const points = this.points;
    if (!points) return;
    engine.record("tech", self, "秘技【流量变现】", { details: ["主动攻击【拉黑】敌人进战：为我方恢复 2 个战技点"] });
    points.restore(self, 2, "秘技【流量变现】");
  }

  elationDetails = (): string[] => {
    const lines: string[] = [];
    const level = this.el.ascensionLevel();
    if (level) lines.push(`欢愉万相★兔子戏法：欢愉技倍率提高原倍率的 ${level === 2 ? 120 : 50}%（伤害不模拟）`, `我方伤害无视 ${level === 2 ? 20 : 15}% 防御（伤害不模拟）`);
    lines.push("基础回能 5 × (1+ERR)");
    if (this.points) lines.push("获得 2 个【爆点】");
    return lines;
  };

  /** 欢愉技：基础回能 5（吃 ERR），并使火花获得 2 个【爆点】。 */
  onElationCast = (): void => {
    this.engine.gainEnergy(this.self, 5, { reason: "欢愉技" });
    this.gainSpark(2, "施放欢愉技");
  };

  /** E2：【阿哈时刻】每次结束立刻获得 1 个额外回合和 2 个【爆点】。 */
  onAhaMomentEnd = (): void => {
    if (this.self.eidolon < 2) return;
    this.el.extraTurnWithGrants(this.self, "火花 E2·【阿哈时刻】结束额外回合");
    this.gainSpark(2, "E2【阿哈时刻】结束");
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
    // 行迹额外能力 2：队伍欢愉角色数 1/2/3+ → 额外 1/1/4 个【爆点】。
    const elationCount = engine.units.filter((unit) => unit.elation).length;
    this.gainSpark(elationCount >= 3 ? 4 : 1, `终结技（欢愉 ${elationCount} 人）`);
  }
}
