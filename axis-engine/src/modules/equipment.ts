/**
 * 光锥和遗器的效果。新入口按 unit.gear 走 gear-effects.ts 的表；
 * 这里的开关（windSet4 等）只给旧接口用，随阶段 6 下线。
 */
import type { AxisEngine } from "../engine.ts";
import { fmt } from "../format.ts";
import type { BattleModule } from "../types.ts";
import type { Unit } from "../unit.ts";
import { LIGHTCONE_EFFECTS, RELIC_EFFECTS, Worn, type GearEffect } from "./gear-effects.ts";

const YAO_LC_WAVE_ENERGY = 15;

export class Equipment implements BattleModule {
  readonly id = "equipment";
  private readonly dancePct: number;

  constructor(options: { dancePct: number }) {
    this.dancePct = options.dancePct;
  }

  private wear(engine: AxisEngine, unit: Unit, effect: GearEffect | undefined, params: readonly number[]): void {
    if (!effect) return;
    for (const mechanic of effect.notSimulated ?? []) engine.addUnsupported(unit, `${effect.name}：${mechanic}`);
    effect.apply?.(new Worn(engine, unit, effect.name, params));
  }

  private wearAll(engine: AxisEngine, unit: Unit): void {
    const { lightcone, relics } = unit.gear ?? { relics: [] };
    if (lightcone) {
      const effect = LIGHTCONE_EFFECTS[lightcone.id];
      if (lightcone.active) this.wear(engine, unit, effect, lightcone.params);
      else if (effect) engine.notes.push(`${unit.name} 的命途和《${effect.name}》不同，光锥效果不生效。`);
    }
    for (const { id, pieces } of relics) {
      this.wear(engine, unit, RELIC_EFFECTS[`${id}:2`], []);
      if (pieces >= 4) this.wear(engine, unit, RELIC_EFFECTS[`${id}:4`], []);
    }
  }

  install(engine: AxisEngine): void {
    for (const unit of engine.units) this.wearAll(engine, unit);
    // 排在角色自己的终结技效果之后。
    engine.on("ultimate", ({ unit }) => {
      if (!unit.equip.windSet4) return;
      engine.record("note", unit, "晨昏交界的翔鹰", { details: ["自身拉条 25%"] });
      engine.advance(unit, 25, { selfSource: true });
    }, 20);
    engine.on("ultimate", ({ unit }) => {
      if (!unit.equip.danceS5) return;
      engine.record("note", unit, "舞！舞！舞！", { details: [`我方全体拉条 ${fmt(this.dancePct, 0)}%`] });
      engine.advanceAllies(unit, this.dancePct);
    }, 30);
    engine.on("battleTraits", ({ unit }) => {
      if (!unit.equip.hasYaoLc) return;
      engine.record("note", unit, "当她决定看见", { details: ["每波次开始：固定能量 +15"] });
      engine.gainEnergy(unit, YAO_LC_WAVE_ENERGY, { fixed: true, reason: "专武" });
    });
    engine.on("openingAdvance", ({ unit }) => {
      if (unit.equip.vonwacq) {
        if (unit.initialSpeed >= 120) {
          engine.record("note", unit, "生命的翁瓦克", { details: ["速度 ≥ 120：开局拉条 40%"] });
          engine.advance(unit, 40);
        } else {
          engine.record("note", unit, "生命的翁瓦克", { details: [`速度 ${fmt(unit.initialSpeed, 1)} < 120：开局拉条不触发`] });
        }
      }
      if (unit.equip.godJoy) {
        engine.record("note", unit, "神的瞬息欢愉", { details: ["速度 +6% 已计入", "开局 40% 拉条需要欢愉度 ≥ 40%（本工具不模拟欢愉度，因此不拉条）"] });
      }
    });
  }
}
