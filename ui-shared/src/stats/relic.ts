/** 单件遗器的主副词条数值。主词条 = 基础值 + 每级成长 × 等级；副词条 = 基础值 × 次数 + 每档增量 × 档位。 */
import { PROPERTY_TO_STAT, type Prop, type RelicPiece, type StatData } from "./types.ts";

function known(type: string): string {
  if (!PROPERTY_TO_STAT[type]) throw new Error(`不认识的属性 ${type}，数据可能比工具新，请更新工具箱。`);
  return type;
}

export function relicStats(piece: RelicPiece, data: StatData): { main: Prop; subs: Prop[] } {
  const info = data.pieces.get(String(piece.pieceId));
  if (!info) throw new Error(`遗器编号 ${piece.pieceId} 不在数据里，可能是新遗器，请更新工具箱。`);
  const main = data.mainAffixes[info.mainGroup]?.[String(piece.mainAffix)];
  if (!main) throw new Error(`遗器 ${piece.pieceId} 的主词条 ${piece.mainAffix} 不在数据里。`);
  const subs = piece.subAffixes.map((sub) => {
    const affix = data.subAffixes[info.subGroup]?.[String(sub.affix)];
    if (!affix) throw new Error(`遗器 ${piece.pieceId} 的副词条 ${sub.affix} 不在数据里。`);
    return { type: known(affix.type), value: affix.base * sub.count + affix.step * sub.step };
  });
  return { main: { type: known(main.type), value: main.base + main.step * piece.level }, subs };
}

/**
 * 这件遗器在游戏里可能存在吗？不可能时返回原因（给用户看的话），正常的返回 null。只看结构，不看数值。
 * 规则：等级不超过 星级×3；每 3 级强化一次，每次给一条副词条 +1 次（不满 4 条时先加一条新的）；
 * 初始副词条 星级-2 ~ 星级-1 条（五星 3~4 条）；副词条最多 4 条、互不重复、不和主词条相同；档位 0 ~ 2×次数。
 */
export function relicProblem(relic: RelicPiece, data: StatData): string | null {
  const piece = data.pieces.get(String(relic.pieceId));
  if (!piece) return `遗器编号 ${relic.pieceId} 不在数据里`;
  const maxLevel = piece.rarity * 3;
  if (!Number.isInteger(relic.level) || relic.level < 0 || relic.level > maxLevel) return `等级 +${relic.level} 超过 ${piece.rarity} 星遗器的上限 +${maxLevel}`;
  const main = data.mainAffixes[piece.mainGroup]?.[String(relic.mainAffix)];
  if (!main) return `主词条 ${relic.mainAffix} 不在数据里`;
  const subs = relic.subAffixes;
  if (subs.length > 4) return `副词条有 ${subs.length} 条，最多 4 条`;
  const types = subs.map((sub) => data.subAffixes[piece.subGroup]?.[String(sub.affix)]?.type);
  if (types.some((type) => !type)) return "副词条不在数据里";
  if (new Set(types).size !== types.length) return "副词条重复";
  if (types.includes(main.type)) return "副词条和主词条相同";
  const rolls = Math.floor(relic.level / 3);
  if (subs.some((sub) => !Number.isInteger(sub.count) || sub.count < 1 || sub.count > 1 + rolls)) return `副词条次数不对（+${relic.level} 时单条 1~${1 + rolls} 次）`;
  if (subs.some((sub) => !Number.isInteger(sub.step) || sub.step < 0 || sub.step > 2 * sub.count)) return "副词条档位不对";
  const total = subs.reduce((sum, sub) => sum + sub.count, 0);
  const low = Math.max(0, piece.rarity - 2) + rolls;
  const high = Math.max(0, piece.rarity - 1) + rolls;
  if (total < low || total > high) return `副词条一共 ${total} 次，+${relic.level} 的 ${piece.rarity} 星遗器应该是 ${low}~${high} 次`;
  if (subs.length !== Math.min(4, total)) return `副词条条数不对（一共 ${total} 次应该有 ${Math.min(4, total)} 条）`;
  return null;
}
