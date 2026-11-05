/** 「读取我的配装」：用配速查询存下的配置，按配速查询同一套算法（speed-ui/src/calc.ts）算出这名角色的实际速度。
 *
 * 以前由后端 axis/api.py 的 resolve_build 调 Python 的 plan 算，2026-11-04 改到浏览器里算（计算不再依赖 Python）。
 * calc.ts 和 Python 版逐字段对拍过（tests/pages/speed-oracle.test.ts），结果一样。
 */
import { createApi } from "../../speed-ui/src/calc.ts";
import type { ResolvedBuild, SavedBuild } from "./build.ts";

export interface SpeedData {
  characters: unknown;
  lightcones: unknown;
  relicSets: unknown;
  /** modes.json 原样（含 modes、cycles、targets）。 */
  modes: unknown;
}

export function makeBuildResolver(data: SpeedData, readPresets: () => Promise<Record<string, SavedBuild> | undefined>) {
  let calc: ReturnType<typeof createApi> | null = null;
  return async (characterId: unknown): Promise<ResolvedBuild> => {
    const id = String(characterId ?? "");
    const entry = (await readPresets())?.[id];
    if (!entry) throw new Error("该角色尚未保存配装，请先到配速查询保存。");
    calc ??= createApi({ characters: data.characters, lightcones: data.lightcones, relic_sets: data.relicSets, modes: data.modes, dataInfo: {} });
    // 和以前发给后端时一样先过一遍 JSON（比如 NaN 变成 null）。
    const payload = JSON.parse(JSON.stringify({ ...entry.config, characterId: id }));
    return { entry, result: calc.call("plan", payload) };
  };
}
