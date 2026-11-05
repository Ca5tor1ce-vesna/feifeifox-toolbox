/**
 * 扫描文件（HSR-Scanner v4 格式，Reliquary Archiver、GGScanner 等也输出它）导入（1.2）。
 * 样本 tests/fixtures/roster/scanner-v4-sample.json 是把 Enka 样本里的绯英、姬子•启行写成 v4 的样子：
 * 副词条只留游戏显示值（扫描工具读到的就是这个），没有次数和档位，要反推。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { fromEnka } from "../../ui-shared/src/import/enka.ts";
import { diffLibrary } from "../../ui-shared/src/import/merge.ts";
import { fromScannerV4 } from "../../ui-shared/src/import/scanner-v4.ts";
import { buildStatData } from "../../ui-shared/src/stats/data.ts";
import { computePanel, displayStat } from "../../ui-shared/src/stats/panel.ts";
import { emptyRoster, type RosterSave } from "../../ui-shared/src/stats/types.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const DATA = join(ROOT, "modules", "honkai-star-rail", "data");
const json = (path: string): any => JSON.parse(readFileSync(path, "utf-8"));
const data = buildStatData(json(join(DATA, "characters.json")), json(join(DATA, "lightcones.json")), json(join(DATA, "relic_sets.json")), json(join(DATA, "relic_pieces.json")));
const sample = json(join(ROOT, "tests", "fixtures", "roster", "scanner-v4-sample.json"));
const enka = fromEnka(json(join(ROOT, "tests", "fixtures", "roster", "enka-1505-1510.json")), data);
const result = fromScannerV4(sample, data);

test("样本转出 2 个角色、12 件遗器，光锥、星魂、穿戴关系对", () => {
  assert.deepEqual(result.characters.map((c) => c.id).sort(), ["1505", "1510"]);
  assert.equal(result.relics.length, 12);
  assert.equal(result.relics.filter((r) => r.equippedBy === "1510").length, 6);
  const feiying = result.characters.find((c) => c.id === "1505")!;
  assert.deepEqual(feiying.lightcone, { id: "23058", level: 80, promotion: 6, superimpose: 5 });
  assert.equal(feiying.eidolon, 6);
  assert.equal(feiying.traces.length, Object.keys(data.characters.get("1505")!.statTraces).length);
});

test("遗器编号、主词条、副词条种类和 Enka 一致；非速度副词条反推出的次数和档位也一致", () => {
  for (const id of ["1505", "1510"]) {
    const fromFile = result.relics.filter((r) => r.equippedBy === id);
    const fromEnkaRelics = enka.relics.filter((r) => r.equippedBy === id);
    for (const expected of fromEnkaRelics) {
      const actual = fromFile.find((r) => r.pieceId === expected.pieceId);
      assert.ok(actual, `${id} 缺遗器 ${expected.pieceId}`);
      assert.equal(actual.mainAffix, expected.mainAffix, `${expected.pieceId} 的主词条`);
      assert.equal(actual.level, expected.level);
      for (const sub of expected.subAffixes) {
        const got = actual.subAffixes.find((s) => s.affix === sub.affix);
        assert.ok(got, `${expected.pieceId} 缺副词条 ${sub.affix}`);
        assert.equal(got.count, sub.count, `${expected.pieceId} 副词条 ${sub.affix} 的次数`);
        if (sub.affix !== "7") assert.equal(got.step, sub.step, `${expected.pieceId} 副词条 ${sub.affix} 的档位`);
      }
    }
  }
});

test("从扫描文件算出的面板，除速度外和截图一致；速度和精确值差不到 1", () => {
  const shots: Record<string, Record<string, string>> = {
    "1505": { hp: "2868", atk: "1853", def: "1109", critRate: "59.6%", critDmg: "373.9%", elation: "26.0%", err: "119.4%", ehr: "7.7%" },
    "1510": { hp: "2783", atk: "4253", def: "1162", critRate: "91.7%", critDmg: "124.5%", breakEffect: "23.9%", err: "100.0%", ehr: "14.6%" },
  };
  for (const [id, expected] of Object.entries(shots)) {
    const character = result.characters.find((c) => c.id === id)!;
    const panel = computePanel(character, result.relics.filter((r) => r.equippedBy === id), data);
    for (const [stat, shown] of Object.entries(expected)) assert.equal(displayStat(stat as any, (panel as any)[stat].total), shown, `${id} ${stat}`);
    const exact = computePanel(enka.characters.find((c) => c.id === id)!, enka.relics.filter((r) => r.equippedBy === id), data);
    assert.ok(Math.abs(panel.spd.total - exact.spd.total) < 1, `${id} 速度估计 ${panel.spd.total}，精确值 ${exact.spd.total}`);
  }
});

test("速度副词条只有整数：按平均值估计，并说明一次", () => {
  const notes = result.skipped.filter((line) => line.includes("速度"));
  assert.equal(notes.length, 1, result.skipped.join("；"));
  assert.match(notes[0], /件遗器的速度副词条只有整数/);
});

test("同一个文件转两次，整库替换的差异统计是没有变化", () => {
  const again = fromScannerV4(sample, data);
  const save = (r: typeof result): RosterSave => ({ ...emptyRoster(), characters: Object.fromEntries(r.characters.map((c) => [c.id, c])), relics: r.relics });
  assert.deepEqual(diffLibrary(save(result), save(again)), { added: 0, removed: 0, changed: 0, characters: 2 });
});

test("不是 v4 格式时说清楚", () => {
  assert.throws(() => fromScannerV4({ ...sample, version: 3 }, data), /不认识的扫描文件格式（version=3），请用导出 v4 格式的工具/);
  assert.throws(() => fromScannerV4({ hello: 1 }, data), /不认识的扫描文件格式/);
});

test("数据里没有的套装、角色、光锥跳过并说明，其余照常（Review Focus 5）", () => {
  const odd = structuredClone(sample);
  odd.relics[0].set_id = "999";
  odd.characters.push({ id: "1999", name: "新角色", level: 80, ascension: 6, eidolon: 0, traces: {} });
  odd.light_cones.push({ id: "29999", level: 80, ascension: 6, superimposition: 1, location: "1505" });
  const out = fromScannerV4(odd, data);
  assert.ok(out.skipped.some((line) => line.includes("999") && line.includes("遗器")), out.skipped.join("；"));
  assert.ok(out.skipped.some((line) => line.includes("1999")), out.skipped.join("；"));
  assert.equal(out.relics.length, 11);
  assert.equal(out.characters.length, 2);
  assert.equal(out.characters.find((c) => c.id === "1505")!.lightcone!.id, "23058", "没有的光锥不覆盖已认出的那把");
});

test("没穿在身上的遗器和光锥也导入（equippedBy 为 null）", () => {
  const loose = structuredClone(sample);
  loose.relics[0].location = "";
  const out = fromScannerV4(loose, data);
  assert.equal(out.relics.length, 12);
  assert.equal(out.relics.filter((r) => r.equippedBy === null).length, 1);
});
