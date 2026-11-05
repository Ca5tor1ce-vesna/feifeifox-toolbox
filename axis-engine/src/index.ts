export { createBattle } from "./battle.ts";
export type { BattleInput, GameData, MemberInput } from "./battle.ts";
export { KIT_IDS } from "./characters/index.ts";
export { AxisEngine } from "./engine.ts";
export { legacyCatalog, runLegacy, simulateLegacy, thresholdLegacy } from "./legacy.ts";
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
