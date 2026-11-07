/** 角色顶分的筛选、排序、标签和往期成绩。 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { validate, withArchive, withAvatars } from "../../records-ui/src/data.ts";
import { ALL, categoriesOf, charMatches, compareSeason, groupsOf, newFilter, openMode, restoreFilter, rowsOf, seasonsOf, settle, stageKind, stageLabel, stagesOf, tagsOf, termsOf, totalRuns } from "../../records-ui/src/filter.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const json = (...parts: string[]): any => JSON.parse(readFileSync(join(ROOT, ...parts), "utf-8"));

const char = (name: string, eidolon = 0, lightcone = "光锥") => ({ name, eidolon, lightcone, superimposition: 1 });
const record = (group: string, ltd: number, std: number, extra: object = {}, lineup = [char(group), char("爻光"), char("绯英", 2), char("真珠", 1)]) => ({ group, runs_in_group: 1, tag: "0轮次", ltd, std, date: "2026-10-01 00:00", lineup, ...extra });
const targets = [
  { mode: "混沌回忆", season: "4.6", stage: "赞达尔", category: "0轮次", total_runs: 10, records: [record("甲", 3, 0, { cycle: "1", date: "2026-10-03 00:00" }), record("乙", 1, 2, { cycle: "0", date: "2026-10-01 00:00" })] },
  { mode: "混沌回忆", season: "4.5", stage: "赞达尔", category: "0轮次", total_runs: 7, archived_at: "2026-10-16", records: [record("甲", 2, 0, { cycle: "0" })] },
  { mode: "混沌回忆", season: "4.5", stage: "呼雷", category: "0轮次", total_runs: 5, archived_at: "2026-10-16", records: [record("丙", 0, 0, { cycle: "2" }, [char("丙"), char("丁"), char("戊")])] },
  { mode: "异相仲裁", season: "4.6", stage: "[K1] 帕姆王", category: "通关", total_runs: 4, records: [record("甲", 4, 0, { av: 300 }), record("乙", 4, 0, { av: 200 })] },
  { mode: "异相仲裁", season: "4.6", stage: "亚婆离（绝境）", category: "0轮次", total_runs: 3, records: [record("甲", 5, 0, { cycle: "0" })] },
  { mode: "异相仲裁", season: "4.6", stage: "亚婆离", category: "0轮次", total_runs: 3, records: [record("丁", 5, 0, { cycle: "0" })] },
];
const groups = (filter: Partial<ReturnType<typeof newFilter>>, mode = "混沌回忆") => rowsOf(targets, mode, { ...newFilter(), ...filter }).map((row) => `${row.target.season}${row.record.group}`);

test("版本新的在前，4.10 比 4.9 新", () => {
  assert.deepEqual(["4.5", "4.10", "4.9"].sort(compareSeason), ["4.10", "4.9", "4.5"]);
  assert.deepEqual(seasonsOf(targets, "混沌回忆"), ["4.6", "4.5"]);
  assert.deepEqual(seasonsOf(targets, "异相仲裁"), ["4.6"]);
});

test("关卡和分类跟着版本走，全部版本时合在一起不重复", () => {
  assert.deepEqual(stagesOf(targets, "混沌回忆", "4.6"), ["赞达尔"]);
  assert.deepEqual(stagesOf(targets, "混沌回忆", ALL), ["赞达尔", "呼雷"]);
  assert.deepEqual(categoriesOf(targets, "异相仲裁", "4.6", "[K1] 帕姆王"), ["通关"]);
  assert.deepEqual(categoriesOf(targets, "异相仲裁", ALL, ALL), ["通关", "0轮次"]);
});

test("打开一个模式：最新版本的第一关", () => {
  const opened = openMode(newFilter(), targets, "混沌回忆");
  assert.equal(opened.season, "4.6");
  assert.equal(opened.stage, "赞达尔");
  assert.deepEqual(rowsOf(targets, "混沌回忆", opened).map((row) => row.record.group), ["甲", "乙"]);
});

test("异相仲裁分骑士、普通王棋和绝境王棋", () => {
  assert.equal(stageKind(targets[3]), "骑士");
  assert.equal(stageKind(targets[4]), "绝境王棋");
  assert.equal(stageKind(targets[5]), "普通王棋");
  assert.equal(stageKind(targets[0]), "");
  assert.equal(stageLabel("异相仲裁", "亚婆离"), "普通王棋 · 亚婆离");
  assert.equal(stageLabel("混沌回忆", "赞达尔"), "赞达尔");
});

test("全部版本和全部关卡能一起查，版本、关卡、阵容组各自收窄", () => {
  assert.deepEqual(groups({}), ["4.6甲", "4.6乙", "4.5甲", "4.5丙"]);
  assert.deepEqual(groups({ season: "4.5" }), ["4.5甲", "4.5丙"]);
  assert.deepEqual(groups({ stage: "呼雷" }), ["4.5丙"]);
  assert.deepEqual(groups({ group: "甲" }), ["4.6甲", "4.5甲"]);
  assert.equal(totalRuns(targets, "混沌回忆", { ...newFilter(), stage: "赞达尔" }), 17);
});

test("限定、常驻上限和星魂", () => {
  assert.deepEqual(groups({ ltdMax: 1 }), ["4.6乙", "4.5丙"]);
  assert.deepEqual(groups({ stdMax: 0 }), ["4.6甲", "4.5甲", "4.5丙"]);
  assert.deepEqual(groups({ eidolon: "zero" }), ["4.5丙"]);
  assert.deepEqual(groups({ eidolon: "low" }), ["4.6甲", "4.6乙", "4.5甲", "4.5丙"]);
});

test("搜索：空格分开的词都要对上，角色和光锥都算，大小写不管", () => {
  assert.deepEqual(termsOf(" 爻光  绯英，真珠 "), ["爻光", "绯英", "真珠"]);
  assert.deepEqual(groups({ query: "甲 爻光" }), ["4.6甲", "4.5甲"]);
  assert.deepEqual(groups({ query: "丁 戊" }), ["4.5丙"]);
  assert.deepEqual(groups({ query: "甲 没有这个人" }), []);
  assert.equal(groups({ query: "光锥" }).length, 4);
  assert.ok(charMatches(char("Saber"), termsOf("saber")));
  assert.ok(!charMatches(char("甲"), []));
});

test("排序：限定最少、成绩最好、最新，不改原数组", () => {
  assert.deepEqual(groups({ sort: "gold" }), ["4.5丙", "4.6乙", "4.5甲", "4.6甲"]);
  assert.deepEqual(groups({ sort: "result" }), ["4.6乙", "4.5甲", "4.6甲", "4.5丙"]);
  assert.equal(groups({ sort: "date" })[0], "4.6甲");
  assert.deepEqual(groups({ stage: "[K1] 帕姆王", sort: "result" }, "异相仲裁"), ["4.6乙", "4.6甲"]);
  assert.deepEqual(groups({}), ["4.6甲", "4.6乙", "4.5甲", "4.5丙"]);
});

test("阵容组选项按数量排，不受已选阵容组影响", () => {
  assert.deepEqual(groupsOf(targets, "混沌回忆", { ...newFilter(), group: "乙" }), [{ group: "甲", count: 2 }, { group: "丙", count: 1 }, { group: "乙", count: 1 }]);
});

test("换版本后对不上的选项收回来，对得上的不动", () => {
  const moved = settle({ ...newFilter(), season: "4.6", stage: "呼雷", category: "满星", group: "丙" }, targets, "混沌回忆");
  assert.deepEqual([moved.stage, moved.category, moved.group], ["赞达尔", ALL, ALL]);
  const kept = settle({ ...newFilter(), season: "4.5", stage: "呼雷", group: "丙" }, targets, "混沌回忆");
  assert.deepEqual([kept.season, kept.stage, kept.group], ["4.5", "呼雷", "丙"]);
  assert.equal(settle({ ...newFilter(), season: "9.9" }, targets, "混沌回忆").season, "4.6");
});

test("存档：只认对得上的字段，旧存档的 selIdx 不影响", () => {
  const restored = restoreFilter({ season: "4.5", ltdMax: 2, eidolon: "bad", sort: "date", selIdx: 3 } as never);
  assert.deepEqual([restored.season, restored.ltdMax, restored.eidolon, restored.sort], ["4.5", 2, "any", "date"]);
  assert.deepEqual(restoreFilter(null), newFilter());
});

test("卡片标签：版本、骑士王棋、分类，看全部关卡时带关卡名，往期写存档时间", () => {
  assert.deepEqual(tagsOf({ target: targets[3], record: targets[3].records[0] }, false), ["4.6", "骑士", "通关", "零常驻"]);
  assert.deepEqual(tagsOf({ target: targets[2], record: targets[2].records[0] }, true), ["4.5", "0轮次", "呼雷", "零常驻", "全员 0 魂", "3 人队", "存档于 2026-10-16"]);
});

test("往期成绩接在最新数据后面，两边都有的用最新的", () => {
  const latest = { data: { targets: [targets[0]] } };
  const archive = { targets: [{ ...targets[0], total_runs: 1 }, targets[1]] };
  const merged = withArchive(latest, archive).data.targets;
  assert.equal(merged.length, 2);
  assert.equal(merged[0].total_runs, 10);
  assert.equal(merged[1].season, "4.5");
  assert.equal(withArchive(latest, null), latest);
});

test("随包的往期成绩：结构对，角色都有头像，有 4.5 的混沌回忆和虚构叙事，不带外部地址", () => {
  const file = "modules/honkai-star-rail/data/records_archive.json".split("/");
  const archive = json(...file);
  validate(archive);
  assert.ok(archive.targets.every((target: any) => /^\d{4}-\d{2}-\d{2}$/.test(target.archived_at)));
  for (const mode of ["混沌回忆", "虚构叙事"]) assert.ok(archive.targets.some((target: any) => target.mode === mode && target.season === "4.5"));
  const result = withAvatars({ data: archive }, json("modules", "honkai-star-rail", "data", "characters.json"), json("modules", "honkai-star-rail", "data", "lightcones.json"));
  assert.deepEqual(result.unmapped, []);
  const text = readFileSync(join(ROOT, ...file), "utf-8");
  assert.ok(!/github|jsdelivr/i.test(text));
});
