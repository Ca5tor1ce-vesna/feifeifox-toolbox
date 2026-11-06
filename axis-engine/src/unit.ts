import type { ActionKind, AssistPreference, CharacterKit, EnergyType, SpeedBuff, UnitGear, UnitSpec } from "./types.ts";

export const DIST_BASE = 10000;

/** 轴上任何会跑条的东西：角色、召唤物、倒计时。 */
export interface Actor {
  name: string;
  remDist: number;
  /** 自己回合内触发的自身拉条（%），回合结束重置距离后再扣。 */
  pendingAdvance: number;
  inTurn: boolean;
  /** 暂停时不消耗距离，也不会被选为下一个行动者。 */
  paused: boolean;
  speed(): number;
}

export interface SummonSpec {
  name: string;
  speed: () => number;
  remDist?: number;
  /** 自己管回合状态和距离（【阿哈时刻】的额外回合不重置距离）。 */
  selfManaged?: boolean;
  /** 默认普通召唤物。「我方忆灵」「其他目标行动」这类效果靠它区分。 */
  role?: SummonRole;
  onTurn: (actor: SummonActor) => void;
}

export type SummonRole = "summon" | "memosprite" | "countdown";

export interface SummonActor extends Actor {
  selfManaged: boolean;
  role: SummonRole;
  onTurn: (actor: SummonActor) => void;
}

export class Unit implements Actor {
  readonly id: string;
  readonly name: string;
  readonly slot: number;
  readonly kit: CharacterKit | undefined;
  readonly baseSpd: number;
  readonly lcBaseSpd: number;
  readonly traceSpd: number;
  readonly pctSpd: number;
  readonly flatSpd: number;
  readonly maxEnergy: number;
  /** 终结技消耗。昔涟第二次起只要 12，所以不是只读。 */
  ultCost: number;
  readonly manualUltimates: readonly number[];
  /** 已到指定动数、还没放出来的手动开大。 */
  manualPending = 0;
  /** 这名角色的终结技算一次攻击，由引擎发出攻击事件。 */
  readonly ultimateAttacks: boolean;
  /** 能存到多少，默认等于能量上限。可溢出的角色（Saber、白厄）会调高。 */
  energyCap: number;
  readonly energyType: EnergyType;
  readonly energyName: string;
  readonly err: number;
  readonly initAdv: number;
  readonly rotation: ActionKind;
  readonly script: readonly ActionKind[];
  readonly energyGains: Record<ActionKind | "ultimate", number>;
  readonly eidolon: number;
  /** 按强化版算（3.4 老角色加强）；没有强化版的角色恒为 false。 */
  readonly enhanced: boolean;
  readonly assist: AssistPreference;
  /** 这一动被别的东西用掉了（写原因），轮到行动时只记一笔、不出招。非开拓同行用助战技时会这样。 */
  skipAction: string | null = null;
  readonly path: string;
  readonly elation: boolean;
  readonly targetSlot: number | null;
  readonly equip: Readonly<Record<string, boolean>>;
  readonly gear: UnitGear | undefined;
  /** 忆灵在场。由角色模块通过 engine.setMemosprite 维护。 */
  memosprite = false;

  remDist = DIST_BASE;
  pendingAdvance = 0;
  inTurn = false;
  paused = false;
  castingUltimate = false;
  /** 不能给其他队友拉条时写原因（知更鸟•晴歌的【特邀嘉宾】），null 表示不受限。给自己和自己的召唤物拉条不受影响。 */
  allyAdvanceBlock: string | null = null;
  energy: number;
  energyTotal = 0;
  /** 战斗中变化的能量恢复效率（知更鸟专武的【歌咏】）。 */
  errBonus = 0;
  buffs: SpeedBuff[] = [];
  actions = 0;
  turns = 0;
  ultimates = 0;
  extraTurns = 0;
  followUps = 0;
  initialSpeed = 0;
  /** 实际装配的真实属性；null 时看属性的条件按满足算。 */
  measured: { elation: number } | null = null;
  notes: string[] = [];

  /** 由引擎注入：队伍或模块给的额外速度。 */
  speedOf: (unit: Unit) => number = () => 0;

  constructor(slot: number, spec: UnitSpec) {
    this.id = spec.id;
    this.name = spec.name;
    this.slot = slot;
    this.kit = spec.kit;
    this.baseSpd = spec.baseSpd;
    this.lcBaseSpd = spec.lcBaseSpd ?? 0;
    this.traceSpd = spec.traceSpd ?? 0;
    this.pctSpd = spec.pctSpd ?? 0;
    this.flatSpd = spec.flatSpd ?? 0;
    this.maxEnergy = spec.maxEnergy;
    this.ultCost = spec.ultCost ?? spec.maxEnergy;
    this.manualUltimates = spec.manualUltimates ?? [];
    this.ultimateAttacks = spec.ultimateAttacks ?? false;
    this.energyCap = spec.maxEnergy;
    this.energyType = spec.energyType ?? "standard";
    this.energyName = spec.energyName ?? "能量";
    this.err = spec.err ?? 0;
    this.measured = spec.measured ?? null;
    this.initAdv = spec.initAdv ?? 0;
    this.rotation = spec.rotation ?? "skill";
    this.script = spec.script ?? [];
    this.energyGains = { basic: 20, skill: 30, ultimate: 5, ...spec.energyGains };
    this.eidolon = spec.eidolon ?? 0;
    this.enhanced = spec.enhanced ?? false;
    this.assist = spec.assist ?? "auto";
    this.path = spec.path ?? "";
    this.elation = spec.elation ?? false;
    this.targetSlot = spec.targetSlot ?? null;
    this.equip = spec.equipment ?? {};
    this.gear = spec.gear;
    this.energy = spec.initialEnergy ?? (this.energyType === "standard" ? spec.maxEnergy * 0.5 : 0);
  }

  speed(): number {
    return this.speedOf(this);
  }

  /** 当前的能量恢复效率（%）：面板、角色机制和装备增益之和。 */
  totalErr(): number {
    return this.buffs.reduce((sum, buff) => (buff.kind === "err" ? sum + buff.value : sum), this.err + this.errBonus);
  }
}
