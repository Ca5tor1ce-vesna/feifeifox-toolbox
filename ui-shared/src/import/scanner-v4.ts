/**
 * 扫描文件 → 统一的内部格式。认 HSR-Scanner 的 v4 导出格式（Reliquary Archiver、GGScanner 等都以它为基础）：
 *
 *   { source, build, version: 4, metadata: { uid, trailblazer },
 *     characters: [{ id, name, path, level, ascension, eidolon, skills, traces: { ability_1.., stat_1..stat_10: bool } }],
 *     light_cones: [{ id, name, level, ascension, superimposition, location: 角色 id 或 "", lock, _uid }],
 *     relics: [{ set_id, name, slot: Head|Hands|Body|Feet|Planar Sphere|Link Rope, rarity, level, mainstat,
 *                substats: [{ key, value }], location, lock, discard, _uid }] }
 *
 * 副词条只有游戏显示的数值（百分比的键名带 _，单位是 %），没有次数和档位，这里按数值表反推。
 * 速度副词条显示成整数（扫描工具读不到小数），次数能确定，档位只能按平均值估计。
 * 文件里的 metadata.uid 不存。
 */
import type { RelicPiece, RosterCharacter, Slot, StatData } from "../stats/types.ts";
import { canonicalCharacter, noteDuplicate, type Imported } from "./enka.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

const SLOTS: Record<string, { slot: Slot; index: number }> = {
  Head: { slot: "HEAD", index: 1 }, Hands: { slot: "HAND", index: 2 }, Body: { slot: "BODY", index: 3 },
  Feet: { slot: "FOOT", index: 4 }, "Planar Sphere": { slot: "NECK", index: 5 }, "Link Rope": { slot: "OBJECT", index: 6 },
};

/** 主词条名 → 可能的属性（头的 HP 是固定值，躯干的 HP 是百分比，按这件遗器的主词条组里有哪个来定）。 */
const MAIN_TYPES: Record<string, string[]> = {
  HP: ["HPDelta", "HPAddedRatio"], ATK: ["AttackDelta", "AttackAddedRatio"], DEF: ["DefenceAddedRatio"], SPD: ["SpeedDelta"],
  "CRIT Rate": ["CriticalChanceBase"], "CRIT DMG": ["CriticalDamageBase"], "Outgoing Healing Boost": ["HealRatioBase"],
  "Effect Hit Rate": ["StatusProbabilityBase"], "Break Effect": ["BreakDamageAddedRatioBase"], "Energy Regeneration Rate": ["SPRatioBase"],
  "Physical DMG Boost": ["PhysicalAddedRatio"], "Fire DMG Boost": ["FireAddedRatio"], "Ice DMG Boost": ["IceAddedRatio"],
  "Lightning DMG Boost": ["ThunderAddedRatio"], "Wind DMG Boost": ["WindAddedRatio"], "Quantum DMG Boost": ["QuantumAddedRatio"],
  "Imaginary DMG Boost": ["ImaginaryAddedRatio"],
};

const SUB_TYPES: Record<string, string> = {
  HP: "HPDelta", HP_: "HPAddedRatio", ATK: "AttackDelta", ATK_: "AttackAddedRatio", DEF: "DefenceDelta", DEF_: "DefenceAddedRatio",
  SPD: "SpeedDelta", "CRIT Rate_": "CriticalChanceBase", "CRIT DMG_": "CriticalDamageBase", "Effect Hit Rate_": "StatusProbabilityBase",
  "Effect RES_": "StatusResistanceBase", "Break Effect_": "BreakDamageAddedRatioBase",
};

/**
 * 按显示值反推副词条的次数和档位。数值 = 基础值 × 次数 + 档位增量 × 档位（档位 0 ~ 2×次数）。
 * 显示值可能是取整后的（截图、OCR），也可能是精确的（抓包工具），所以允许差一个显示单位。
 * 次数取最小的那个；档位取最接近显示值的，速度这种只显示整数的取平均档位（次数）。
 */
export function inferSubAffix(base: number, step: number, shown: number, percent: boolean, integerOnly: boolean, countHint?: number): { count: number; step: number; exact: boolean; steps: number[] } | null {
  const unit = percent ? 0.1 : 1;
  const value = (count: number, s: number) => (base * count + step * s) * (percent ? 100 : 1);
  // 图上标了强化次数时（»2 = 强化 2 次 = 出现 3 次）先按它试。
  const order = countHint && countHint >= 1 && countHint <= 6 ? [countHint, ...[1, 2, 3, 4, 5, 6].filter((c) => c !== countHint)] : [1, 2, 3, 4, 5, 6];
  for (const count of order) {
    const steps: number[] = [];
    // 游戏向下取整显示，而且数值带浮点误差（8.1% 实际是 8.0999…%，显示成 8.0%）：真实值在「显示值」到「显示值 + 1 个单位」之间。
    // 往下也留半个单位，兼容四舍五入显示的工具。
    for (let s = 0; s <= count * 2; s += 1) {
      const diff = value(count, s) - shown;
      if (diff > -unit / 2 && diff < unit + 1e-6) steps.push(s);
    }
    if (!steps.length) continue;
    if (integerOnly && steps.length > 1) {
      const middle = steps.reduce((best, s) => (Math.abs(s - count) < Math.abs(best - count) ? s : best), steps[0]);
      return { count, step: middle, exact: false, steps };
    }
    const closest = steps.reduce((best, s) => (Math.abs(value(count, s) - shown) < Math.abs(value(count, best) - shown) ? s : best), steps[0]);
    return { count, step: closest, exact: steps.length === 1, steps };
  }
  return null;
}

