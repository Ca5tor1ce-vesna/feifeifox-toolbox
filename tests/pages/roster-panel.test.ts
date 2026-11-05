/**
 * 角色面板（1.2「角色与遗器」）。输入是 Enka 返回的精确数据（tests/fixtures/roster/enka-1505-1510.json），
 * 预期是用户 2026-11-05 给的战绩分享截图上显示的面板，两边来源互相独立。按截图的显示精度比较。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { fromEnka } from "../../ui-shared/src/import/enka.ts";
import { buildStatData } from "../../ui-shared/src/stats/data.ts";
import { defaultCharacter } from "../../ui-shared/src/stats/defaults.ts";
import { computePanel, displayStat, inferPromotion } from "../../ui-shared/src/stats/panel.ts";
import type { RelicPiece, StatKey } from "../../ui-shared/src/stats/types.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const DATA = join(ROOT, "modules", "honkai-star-rail", "data");
const json = (path: string): any => JSON.parse(readFileSync(path, "utf-8"));
const data = buildStatData(json(join(DATA, "characters.json")), json(join(DATA, "lightcones.json")), json(join(DATA, "relic_sets.json")), json(join(DATA, "relic_pieces.json")));
const enka = json(join(ROOT, "tests", "fixtures", "roster", "enka-1505-1510.json"));
const imported = fromEnka(enka, data);

function panelOf(id: string) {
  const character = imported.characters.find((c) => c.id === id);
  assert.ok(character, `样本里没有 ${id}`);
  return computePanel(character, imported.relics.filter((r) => r.equippedBy === id), data);
}

/** 截图上的显示值：白值和总值是整数，其余是百分比（一位小数）。 */
function expectPanel(id: string, white: Partial<Record<StatKey, number>>, total: Partial<Record<StatKey, string>>): void {
  const panel = panelOf(id);
  const problems: string[] = [];
  for (const [stat, value] of Object.entries(white) as [StatKey, number][]) {
    const shown = displayStat(stat, panel[stat].base);
    if (shown !== String(value)) problems.push(`${stat} 白值：期望 ${value}，实际 ${shown}（${panel[stat].base}）`);
  }
  for (const [stat, value] of Object.entries(total) as [StatKey, string][]) {
    const shown = displayStat(stat, panel[stat].total);
    if (shown !== value) problems.push(`${stat}：期望 ${value}，实际 ${shown}（${panel[stat].total}；来源 ${panel[stat].sources.map((s) => `${s.label} ${s.value}`).join("、")}）`);
  }
  assert.deepEqual(problems, []);
}

test("Enka 样本转成 2 个角色、12 件遗器，穿戴关系对", () => {
  assert.deepEqual(imported.characters.map((c) => c.id).sort(), ["1505", "1510"]);
  assert.equal(imported.relics.length, 12);
  assert.equal(imported.relics.filter((r) => r.equippedBy === "1505").length, 6);
  assert.deepEqual(imported.skipped, []);
  const feiying = imported.characters.find((c) => c.id === "1505")!;
  assert.deepEqual(feiying.lightcone, { id: "23058", level: 80, promotion: 6, superimpose: 5 });
  assert.equal(feiying.eidolon, 6);
  assert.ok(feiying.traces.includes("1505201"));
});

test("绯英（2026-11-05 战绩截图）", () => {
  expectPanel("1505", { hp: 2000, atk: 1372, def: 923, spd: 104 }, {
    hp: "2868", atk: "1853", def: "1109", spd: "138", critRate: "59.6%", critDmg: "373.9%", dmgPhysical: "38.8%",
    breakEffect: "0.0%", elation: "26.0%", healBoost: "0.0%", err: "119.4%", ehr: "7.7%", effectRes: "0.0%",
  });
});

test("姬子•启行（2026-11-05 战绩截图）", () => {
  expectPanel("1510", { hp: 1972, atk: 1391, def: 1014, spd: 98 }, {
    hp: "2783", atk: "4253", def: "1162", spd: "100", critRate: "91.7%", critDmg: "124.5%", dmgFire: "8.0%",
    breakEffect: "23.9%", elation: "0.0%", healBoost: "0.0%", err: "100.0%", ehr: "14.6%", effectRes: "0.0%",
  });
});

