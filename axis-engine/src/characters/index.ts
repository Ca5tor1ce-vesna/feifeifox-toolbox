import type { CharacterKit } from "../types.ts";
import { AhaKit } from "./aha.ts";
import { AventurineKit } from "./aventurine.ts";
import { FeiyingKit } from "./feiying.ts";
import { PearlKit } from "./pearl.ts";
import { RobinKit } from "./robin.ts";
import { SandKit } from "./sand.ts";
import { SilverWolf999Kit } from "./silverwolf999.ts";
import { SIMPLE_KITS } from "./simple-roster.ts";
import { SparxieKit } from "./sparxie.ts";
import { STATEFUL_KITS } from "./stateful-roster.ts";
import { SUMMON_KITS } from "./summon-roster.ts";
import { SundayKit } from "./sunday.ts";
import { TrailblazerElationKit } from "./trailblazer-elation.ts";
import { YaoguangKit } from "./yaoguang.ts";

/** 已写好机制的角色。每场战斗新建实例，因为角色状态存在模块里。 */
export const KITS: Record<string, () => CharacterKit> = {
  1511: () => new AhaKit(),
  1503: () => new PearlKit(),
  1513: () => new SandKit(),
  1304: () => new AventurineKit(),
  1502: () => new YaoguangKit(),
  1501: () => new SparxieKit(),
  8009: () => new TrailblazerElationKit(),
  1505: () => new FeiyingKit(),
  1506: () => new SilverWolf999Kit(),
  1313: () => new SundayKit(),
  1309: () => new RobinKit(),
  ...SIMPLE_KITS,
  ...STATEFUL_KITS,
  ...SUMMON_KITS,
};

export const KIT_IDS = Object.keys(KITS);

/**
 * 测试服包（beta/，不进公开仓库）在这里补上还没进正式服的角色。正服构建不调用它。
 * 已经有的 id 不覆盖，免得测试服包悄悄改掉正服角色的机制。
 */
export function registerKits(extra: Record<string, () => CharacterKit>): void {
  for (const [id, create] of Object.entries(extra)) {
    if (KITS[id]) throw new Error(`角色 ${id} 已经有模块了，测试服包不能覆盖`);
    KITS[id] = create;
    KIT_IDS.push(id);
  }
}

export const hasKit = (id: string): boolean => id in KITS;