export function fromScannerV4(raw: unknown, data: StatData): Imported {
  const file = raw as any;
  if (!file || typeof file !== "object" || !Array.isArray(file.relics) || !Array.isArray(file.characters)) {
    throw new Error("不认识的扫描文件格式：找不到 relics 和 characters，请用导出 v4 格式的工具（HSR-Scanner、Reliquary Archiver、GGScanner），或 FreeSR 格式的 freesr-data.json。");
  }
  if (file.version !== 4) throw new Error(`不认识的扫描文件格式（version=${file.version}），请用导出 v4 格式的工具。`);
  const out: Imported = { characters: [], relics: [], skipped: [] };
  /** 文件里的角色编号 → 导入后的编号（女主开拓者统一成单数编号）。 */
  const known = new Map<string, string>();
  let partialTraces = false;

  for (const entry of file.characters) {
    const raw = String(entry?.id ?? "");
    const id = canonicalCharacter(raw, data);
    const info = data.characters.get(id);
    if (!info) {
      out.skipped.push(`角色 ${entry?.name ?? ""}（${id}）不在数据里，已跳过（可能是新角色，更新工具箱后再导入）。`);
      continue;
    }
    if (out.characters.some((c) => c.id === id)) {
      noteDuplicate(out.skipped);
      continue;
    }
    // stat_1 … stat_10 按解锁先后排列；数据里的节点按编号排，两者顺序基本一致。全点时没有差别。
    const nodes = Object.keys(info.statTraces).sort();
    const flags = Object.entries<boolean>(entry.traces ?? {}).filter(([key]) => key.startsWith("stat_"));
    const traces = flags.length ? nodes.filter((_, i) => entry.traces[`stat_${i + 1}`] === true) : nodes;
    if (flags.length && traces.length !== nodes.length) partialTraces = true;
    out.characters.push({ id, level: entry.level ?? 80, promotion: entry.ascension ?? 0, eidolon: entry.eidolon ?? 0, lightcone: null, traces, defaults: flags.length ? [] : ["traces"] });
    known.set(raw, id);
  }
  if (partialTraces) out.skipped.push("有角色的属性行迹没点满：扫描文件只按顺序记开关，个别行迹可能对应错，可以在页面上核对。");

  for (const cone of file.light_cones ?? []) {
    const owner = out.characters.find((c) => c.id === known.get(String(cone?.location ?? "")));
    if (!owner) continue; // 没穿在身上的光锥不记（这一版只记角色身上的光锥）
    if (!data.lightcones.has(String(cone.id))) {
      out.skipped.push(`光锥 ${cone.name ?? ""}（${cone.id}）不在数据里，已跳过。`);
      continue;
    }
    owner.lightcone = { id: String(cone.id), level: cone.level ?? 80, promotion: cone.ascension ?? 0, superimpose: cone.superimposition ?? 1 };
  }

  let estimatedSpeed = 0;
  file.relics.forEach((relic: any, index: number) => {
    const slot = SLOTS[relic?.slot];
    const label = `${relic?.name || `套装 ${relic?.set_id}`}·${relic?.slot ?? "?"}`;
    const pieceId = slot ? `${Number(relic.rarity) + 1}${relic.set_id}${slot.index}` : "";
    const piece = data.pieces.get(pieceId);
    if (!slot || !piece) {
      out.skipped.push(`遗器 ${label}（套装 ${relic?.set_id}）不在数据里，已跳过（可能是新遗器，更新工具箱后再导入）。`);
      return;
    }
    const mainGroup = data.mainAffixes[piece.mainGroup] ?? {};
    const mainAffix = Object.entries(mainGroup).find(([, affix]) => (MAIN_TYPES[relic.mainstat] ?? []).includes(affix.type))?.[0];
    if (!mainAffix) {
      out.skipped.push(`遗器 ${label} 的主词条「${relic.mainstat}」认不出来，已跳过。`);
      return;
    }
    const subGroup = data.subAffixes[piece.subGroup] ?? {};
    const subAffixes: RelicPiece["subAffixes"] = [];
    let bad = "";
    let speedGuess = false;
    for (const sub of relic.substats ?? []) {
      const type = SUB_TYPES[sub?.key];
      const found = Object.entries(subGroup).find(([, affix]) => affix.type === type);
      const guess = found && inferSubAffix(found[1].base, found[1].step, Number(sub.value), String(sub.key).endsWith("_"), type === "SpeedDelta");
      if (!found || !guess) {
        bad = `${sub?.key} ${sub?.value}`;
        break;
      }
      if (type === "SpeedDelta" && !guess.exact) speedGuess = true;
      subAffixes.push({ affix: found[0], count: guess.count, step: guess.step });
    }
    if (bad) {
      out.skipped.push(`遗器 ${label} 的副词条「${bad}」和数值表对不上，已跳过。`);
      return;
    }
    if (speedGuess) estimatedSpeed += 1;
    const owner = known.get(String(relic.location ?? "")) ?? null;
    out.relics.push({ id: `v4-${index}`, pieceId, level: relic.level ?? 0, mainAffix, subAffixes, equippedBy: owner });
  });
  if (estimatedSpeed) out.skipped.push(`${estimatedSpeed} 件遗器的速度副词条只有整数（扫描工具读不到小数），小数部分按平均值估计；需要精确速度可以用 exe 的 UID 查询或抓包工具。`);
  return out;
}