test("米沙 Lv.40 没穿光锥和遗器：两个突破档里只有一档对得上截图，inferPromotion 选中它", () => {
  const shown = { hp: 717, atk: 338, def: 224 };
  const matches = [2, 3].filter((promotion) => {
    const panel = computePanel({ id: "1312", level: 40, promotion, eidolon: 0, lightcone: null, traces: [], defaults: [] }, [], data);
    return (["hp", "atk", "def"] as const).every((stat) => displayStat(stat, panel[stat].total) === String(shown[stat]));
  });
  assert.equal(matches.length, 1, `对得上的突破档：${matches.join("、") || "没有"}`);
  const character = { id: "1312", level: 40, promotion: 3, eidolon: 0, lightcone: null, traces: [], defaults: [] };
  assert.deepEqual(inferPromotion(character, [], shown, data), { promotion: matches[0], certain: true });
  assert.deepEqual(inferPromotion(character, [], {}, data), { promotion: 3, certain: false });
  const panel = computePanel({ ...character, promotion: matches[0] }, [], data);
  assert.equal(displayStat("spd", panel.spd.total), "96");
  assert.equal(displayStat("critRate", panel.critRate.total), "5.0%");
  assert.equal(displayStat("critDmg", panel.critDmg.total), "50.0%");
  assert.equal(displayStat("err", panel.err.total), "100.0%");
});

test("不在突破临界的等级不用猜：inferPromotion 直接按等级定", () => {
  const character = { id: "1312", level: 45, promotion: 0, eidolon: 0, lightcone: null, traces: [], defaults: [] };
  assert.deepEqual(inferPromotion(character, [], {}, data), { promotion: 3, certain: true });
});

test("2+2 穿法：4 件效果不算，两个 2 件效果都算", () => {
  const relics = imported.relics.filter((r) => r.equippedBy === "1505");
  const cavern = relics.filter((r) => data.pieces.get(r.pieceId)!.slot !== "NECK" && data.pieces.get(r.pieceId)!.slot !== "OBJECT");
  const fourSet = data.pieces.get(cavern[0].pieceId)!.setId;
  // 把其中两件换成「云无留迹的过客」（101，2 件：治疗量 +10%），同部位同稀有度。
  const swapped: RelicPiece[] = relics.map((r) => {
    const info = data.pieces.get(r.pieceId)!;
    if (info.setId !== fourSet || (info.slot !== "HEAD" && info.slot !== "HAND")) return r;
    return { ...r, pieceId: `6101${info.slot === "HEAD" ? 1 : 2}` };
  });
  const character = imported.characters.find((c) => c.id === "1505")!;
  const full = computePanel(character, relics, data);
  const mixed = computePanel(character, swapped, data);
  const fourPiece = data.relicSets.get(fourSet)!.properties[1] ?? [];
  const hasSource = (panel: typeof full, label: string) => Object.values(panel).some((stat) => stat.sources.some((s) => s.label.includes(label)));
  if (fourPiece.length) assert.ok(hasSource(full, "4 件") && !hasSource(mixed, `${data.relicSets.get(fourSet)!.name}·4 件`));
  assert.ok(Math.abs(mixed.healBoost.total - full.healBoost.total - 0.1) < 1e-9, "云无留迹的过客 2 件的治疗量 +10% 要算上");
});

test("光锥命途和角色不同：白值照算，被动的面板属性不算", () => {
  const character = { ...imported.characters.find((c) => c.id === "1505")!, lightcone: { id: "23060", level: 80, promotion: 6, superimpose: 1 } };
  const matched = { ...character, lightcone: { id: "23058", level: 80, promotion: 6, superimpose: 5 } };
  const off = computePanel(character, [], data);
  assert.ok(off.atk.base > computePanel({ ...character, lightcone: null }, [], data).atk.base, "白值要算");
  assert.ok(!off.critDmg.sources.some((s) => s.label.startsWith("光锥")), "命途不同时光锥被动不进面板");
  assert.ok(computePanel(matched, [], data).critDmg.sources.some((s) => s.label.startsWith("光锥")));
});

test("fromEnka：数据里没有的角色和遗器跳过并说明，其余照常；8 位行迹节点去掉前缀", () => {
  const extra = structuredClone(enka);
  extra.detailInfo.avatarDetailList.push({ avatarId: 1999, level: 80, promotion: 6, relicList: [], skillTreeList: [] });
  extra.detailInfo.avatarDetailList[0].relicList[0].tid = 99999;
  extra.detailInfo.avatarDetailList[0].skillTreeList.push({ pointId: 11505201, level: 1 });
  const result = fromEnka(extra, data);
  assert.ok(result.skipped.some((line) => line.includes("1999")), result.skipped.join("；"));
  assert.ok(result.skipped.some((line) => line.includes("99999")), result.skipped.join("；"));
  assert.equal(result.characters.length, 2);
  assert.equal(result.relics.length, 11);
  assert.equal(result.characters[0].traces.filter((t) => t === "1505201").length, 1, "去掉前缀后不重复");
});

test("defaultCharacter：80 级、突破 6、行迹全点，标出哪些是默认的", () => {
  const misha = defaultCharacter("1312", data);
  assert.equal(misha.level, 80);
  assert.equal(misha.promotion, 6);
  assert.deepEqual([...misha.traces].sort(), Object.keys(data.characters.get("1312")!.statTraces).sort());
  assert.deepEqual(misha.defaults.sort(), ["level", "promotion", "traces"]);
  assert.throws(() => defaultCharacter("1999", data), /角色 1999 不在数据里/);
});
