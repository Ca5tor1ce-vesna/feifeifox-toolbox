/**
 * FreeSR 格式的 JSON（freesr-data.json）→ 统一的内部格式。只做格式转换，不碰存档。
 *
 *   { lightcones: [{ item_id, level, rank（叠影）, promotion, equip_avatar（角色 id，没穿是 0） }],
 *     relics: [{ relic_id, level, main_affix_id, sub_affixes: [{ sub_affix_id, count, step }], equip_avatar }],
 *     avatars: { <id>: { avatar_id, level, promotion, data: { rank（星魂）, skills: { 行迹节点: 等级 } } } },
 *     battle_config }
 *
 * 编号和 Enka 一样是游戏里的编号，副词条有次数和档位，能算到精确值。这种文件常被手改过（2026-11-05 用户的文件里
 * 有单条副词条出现 21 次的遗器），游戏里不可能存在的遗器一律跳过（用户决定），角色、星魂、行迹、光锥照常导入。
 * count 为 0 的副词条是占位，当作没有。
 */
import { relicProblem } from "../stats/relic.ts";
import type { RelicPiece, RosterCharacter, StatData } from "../stats/types.ts";
import { canonicalCharacter, canonicalNode, noteDuplicate, type Imported } from "./enka.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function isFreeSr(raw: unknown): boolean {
  const file = raw as any;
  return !!file && typeof file === "object" && Array.isArray(file.relics) && !!file.avatars && typeof file.avatars === "object" && !Array.isArray(file.avatars);
}

export function fromFreeSr(raw: unknown, data: StatData): Imported {
  if (!isFreeSr(raw)) throw new Error("这不是 FreeSR 格式的文件（缺少 relics 或 avatars）。");
  const file = raw as any;
  const out: Imported = { characters: [], relics: [], skipped: [] };

  /** 文件里的角色编号 → 导入的角色（女主开拓者统一成单数编号；重复的那个不在这里，穿在它身上的东西按没穿算）。 */
  const owners = new Map<string, RosterCharacter>();
  for (const avatar of Object.values<any>(file.avatars)) {
    const raw = String(avatar?.avatar_id ?? "");
    const id = canonicalCharacter(raw, data);
    const info = data.characters.get(id);
    if (!info) {
      out.skipped.push(`角色 ${id} 不在数据里，已跳过（可能是新角色，更新工具箱后再导入）。`);
      continue;
    }
    if (out.characters.some((c) => c.id === id)) {
      noteDuplicate(out.skipped);
      continue;
    }
    const traces = Object.entries<number>(avatar.data?.skills ?? {})
      .filter(([, level]) => Number(level) >= 1)
      .map(([node]) => canonicalNode(node))
      .filter((node) => node in info.statTraces);
    const character: RosterCharacter = { id, level: avatar.level ?? 80, promotion: avatar.promotion ?? 0, eidolon: avatar.data?.rank ?? 0, lightcone: null, traces: [...new Set(traces)], defaults: [] };
    out.characters.push(character);
    owners.set(raw, character);
  }

  for (const cone of file.lightcones ?? []) {
    const owner = owners.get(String(cone?.equip_avatar ?? ""));
    if (!owner) continue; // 没穿在身上的光锥不记（和扫描文件一样）
    if (!data.lightcones.has(String(cone.item_id))) {
      out.skipped.push(`${data.characters.get(owner.id)?.name ?? owner.id} 的光锥 ${cone.item_id} 不在数据里，按没穿光锥算。`);
      continue;
    }
    owner.lightcone = { id: String(cone.item_id), level: cone.level ?? 80, promotion: cone.promotion ?? 0, superimpose: cone.rank ?? 1 };
  }

  let impossible = 0;
  let unknown = 0;
  file.relics.forEach((entry: any, index: number) => {
    const pieceId = String(entry?.relic_id ?? "");
    if (!data.pieces.has(pieceId)) {
      unknown += 1;
      return;
    }
    const owner = owners.get(String(entry.equip_avatar ?? ""))?.id ?? null;
    const relic: RelicPiece = {
      id: `freesr-${index}`,
      pieceId,
      level: entry.level ?? 0,
      mainAffix: String(entry.main_affix_id),
      subAffixes: (entry.sub_affixes ?? [])
        .filter((sub: any) => Number(sub?.count) > 0)
        .map((sub: any) => ({ affix: String(sub.sub_affix_id), count: Number(sub.count), step: Number(sub.step ?? 0) })),
      equippedBy: owner,
    };
    if (relicProblem(relic, data)) {
      impossible += 1;
      return;
    }
    out.relics.push(relic);
  });
  if (impossible) out.skipped.push(`跳过了 ${impossible} 件游戏里不可能出现的遗器（副词条次数不对、重复或没有副词条，多半是手改过的），穿着它们的部位会空着。`);
  if (unknown) out.skipped.push(`有 ${unknown} 件遗器不在数据里，已跳过（可能是新遗器，更新工具箱后再导入）。`);
  return out;
}
