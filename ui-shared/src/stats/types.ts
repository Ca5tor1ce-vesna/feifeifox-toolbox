/** 「角色与遗器」的统一内部格式（1.2）。各种导入（扫描文件、Enka、战绩分享图、手填）都先转成这几个类型。 */

/** 面板上的属性。dmgAll（全属性伤害）和 healTaken（受治疗加成）游戏面板不单独显示，但要记下来给以后的伤害计算用。 */
export type StatKey =
  | "hp" | "atk" | "def" | "spd"
  | "critRate" | "critDmg" | "breakEffect" | "elation" | "healBoost" | "err" | "ehr" | "effectRes"
  | "dmgPhysical" | "dmgFire" | "dmgIce" | "dmgLightning" | "dmgWind" | "dmgQuantum" | "dmgImaginary"
  | "dmgAll" | "healTaken";

/**
 * 属性怎么叠：
 * - flat：固定值，加在最后（生命 +705）；
 * - pct：按白值的百分比（生命 +4.3%）；
 * - add：直接相加的比例（暴击率 +5.4%、能量恢复效率 +19.4%）；
 * - base：加进白值（阿哈专武的「基础速度 +12」）。
 */
export type StatKind = "flat" | "pct" | "add" | "base";

const add = (stat: StatKey) => ({ stat, kind: "add" as const });

/** 资料和 Enka 里的属性名 → 面板属性。带 Base 后缀和不带的含义一样（来源不同），都直接相加。 */
export const PROPERTY_TO_STAT: Readonly<Record<string, { stat: StatKey; kind: StatKind }>> = {
  HPDelta: { stat: "hp", kind: "flat" }, HPAddedRatio: { stat: "hp", kind: "pct" },
  AttackDelta: { stat: "atk", kind: "flat" }, AttackAddedRatio: { stat: "atk", kind: "pct" },
  DefenceDelta: { stat: "def", kind: "flat" }, DefenceAddedRatio: { stat: "def", kind: "pct" },
  SpeedDelta: { stat: "spd", kind: "flat" }, SpeedAddedRatio: { stat: "spd", kind: "pct" }, BaseSpeed: { stat: "spd", kind: "base" },
  CriticalChance: add("critRate"), CriticalChanceBase: add("critRate"),
  CriticalDamage: add("critDmg"), CriticalDamageBase: add("critDmg"),
  BreakDamageAddedRatio: add("breakEffect"), BreakDamageAddedRatioBase: add("breakEffect"),
  HealRatio: add("healBoost"), HealRatioBase: add("healBoost"),
  SPRatio: add("err"), SPRatioBase: add("err"),
  StatusProbability: add("ehr"), StatusProbabilityBase: add("ehr"),
  StatusResistance: add("effectRes"), StatusResistanceBase: add("effectRes"),
  ElationDamageAddedRatio: add("elation"), ElationDamageAddedRatioBase: add("elation"),
  PhysicalAddedRatio: add("dmgPhysical"), FireAddedRatio: add("dmgFire"), IceAddedRatio: add("dmgIce"),
  ThunderAddedRatio: add("dmgLightning"), WindAddedRatio: add("dmgWind"), QuantumAddedRatio: add("dmgQuantum"),
  ImaginaryAddedRatio: add("dmgImaginary"), AllDamageTypeAddedRatio: add("dmgAll"),
  HealTakenRatio: add("healTaken"),
};

export type Slot = "HEAD" | "HAND" | "BODY" | "FOOT" | "NECK" | "OBJECT";

/** 一件遗器。count 是这条副词条一共出现了几次（初始 1 次 + 强化命中次数），step 是这几次的档位加起来。 */
export interface RelicPiece {
  /** 存档里自己发的编号。 */
  id: string;
  /** 遗器编号（relic_pieces.json 的键），决定套装、部位、稀有度。 */
  pieceId: string;
  level: number;
  /** 主词条在主词条组里的编号。 */
  mainAffix: string;
  subAffixes: { affix: string; count: number; step: number }[];
  /** 穿在哪个角色身上，没穿是 null。 */
  equippedBy: string | null;
}

export interface RosterCharacter {
  id: string;
  level: number;
  /** 突破阶段 0~6。 */
  promotion: number;
  eidolon: number;
  lightcone: { id: string; level: number; promotion: number; superimpose: number } | null;
  /** 点亮的属性行迹节点（7 位编号）。 */
  traces: string[];
  /** 哪些项是按默认值填的（level、traces、promotion…），页面上标「按默认」。 */
  defaults: string[];
}

export interface Prop { type: string; value: number }
export type Pair = [number, number];

export interface CharacterStats {
  id: string;
  name: string;
  /** 命途（英文，和光锥的 path 对得上才算光锥被动）。 */
  path: string;
  element: string;
  promotions: { hp: Pair; atk: Pair; def: Pair; spd: number; critRate: number; critDmg: number }[];
  statTraces: Record<string, Prop[]>;
}

export interface ConeStats {
  id: string;
  name: string;
  path: string;
  promotions: { hp: Pair; atk: Pair; def: Pair }[];
  /** 下标是叠影 0~4。 */
  panelProps: Prop[][];
}

export interface SetStats {
  id: string;
  name: string;
  /** [2 件效果, 4 件效果]，位面饰品只有 2 件。 */
  properties: Prop[][];
}

export interface PieceInfo { setId: string; slot: Slot; rarity: number; mainGroup: string; subGroup: string; /** 单件遗器名（识图按它认）。 */ name?: string }
export interface AffixInfo { type: string; base: number; step: number }

/** 面板计算和各种导入共用的查表，由 data.ts 的 buildStatData 建。 */
export interface StatData {
  characters: Map<string, CharacterStats>;
  lightcones: Map<string, ConeStats>;
  relicSets: Map<string, SetStats>;
  pieces: Map<string, PieceInfo>;
  mainAffixes: Record<string, Record<string, AffixInfo>>;
  subAffixes: Record<string, Record<string, AffixInfo>>;
}

/** 存档 honkai-star-rail/roster：一个账号的角色和遗器库。 */
export interface RosterSave {
  version: 1;
  /** exe 里查过的 UID；网页版留空。 */
  uid: string;
  importedAt: string;
  source: "scanner-v4" | "freesr" | "enka" | "record-card" | "manual";
  characters: Record<string, RosterCharacter>;
  relics: RelicPiece[];
}

export const emptyRoster = (): RosterSave => ({ version: 1, uid: "", importedAt: "", source: "manual", characters: {}, relics: [] });
