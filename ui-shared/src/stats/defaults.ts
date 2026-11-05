/** 缺信息时的默认值：80 级、突破 6、行迹全点、没穿光锥。defaults 记下哪些是默认的，页面上标「按默认」。 */
import type { RosterCharacter, StatData } from "./types.ts";

export function defaultCharacter(id: string, data: StatData): RosterCharacter {
  const info = data.characters.get(String(id));
  if (!info) throw new Error(`角色 ${id} 不在数据里，可能是新角色，请更新工具箱。`);
  return {
    id: info.id,
    level: 80,
    promotion: 6,
    eidolon: 0,
    lightcone: null,
    traces: Object.keys(info.statTraces),
    defaults: ["level", "promotion", "traces"],
  };
}
