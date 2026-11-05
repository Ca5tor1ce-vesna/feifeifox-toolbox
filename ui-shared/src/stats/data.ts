/** 把模块数据文件（characters、lightcones、relic_sets、relic_pieces）建成面板计算用的查表。 */
import type { CharacterStats, ConeStats, PieceInfo, SetStats, StatData } from "./types.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
const byId = <T>(rows: any, pick: (row: any) => T): Map<string, T> =>
  new Map((Array.isArray(rows) ? rows : []).map((row: any) => [String(row.id), pick(row)]));

export function buildStatData(characters: unknown, lightcones: unknown, relicSets: unknown, relicPieces: unknown): StatData {
  const pieces = (relicPieces as any) ?? {};
  return {
    characters: byId<CharacterStats>(characters, (c) => ({
      id: String(c.id), name: String(c.name), path: String(c.path ?? ""), element: String(c.element ?? ""), promotions: c.promotions ?? [], statTraces: c.statTraces ?? {},
    })),
    lightcones: byId<ConeStats>(lightcones, (l) => ({ id: String(l.id), name: String(l.name), path: String(l.path ?? ""), promotions: l.promotions ?? [], panelProps: l.panelProps ?? [] })),
    relicSets: byId<SetStats>(relicSets, (s) => ({ id: String(s.id), name: String(s.name), properties: s.properties ?? [] })),
    pieces: new Map(Object.entries<PieceInfo>(pieces.pieces ?? {})),
    mainAffixes: pieces.mainAffixes ?? {},
    subAffixes: pieces.subAffixes ?? {},
  };
}
