/** 导入结果并进遗器库：整库替换前的差异统计、只改部分角色的局部合并。纯函数，不碰存档。 */
import type { RelicPiece, RosterCharacter, RosterSave } from "../stats/types.ts";

const sortedSubs = (relic: RelicPiece) => [...relic.subAffixes].sort((a, b) => Number(a.affix) - Number(b.affix));

/** 是不是同一件遗器：编号、等级、主词条、每条副词条的词条和次数都一样；loose 为 false 时档位也要一样。
 * 识图看不到档位（速度只显示整数），所以用 loose。存档编号和穿在谁身上不算内容。 */
export function sameRelic(a: RelicPiece, b: RelicPiece, loose = false): boolean {
  if (a.pieceId !== b.pieceId || a.level !== b.level || a.mainAffix !== b.mainAffix || a.subAffixes.length !== b.subAffixes.length) return false;
  const left = sortedSubs(a);
  const right = sortedSubs(b);
  return left.every((sub, i) => sub.affix === right[i].affix && sub.count === right[i].count && (loose || sub.step === right[i].step));
}

/** 同一件遗器强化前后：编号、主词条、副词条的词条种类一样，等级、次数、档位可以不同。 */
function sameIdentity(a: RelicPiece, b: RelicPiece): boolean {
  if (a.pieceId !== b.pieceId || a.mainAffix !== b.mainAffix) return false;
  const left = sortedSubs(a).map((s) => s.affix).join(",");
  const right = sortedSubs(b).map((s) => s.affix).join(",");
  return right.startsWith(left) || left.startsWith(right);
}

export interface LibraryDiff { added: number; removed: number; changed: number; characters: number }

/** 整库替换前给用户看：新增、消失、改动（强化过或换了人穿）各多少件，新数据里有多少名角色。 */
export function diffLibrary(before: RosterSave, after: RosterSave): LibraryDiff {
  const pool = [...before.relics];
  let added = 0;
  let changed = 0;
  const take = (match: (r: RelicPiece) => boolean): RelicPiece | null => {
    const index = pool.findIndex(match);
    return index < 0 ? null : pool.splice(index, 1)[0];
  };
  for (const relic of after.relics) {
    const same = take((r) => sameRelic(r, relic));
    if (same) {
      if (same.equippedBy !== relic.equippedBy) changed += 1;
      continue;
    }
    if (take((r) => sameIdentity(r, relic))) changed += 1;
    else added += 1;
  }
  return { added, removed: pool.length, changed, characters: Object.keys(after.characters).length };
}

/**
 * 局部合并（UID 查询、识图）：只改 incoming 里的角色。这些角色原来穿着的遗器先脱下（留在库里，不删）；
 * 他们这次身上的遗器逐件去库里找同一件，找到就换穿过去（哪怕原来在别人身上），找不到就新增。
 */
export function mergeCharacters(
  save: RosterSave,
  incoming: { characters: RosterCharacter[]; relics: RelicPiece[] },
  loose: boolean,
  newId: () => string,
): RosterSave {
  const ids = new Set(incoming.characters.map((c) => c.id));
  const relics = save.relics.map((r) => (r.equippedBy && ids.has(r.equippedBy) ? { ...r, equippedBy: null } : { ...r }));
  const claimed = new Set<string>();
  for (const relic of incoming.relics) {
    if (!relic.equippedBy || !ids.has(relic.equippedBy)) continue;
    const found = relics.find((r) => !claimed.has(r.id) && sameRelic(r, relic, loose));
    if (found) {
      found.equippedBy = relic.equippedBy;
      claimed.add(found.id);
    } else {
      const created = { ...relic, id: newId() };
      relics.push(created);
      claimed.add(created.id);
    }
  }
  const characters = { ...save.characters };
  for (const character of incoming.characters) characters[character.id] = character;
  return { ...save, characters, relics };
}
