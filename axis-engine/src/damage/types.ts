/** 伤害系统的接口。这里只定数据怎么进引擎、结果怎么出来；乘区和倍率的数值来自资料，不写在代码里。 */

export type DamageElement = "Physical" | "Fire" | "Ice" | "Thunder" | "Wind" | "Quantum" | "Imaginary";

/** 面板属性，键和 ui-shared 的 StatKey 一样（atk、critRate…）。引擎不依赖面板计算，由调用方算好传进来。 */
export type CombatStats = Readonly<Record<string, number>>;

export interface EnemySpec {
  level: number;
  weakness: readonly DamageElement[];
  /** 各属性抗性，比例（0.2 = 20%）。没写的属性由伤害模型决定怎么算。 */
  resistance: Readonly<Partial<Record<DamageElement, number>>>;
  broken?: boolean;
}

/** 一次可能造成伤害的动作。kind 是 engine.attack 的种类，也是倍率表的键。 */
export interface DamageHit {
  index: number;
  av: number;
  slot: number;
  unitId: string;
  unitName: string;
  kind: string;
  /** 在额外回合里打出的。 */
  extra: boolean;
  /** attack：攻击事件。ultimate：不算攻击事件的终结技。other：模块自己记的（持续伤害、击破等）。 */
  source: "attack" | "ultimate" | "other";
  /** 对应时间轴的第几条；时间轴截断后是 null。 */
  event: number | null;
  /** 这一下的敌人数量，算群攻时用。 */
  enemyCount: number;
  eidolon: number;
}

/**
 * 战斗中有时效的乘区加成。holder 是谁吃到：站位、全队或敌人。
 * clock 是按谁的回合结束计时的站位，null 表示不自动过期，由添加它的模块自己移除。
 */
export interface ZoneBuff {
  id: string;
  zone: string;
  value: number;
  holder: number | "team" | "enemy";
  clock: number | null;
  turns: number | null;
  label: string;
}

/** 算这一下时看得到的东西。攻击者的面板、敌人没传时是 null，模型自己决定算不算。 */
export interface DamageContext {
  attacker: CombatStats | null;
  enemy: EnemySpec | null;
  /** 这一刻对这名攻击者生效的加成（自己的、全队的、敌人身上的）。 */
  buffs: readonly ZoneBuff[];
}

/** 一个乘区的结果。terms 是这个乘区由哪几项算出来的，页面展开明细时用。 */
export interface ZoneFactor {
  zone: string;
  factor: number;
  terms?: readonly { label: string; value: number }[];
}

export interface DamageOutcome {
  zones: readonly ZoneFactor[];
  /** 这一下的期望伤害（已经算上目标数量）。 */
  expected: number;
}

/** 伤害公式都放在模型里。返回 null 表示这一下没有资料：记进 missing，不当成 0。 */
export interface DamageModel {
  evaluate: (hit: DamageHit, context: DamageContext) => DamageOutcome | null;
}

export interface DamageOptions {
  /** 不给时只记录攻击，不算数值。 */
  model?: DamageModel;
  enemy?: EnemySpec;
  /** 角色 id → 面板。 */
  stats?: Readonly<Record<string, CombatStats>>;
}

export interface DamageRow extends DamageHit {
  outcome: DamageOutcome | null;
}

export interface DamageUnitTotal {
  slot: number;
  unitId: string;
  unitName: string;
  hits: number;
  total: number;
}

export interface DamageReport {
  rows: DamageRow[];
  /** 没给模型、或一下都算不出来时是 null。 */
  total: number | null;
  byUnit: DamageUnitTotal[];
  /** 没有资料的攻击，按角色和种类合并。不为空时 total 偏低。 */
  missing: { unitId: string; unitName: string; kind: string; count: number }[];
}

/** 倍率的一段。ratio 按技能等级排，第 1 个是 1 级；hits 是每段伤害的占比，加起来是 1。 */
export interface SkillPart {
  stat: string;
  ratio: readonly number[];
  target: "main" | "adjacent" | "all" | "random";
  hits?: readonly number[];
}

/** 一条加成。value 是列表时按等级或叠影排。when 写触发条件，页面和模型都要看，所以写清楚。 */
export interface DamageModifier {
  source: string;
  zone: string;
  value: number | readonly number[];
  to?: "self" | "team" | "target" | "enemy";
  turns?: number | null;
  maxStacks?: number;
  when?: string;
  note?: string;
}

/** 资料文件的格式。skills：角色 id → 攻击种类 → 这一下的几段倍率；parts 是空列表表示确认没有伤害。 */
export interface DamageData {
  version: 1;
  zones: readonly { id: string; name: string }[];
  skills: Readonly<Record<string, Readonly<Record<string, { parts: readonly SkillPart[] }>>>>;
  modifiers?: readonly DamageModifier[];
}
