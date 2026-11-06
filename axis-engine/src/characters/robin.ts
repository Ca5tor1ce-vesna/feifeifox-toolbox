/** 知更鸟（1309）。 */
import { ATTACK_ORDER, TALENT_ATTACK_KINDS } from "../modules/elation.ts";
import type { KitContext } from "../types.ts";
import type { SummonActor } from "../unit.ts";
import { Kit } from "./base.ts";

const ROBIN_LC_ERR_PER_STACK = 3;
const ROBIN_LC_MAX_STACKS = 5;

export class RobinKit extends Kit {
  readonly id = "1309";
  lcStacks = 0;
  private countdown: SummonActor | null = null;

  protected setup(): void {
    // 天赋：我方每次攻击后恢复 2 点能量（E2 为 3，吃 ERR）。
    this.engine.on("attack", ({ kind }) => {
      if (!TALENT_ATTACK_KINDS.includes(kind)) return;
      const { self, engine } = this;
      if (self.equip.hasRobinLc && this.lcStacks < ROBIN_LC_MAX_STACKS) {
        this.lcStacks += 1;
        self.errBonus = this.lcStacks * ROBIN_LC_ERR_PER_STACK;
      }
      engine.gainEnergy(self, self.eidolon >= 2 ? 3 : 2, { reason: "天赋" });
    }, ATTACK_ORDER.robinTalent);
    // E2：处于【协奏】状态时，我方全体速度提高 16%。
    this.engine.addSpeedModifier(() => (this.self.eidolon >= 2 && this.self.paused ? { pct: 16 } : {}));
  }

  /** 行迹【华彩花腔】：战斗开始时，自身行动提前 25%。 */
  onBattleStart({ engine, self }: KitContext): void {
    engine.record("note", self, "行迹【华彩花腔】", { details: ["自身行动提前 25%"] });
    engine.advance(self, 25, { selfSource: true });
  }

  onTechnique({ engine, self }: KitContext): void {
    engine.record("tech", self, "知更鸟秘技：酣醉序曲", { details: ["每波次开始 +5 能量（本工具=战斗开始一次）"] });
    engine.gainEnergy(self, 5, { reason: "秘技" });
  }

  protected skill(extra: boolean): void {
    const { engine, self } = this;
    engine.record("skill", self, `${self.name} 的战技`, { details: ["基础回能 35（战技 30 + 行迹【模进乐段】5）× (1+ERR)"], extra });
    engine.gainEnergy(self, 35, { reason: "战技" });
    engine.attack(self, "skill", extra);
  }

  onUltimate({ engine, self }: KitContext): void {
    const details = ["其他队友全体拉条 100%", "召唤 90 速【协奏】倒计时", "【协奏】期间本体不行动，倒计时归零时立即行动"];
    if (self.eidolon >= 2) details.push("E2：【协奏】期间我方全体速度 +16%");
    engine.record("note", self, "知更鸟终结技", { details });
    for (const unit of engine.units) {
      if (unit !== self) engine.advance(unit, 100, { source: self });
    }
    // 专武：开大时移除【歌咏】。
    if (self.equip.hasRobinLc) {
      this.lcStacks = 0;
      self.errBonus = 0;
    }
    self.paused = true;
    if (this.countdown) engine.removeActor(this.countdown);
    this.countdown = engine.addActor({ name: "【协奏】倒计时", role: "countdown", speed: () => 90, onTurn: (actor) => this.endConcerto(actor) });
  }

  private endConcerto(actor: SummonActor): void {
    const { engine, self } = this;
    engine.record("summon", null, `${actor.name} 归零`, { details: ["【协奏】状态结束"], kind: "summon", name: actor.name });
    engine.removeActor(actor);
    this.countdown = null;
    if (!self.paused) return;
    self.paused = false;
    self.remDist = 0;
    engine.record("note", self, "退出【协奏】", { details: ["立即行动"] });
    engine.takeTurn(self);
  }

  mechanics = () => ({ concerto: this.self.paused, lcErStacks: this.lcStacks });
}
