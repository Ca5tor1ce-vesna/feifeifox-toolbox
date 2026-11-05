/**
 * 把「我的配装」转成排轴页的成员。存档格式不变。
 *
 * 配速查询算出的 S0 已经含光锥、套装和用户勾选的效果，这里的光锥和套装由引擎自己结算，
 * 所以只把差额记成固定速度：差额 = S0 - 引擎开战前的速度。这样读进来的面板速度和存档一致，
 * 也不会把同一件装备算两遍。
 */
import { createBattle, type GameData } from "../../axis-engine/src/battle.ts";
import { newMember, toMemberInput, type CatalogItem, type PageMember } from "./model.ts";

export interface SavedBuild {
  name: string;
  config: {
    lightconeId?: string | number;
    superimpose?: number;
    eidolon?: number;
    relic?: { fourPieceId?: string | number; ornamentIds?: (string | number)[] };
    advance?: { custom?: number };
    aha?: { err?: number; initialEnergy?: number | string | null; rotation?: string };
  };
}

export interface ResolvedBuild {
  entry: SavedBuild;
  result: { speed: { final: number } };
}

const idOf = (value: string | number | undefined): string => (value === undefined || value === null ? "" : String(value));

export function memberFromBuild(id: string, resolved: ResolvedBuild, game: GameData, catalog: { lightcones: CatalogItem[]; relicSets: CatalogItem[] }): PageMember {
  const { config, name } = resolved.entry;
  const member = newMember(id);
  member.buildName = name;
  member.eidolon = Number(config.eidolon ?? 0);
  member.err = Number(config.aha?.err ?? 0);
  const energy = config.aha?.initialEnergy;
  member.initialEnergy = energy === undefined || energy === null || energy === "" ? null : Number(energy);
  member.initAdv = Number(config.advance?.custom ?? 0);
  if (config.aha?.rotation === "skill" || config.aha?.rotation === "basic") member.rotation = config.aha.rotation;
  const coneId = idOf(config.lightconeId);
  if (coneId && catalog.lightcones.some((item) => String(item.id) === coneId)) {
    member.lightconeId = coneId;
    member.superimpose = Number(config.superimpose ?? 1);
  }
  const hasSet = (setId: string) => catalog.relicSets.some((item) => String(item.id) === setId);
  const cavern = idOf(config.relic?.fourPieceId);
  if (cavern && hasSet(cavern)) member.cavernId = cavern;
  const ornament = idOf(config.relic?.ornamentIds?.[0]);
  if (ornament && hasSet(ornament)) member.ornamentId = ornament;
  const before = createBattle({ team: [toMemberInput(member)], maxAV: 1 }, game).units[0].speed();
  member.flatSpd = Math.round((Number(resolved.result.speed.final) - before) * 1e4) / 1e4;
  return member;
}
