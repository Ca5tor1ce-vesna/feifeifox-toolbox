/**
 * 简单角色的声明式写法：机制只有几条「什么时候做什么」时，不必写完整的类。
 *
 * 回能的约定：文案写「固定恢复」的不吃能量恢复效率，只写「恢复」的按吃效率算。
 * 文案不一定严格区分，这条待实测。按能量上限百分比的恢复按固定算。
 */
import type { ActContext, KitContext } from "../types.ts";
import type { Unit } from "../unit.ts";
import { Kit } from "./base.ts";

export type Trigger =
  | "battleStart"   // 战斗开始的行迹和被动
  | "technique"     // 秘技，只在开启秘技时触发
  | "turnStart"
  | "turnEnd"
  | "basic"         // 自己施放普攻后
  | "skill"         // 自己施放战技后
  | "ultimate";     // 自己施放终结技时

export interface Rule {
  on: Trigger;
  /** 星魂门槛。 */
  eidolon?: number;
  /** true 只在强化版生效，false 只在原版生效（3.4 老角色加强）；不写两版都生效。 */
  enhanced?: boolean;
  when?: (kit: SimpleKit) => boolean;
  do: (kit: SimpleKit) => void;
}

export interface CharacterSpec {
  id: string;
  /** 依赖敌方或概率、这一版不计入的机制，会写进结果提示。 */
  notSimulated?: string[];
  rules?: Rule[];
  /** 这名角色的结算需要的自定义初始化。 */
  setup?: (kit: SimpleKit) => void;
}

export class SimpleKit extends Kit {
  readonly id: string;
  readonly enemyDependent: string[];
  private readonly rules: Rule[];
  private readonly spec: CharacterSpec;

  constructor(spec: CharacterSpec) {
    super();
    this.id = spec.id;
    this.enemyDependent = spec.notSimulated ?? [];
    this.rules = spec.rules ?? [];
    this.spec = spec;
  }

  protected setup(): void {
    this.spec.setup?.(this);
  }

  private fire(trigger: Trigger): void {
    for (const rule of this.rules) {
      if (rule.on !== trigger) continue;
      if (rule.eidolon !== undefined && this.self.eidolon < rule.eidolon) continue;
      if (rule.enhanced !== undefined && this.self.enhanced !== rule.enhanced) continue;
      if (rule.when && !rule.when(this)) continue;
      rule.do(this);
    }
  }

  onBattleStart(): void { this.fire("battleStart"); }
  onTechnique(): void { this.fire("technique"); }
  onTurnStart(): void { this.fire("turnStart"); }
  onTurnEnd(): void { this.fire("turnEnd"); }
  onUltimate(): void { this.fire("ultimate"); }

  afterAct({ kind }: ActContext): void {
    this.fire(kind);
  }

  // ---- 规则里常用的动作。每个都在时间轴上留一条说明，用户能看到发生了什么。 ---- //

  note(label: string, detail: string): void {
    this.engine.record("note", this.self, label, { details: [detail] });
  }

  gain(label: string, amount: number, options: { fixed?: boolean } = {}): void {
    this.note(label, `能量 +${amount}${options.fixed ? "（固定）" : ""}`);
    this.engine.gainEnergy(this.self, amount, { fixed: options.fixed, reason: label });
  }

  gainFor(label: string, target: Unit, amount: number, options: { fixed?: boolean } = {}): void {
    this.note(label, `${target.name} 能量 +${amount}${options.fixed ? "（固定）" : ""}`);
    this.engine.gainEnergy(target, amount, { fixed: options.fixed, reason: label });
  }

  /**
   * 技能给队友恢复能量（停云、藿藿、知更鸟•晴歌的终结技这类）。用特殊资源开大的角色（【残梦】【飞黄】【隐藏分】等）
   * 不吃能量恢复（攻略实测：停云、藿藿的终结技不会增加【残梦】）；白厄改为获得 1 点【火种】（行迹【身承炎炬万千】）。
   */
  restoreFor(label: string, target: Unit, amount: number, options: { fixed?: boolean } = {}): void {
    if (target.energyType === "standard") {
      this.gainFor(label, target, amount, options);
    } else if (target.id === "1408" && target !== this.self) {
      this.note(label, `${target.name} 受到队友的能量恢复：行迹【身承炎炬万千】【火种】+1`);
      this.engine.gainEnergy(target, 1, { fixed: true, reason: "身承炎炬万千" });
    } else {
      this.note(label, `${target.name} 用${target.energyName ? `【${target.energyName}】` : "特殊资源"}开大，不吃能量恢复`);
    }
  }

  advanceSelf(label: string, pct: number): void {
    this.note(label, `自身行动提前 ${pct}%`);
    this.engine.advance(this.self, pct, { selfSource: true });
  }

  advanceUnit(label: string, target: Unit, pct: number): void {
    this.note(label, `${target.name} 行动提前 ${pct}%`);
    this.engine.advance(target, pct, { source: this.self });
  }

  advanceAll(label: string, pct: number): void {
    this.note(label, `我方全体行动提前 ${pct}%`);
    this.engine.advanceAllies(this.self, pct);
  }

  speed(label: string, target: Unit, kind: "pct" | "flat", value: number, turns: number | null): void {
    const unit = kind === "pct" ? "%" : " 点";
    const lasting = turns === null ? "" : `，持续 ${turns} 回合`;
    this.note(label, `${target.name} 速度 +${value}${unit}${lasting}`);
    this.engine.addSpeedBuff(target, { kind, value, turns, label });
  }

  speedTeam(label: string, kind: "pct" | "flat", value: number, turns: number | null): void {
    for (const unit of this.engine.units) this.speed(label, unit, kind, value, turns);
  }

  /** 用户指定的目标；没指定时默认站位，不会选到自己，除非只有自己一人。 */
  target(): Unit {
    return this.engine.unitAt(this.engine.resolveTarget(this.self)) ?? this.self;
  }

  /** 不是自己时才返回目标（「对自身施放时无法触发」）。 */
  otherTarget(): Unit | null {
    const target = this.target();
    return target === this.self ? null : target;
  }

  /** 这次技能选中的队友：发 allyTargeted（白厄的【火种】），返回目标（选到自己时为 null）。每次施放只调一次。 */
  targeted(ability: string): Unit | null {
    const target = this.otherTarget();
    this.engine.targetAlly(this.self, target, ability);
    return target;
  }
}

export const simple = (spec: CharacterSpec) => (): SimpleKit => new SimpleKit(spec);

export type { KitContext };
