import type { AxisEngine } from "../engine.ts";
import { elationOf, kitOf, type Elation, type ElationKit } from "../modules/elation.ts";
import type { ActContext } from "../types.ts";
import type { Unit } from "../unit.ts";

/** 角色模块的基类：每场战斗一个实例，角色自己的状态放在实例字段上。 */
export abstract class Kit implements ElationKit {
  abstract readonly id: string;
  engine!: AxisEngine;
  self!: Unit;

  install(engine: AxisEngine, self: Unit): void {
    this.engine = engine;
    this.self = self;
    this.setup();
  }

  protected setup(): void {}

  protected get el(): Elation {
    return elationOf(this.engine);
  }

  /** 队伍里没有星神★阿哈时，这些角色给的治疗和护盾没有额外效果。 */
  protected healOrShield(label: string): void {
    const aha = this.engine.findUnit("1511");
    if (aha) kitOf(aha)?.onHealOrShield?.(label);
  }

  act(context: ActContext): void {
    if (context.kind === "basic") this.basic(context.extra);
    else this.skill(context.extra);
  }

  protected basic(extra: boolean): void {
    this.engine.defaultAct(this.self, "basic", extra);
  }

  protected skill(extra: boolean): void {
    this.engine.defaultAct(this.self, "skill", extra);
  }
}
