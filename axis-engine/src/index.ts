export { createBattle } from "./battle.ts";
export type { BattleInput, GameData, MemberInput } from "./battle.ts";
export { KIT_IDS } from "./characters/index.ts";
export { checkDamageData, zoneProduct } from "./damage/data.ts";
export { DamageLedger } from "./damage/ledger.ts";
export type {
  CombatStats,
  DamageContext,
  DamageData,
  DamageElement,
  DamageHit,
  DamageModel,
  DamageModifier,
  DamageOptions,
  DamageOutcome,
  DamageReport,
  DamageRow,
  EnemySpec,
  SkillPart,
  ZoneBuff,
  ZoneFactor,
} from "./damage/types.ts";
export { AxisEngine } from "./engine.ts";
export { legacyCatalog, runLegacy, simulateLegacy, thresholdLegacy } from "./legacy.ts";
export { SKILL_POINT_INITIAL, SKILL_POINT_MAX, SkillPoints } from "./modules/skill-points.ts";
export { fmt } from "./format.ts";
export { DIST_BASE, Unit } from "./unit.ts";
export type { Actor, SummonActor, SummonSpec } from "./unit.ts";
export type {
  ActContext,
  ActionKind,
  AxisConfig,
  AxisEvent,
  AxisEvents,
  AxisResult,
  BattleModule,
  CharacterKit,
  CycleStructure,
  EnergyType,
  KitContext,
  RecordOptions,
  SpeedBuff,
  UnitSpec,
  UnitSummary,
  UnsupportedMechanic,
} from "./types.ts";
