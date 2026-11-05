/**
 * 「实际装配」→ 排轴页的成员（1.2）：读「角色与遗器」存档里的角色和他身上的遗器。
 *
 * 和「读取我的配装」（build.ts）一样，光锥和套装交给引擎自己结算；速度按面板对齐：
 * 差额 = 面板速度 − 引擎开战前的速度，记成固定速度。能量恢复效率只记行迹和遗器词条给的部分，
 * 光锥和套装给的引擎会自己加（光锥被动里的能量恢复效率不在面板上，但战斗里生效）。
 * 欢愉度记成 measured，翁瓦克、神的瞬息欢愉这类看属性的条件按它判断。
 */
import { createBattle, type GameData } from "../../axis-engine/src/battle.ts";
import { computePanel } from "../../ui-shared/src/stats/panel.ts";
import type { RelicPiece, RosterCharacter, StatData } from "../../ui-shared/src/stats/types.ts";
import { newMember, toMemberInput, type CatalogItem, type PageMember } from "./model.ts";

export function memberFromRoster(
  character: RosterCharacter,
  relics: RelicPiece[],
  stats: StatData,
  game: GameData,
  catalog: { lightcones: CatalogItem[]; relicSets: CatalogItem[] },
): PageMember {
  const member = newMember(character.id);
  member.buildName = "实际装配";
  member.eidolon = character.eidolon;
  const info = stats.characters.get(character.id);
  const cone = character.lightcone ? stats.lightcones.get(character.lightcone.id) : null;
  if (cone && info && cone.path === info.path && catalog.lightcones.some((item) => String(item.id) === cone.id)) {
    member.lightconeId = cone.id;
    member.superimpose = character.lightcone!.superimpose;
  }
  const counts = new Map<string, number>();
  for (const relic of relics) {
    const setId = stats.pieces.get(relic.pieceId)?.setId;
    if (setId) counts.set(setId, (counts.get(setId) ?? 0) + 1);
  }
  const known = (setId: string): boolean => catalog.relicSets.some((item) => String(item.id) === setId);
  member.cavernId = [...counts.entries()].find(([setId, n]) => !setId.startsWith("3") && n >= 4 && known(setId))?.[0] ?? "";
  member.ornamentId = [...counts.entries()].find(([setId, n]) => setId.startsWith("3") && n >= 2 && known(setId))?.[0] ?? "";

  const panel = computePanel(character, relics, stats);
  const before = createBattle({ team: [toMemberInput(member)], maxAV: 1 }, game).units[0];
  member.flatSpd = Math.round((panel.spd.total - before.speed()) * 1e4) / 1e4;
  const ownErr = panel.err.sources.filter((s) => !s.label.startsWith("光锥·") && !/·[24] 件$/.test(s.label)).reduce((sum, s) => sum + s.value, 0);
  member.err = Math.round(ownErr * 100 * 1e4) / 1e4;
  member.measured = { elation: panel.elation.total };
  return member;
}
