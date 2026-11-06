/** 开拓者•欢愉（8009）。 */
import { ATTACK_ORDER, kitOf } from "../modules/elation.ts";
import type { KitContext } from "../types.ts";
import { Kit } from "./base.ts";

export class TrailblazerElationKit extends Kit {
  readonly id = "8009";
  readonly elationNumber = 120;
  readonly ascensionTrace = "欢愉万相★主角光环";
  readonly ascensionNote = (level: 1 | 2): string => level === 1
    ? "开拓者•欢愉固有行迹【欢愉万相★主角光环】生效：终结技暴伤额外 +20% 且全队；触发阿哈欢愉技前先放一次开拓者欢愉技（倍率提高原倍率的 200%）；阿哈真实伤害改为该次的 20%"
    : "开拓者•欢愉固有行迹【欢愉万相★主角光环】2级：终结技暴伤额外 +30% 且全队；触发阿哈欢愉技前先放一次开拓者欢愉技（倍率提高原倍率的 300%）；阿哈真实伤害改为该次的 20%";

  protected setup(): void {
    // 天赋：自己的普攻、战技后 +10 固定能量 +3 笑点。
    this.engine.on("attack", ({ unit, kind }) => {
      if (unit !== this.self || (kind !== "basic" && kind !== "skill")) return;
      this.engine.gainEnergy(this.self, 10, { fixed: true, reason: "天赋" });
      this.el.gainPunchline(3);
    }, ATTACK_ORDER.trailblazerTalent);
  }

  protected skill(extra: boolean): void {
    const { engine, self } = this;
    engine.record("skill", self, `${self.name} 的战技`, { details: ["基础回能 30 × (1+ERR)", "天赋：+10 固定能量 +3 笑点"], extra });
    engine.gainEnergy(self, 30, { reason: "战技" });
    engine.attack(self, "skill", extra);
  }

  onUltimate({ engine, self }: KitContext): void {
    const el = this.el;
    const target = engine.unitAt(engine.resolveTarget(self));
    engine.targetAlly(self, target, "终结技");
    const details = ["笑点 +5"];
    const canCast = target !== undefined && kitOf(target)?.elationNumber !== undefined;
    const halo = canCast && el.huanyuActive() && target.id === "1511";
    if (target && canCast) {
      details.push(`${target.name} 立刻施放 1 次欢愉技（好活当赏计入 20，不进笑点池）`);
      if (halo) details.push("欢愉万相★主角光环：先施放开拓者欢愉技，再触发阿哈欢愉技");
    } else if (target) {
      details.push(`${target.name} 拉条 50%`);
    }
    engine.record("note", self, "开拓者•欢愉终结技", { details });
    el.gainPunchline(5);
    if (!target) return;
    if (!canCast) {
      engine.advance(target, 50, { source: self });
      return;
    }
    if (halo) {
      engine.record("note", self, "欢愉万相★主角光环", {
        details: [
          "开拓者欢愉技倍率提高原倍率的 200%（按最高好活当赏计算，伤害不模拟）",
          "阿哈欢愉技真实伤害改为该次的 20%，由敌方全体均分（伤害不模拟）",
          "终结技暴伤额外 +20% 且对全队生效（伤害不模拟）",
        ],
      });
      el.castElationSkill(self);
    }
    el.castElationSkill(target);
    // 砂金•戏浪的举杯和 All in 自己已经记了 20，这里不再叠一次。
    if (target.id !== "1513") el.grantHaohuo(el.elationUnits(), 20, "开拓者终结技·计入笑点");
  }
}
