/**
 * Enka 的展柜数据（exe 的 UID 查询返回的 JSON）→ 统一的内部格式。只做格式转换，不碰存档。
 *
 * Enka 字段：avatarDetailList[].{avatarId, level, promotion, rank（星魂）, equipment{tid, level, promotion, rank（叠影）},
 * relicList[]{tid, type, level, mainAffixId, subAffixList[]{affixId, cnt, step}}, skillTreeList[]{pointId, level}}。
 * 值为 0 的字段 Enka 会省略（比如 step、promotion），这里一律按 0 补。
 */
import type { RelicPiece, RosterCharacter, StatData } from "../stats/types.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** 8 位、前缀 1 的新版行迹节点（改版过的角色）→ 数据里统一的 7 位编号。 */
export const canonicalNode = (node: unknown): string => {
  const id = String(node);
  return id.length === 8 && id.startsWith("1") ? id.slice(1) : id;
};

/**
 * 角色编号 → 数据里的编号。女主开拓者是双数编号（8002、8004…），数据里每个命途只收了一个单数编号（8001、8003…），
 * 两者属性一样，统一成单数。不认识的原样返回。
 */
export const canonicalCharacter = (raw: unknown, data: StatData): string => {
  const id = String(raw ?? "");
  if (data.characters.has(id)) return id;
  const n = Number(id);
  return /^80\d\d$/.test(id) && n % 2 === 0 && data.characters.has(String(n - 1)) ? String(n - 1) : id;
};

/** 同一个文件里男女主开拓者都有时只留第一个，后面那个跳过（游戏里一个账号只有一个开拓者）；提示只记一次。 */
export function noteDuplicate(skipped: string[]): void {
  const note = "文件里男女主开拓者都有，每个命途只导入第一个。";
  if (!skipped.includes(note)) skipped.push(note);
}

export interface Imported {
  characters: RosterCharacter[];
  relics: RelicPiece[];
  /** 跳过的条目，写成给用户看的话。 */
  skipped: string[];
}

export function fromEnka(raw: unknown, data: StatData): Imported {
  const list = (raw as any)?.detailInfo?.avatarDetailList;
  if (!Array.isArray(list)) throw new Error("这不是 Enka 返回的展柜数据（缺少 detailInfo.avatarDetailList）。");
  const out: Imported = { characters: [], relics: [], skipped: [] };
  for (const avatar of list) {
    const id = canonicalCharacter(avatar?.avatarId, data);
    const info = data.characters.get(id);
    if (!info) {
      out.skipped.push(`角色 ${id} 不在数据里，已跳过（可能是新角色，更新工具箱后再导入）。`);
      continue;
    }
    if (out.characters.some((c) => c.id === id)) {
      noteDuplicate(out.skipped);
      continue;
    }
    let lightcone: RosterCharacter["lightcone"] = null;
    const cone = avatar.equipment;
    if (cone?.tid) {
      if (data.lightcones.has(String(cone.tid))) {
        lightcone = { id: String(cone.tid), level: cone.level ?? 1, promotion: cone.promotion ?? 0, superimpose: cone.rank ?? 1 };
      } else {
        out.skipped.push(`${info.name} 的光锥 ${cone.tid} 不在数据里，按没穿光锥算。`);
      }
    }
    const traces = [...new Set((avatar.skillTreeList ?? []).map((node: any) => canonicalNode(node.pointId)))]
      .filter((node): node is string => typeof node === "string" && node in info.statTraces);
    out.characters.push({ id, level: avatar.level ?? 1, promotion: avatar.promotion ?? 0, eidolon: avatar.rank ?? 0, lightcone, traces, defaults: [] });
    (avatar.relicList ?? []).forEach((relic: any, index: number) => {
      const pieceId = String(relic.tid);
      if (!data.pieces.has(pieceId)) {
        out.skipped.push(`${info.name} 的遗器 ${pieceId} 不在数据里，已跳过（可能是新遗器，更新工具箱后再导入）。`);
        return;
      }
      out.relics.push({
        id: `enka-${id}-${index}`,
        pieceId,
        level: relic.level ?? 0,
        mainAffix: String(relic.mainAffixId),
        subAffixes: (relic.subAffixList ?? []).map((sub: any) => ({ affix: String(sub.affixId), count: sub.cnt ?? 1, step: sub.step ?? 0 })),
        equippedBy: id,
      });
    });
  }
  return out;
}
