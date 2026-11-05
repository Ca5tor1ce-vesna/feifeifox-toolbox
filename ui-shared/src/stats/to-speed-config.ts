/**
 * 实际装配 → 配速查询的配置（「用实际装配填入」）。只做照抄和归类：光锥、叠影、星魂；同一套隧洞遗器凑满 4 件填 4 件套，
 * 位面饰品凑满 2 件填外圈；鞋的主词条是速度就开速度鞋；所有副词条速度加起来。
 * 配速查询自己的算法和面板不完全一样（比如行迹按全点算、速度鞋按 25 整），差额由 shell/src/roster-actions.ts 的
 * speedConfigFromRoster 用「其它固定速度」补齐，填完后配速查询的初始速度就等于面板速度。
 */
import { computePanel } from "./panel.ts";
import { relicStats } from "./relic.ts";
import type { RelicPiece, RosterCharacter, StatData } from "./types.ts";

/** 配速查询 plan 的配置里和装备有关的部分（完整结构见 speed-ui/src/plan-state.ts）。 */
export interface SpeedConfig {
  lightconeId: string;
  superimpose: number;
  eidolon: number;
  relic: {
    speedBoots: boolean;
    fourPieceId: string;
    fourPieceUlts: number;
    ultTargetsAlly: boolean;
    ornamentIds: [string, string];
    substatSpeed: number;
    customPct: number;
    customFlat: number;
  };
}

export function toSpeedConfig(character: RosterCharacter, relics: RelicPiece[], data: StatData): { config: SpeedConfig; panelSpeed: number; notes: string[] } {
  const notes: string[] = [];
  const info = data.characters.get(character.id);
  const cone = character.lightcone ? data.lightcones.get(character.lightcone.id) : null;
  let lightconeId = "";
  if (cone && info && cone.path === info.path) lightconeId = cone.id;
  else if (cone) notes.push(`${cone.name}和角色命途不同，配速查询里不填光锥（被动本来也不生效）。`);

  const counts = new Map<string, number>();
  let speedBoots = false;
  let substatSpeed = 0;
  for (const relic of relics) {
    const piece = data.pieces.get(relic.pieceId);
    if (!piece) continue;
    counts.set(piece.setId, (counts.get(piece.setId) ?? 0) + 1);
    const { main, subs } = relicStats(relic, data);
    if (piece.slot === "FOOT" && main.type === "SpeedDelta") speedBoots = true;
    for (const sub of subs) if (sub.type === "SpeedDelta") substatSpeed += sub.value;
  }
  const isPlanar = (setId: string): boolean => setId.startsWith("3");
  const fourPieceId = [...counts.entries()].find(([setId, n]) => !isPlanar(setId) && n >= 4)?.[0] ?? "";
  const ornamentId = [...counts.entries()].find(([setId, n]) => isPlanar(setId) && n >= 2)?.[0] ?? "";

  return {
    config: {
      lightconeId,
      superimpose: character.lightcone?.superimpose ?? 1,
      eidolon: character.eidolon,
      relic: {
        speedBoots, fourPieceId, fourPieceUlts: 0, ultTargetsAlly: false, ornamentIds: [ornamentId, ""],
        substatSpeed: Math.round(substatSpeed * 1e4) / 1e4, customPct: 0, customFlat: 0,
      },
    },
    panelSpeed: computePanel(character, relics, data).spd.total,
    notes,
  };
}
