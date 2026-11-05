/** 单件遗器的主副词条数值（1.2「角色与遗器」）。预期按 4.6.54 版本资料的数值表手算。 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { buildStatData } from "../../ui-shared/src/stats/data.ts";
import { relicStats } from "../../ui-shared/src/stats/relic.ts";
import { PROPERTY_TO_STAT, type RelicPiece } from "../../ui-shared/src/stats/types.ts";

const DATA = join(import.meta.dirname, "..", "..", "modules", "honkai-star-rail", "data");
const json = (name: string): any => JSON.parse(readFileSync(join(DATA, name), "utf-8"));
const data = buildStatData(json("characters.json"), json("lightcones.json"), json("relic_sets.json"), json("relic_pieces.json"));

const near = (actual: number, expected: number, label: string): void => assert.ok(Math.abs(actual - expected) < 1e-6, `${label}：期望 ${expected}，实际 ${actual}`);

// 2026-11-05 Enka 返回里绯英的头（铁骑的索敌战盔，+15）。
const helmet: RelicPiece = {
  id: "r1", pieceId: "61191", level: 15, mainAffix: "1", equippedBy: "1505",
  subAffixes: [
    { affix: "4", count: 1, step: 1 },
    { affix: "5", count: 2, step: 2 },
    { affix: "7", count: 1, step: 2 },
    { affix: "12", count: 4, step: 5 },
  ],
};

test("主词条 = 基础值 + 每级成长 × 等级：+15 头的生命 705.6", () => {
  const { main } = relicStats(helmet, data);
  assert.equal(main.type, "HPDelta");
  near(main.value, 112.896 + 39.5136 * 15, "生命");
  near(main.value, 705.6, "生命");
});

test("副词条 = 基础值 × 次数 + 档位增量 × 档位", () => {
  const { subs } = relicStats(helmet, data);
  assert.deepEqual(subs.map((s) => s.type), ["HPAddedRatio", "AttackAddedRatio", "SpeedDelta", "BreakDamageAddedRatioBase"]);
  near(subs[0].value, 0.03456 + 0.00432 * 1, "生命%");
  near(subs[1].value, 0.03456 * 2 + 0.00432 * 2, "攻击%");
  // 速度一次 2.0，每档 +0.3：1 次 2 档 = 2.6（Enka 取整后也是 2.6）。
  near(subs[2].value, 2.6, "速度");
  near(subs[3].value, 0.05184 * 4 + 0.00648 * 5, "击破特攻");
});

test("查不到的遗器编号、词条编号报出具体是哪个", () => {
  assert.throws(() => relicStats({ ...helmet, pieceId: "99999" }, data), /遗器编号 99999 不在数据里/);
  assert.throws(() => relicStats({ ...helmet, mainAffix: "9" }, data), /主词条 9/);
  assert.throws(() => relicStats({ ...helmet, subAffixes: [{ affix: "99", count: 1, step: 0 }] }, data), /副词条 99/);
});

test("数据里出现的每一种属性都认识", () => {
  const types = new Set<string>();
  for (const c of json("characters.json")) for (const props of Object.values<any[]>(c.statTraces)) for (const p of props) types.add(p.type);
  for (const l of json("lightcones.json")) for (const level of l.panelProps) for (const p of level) types.add(p.type);
  for (const s of json("relic_sets.json")) for (const level of s.properties) for (const p of level) types.add(p.type);
  const { mainAffixes, subAffixes } = json("relic_pieces.json");
  for (const table of [mainAffixes, subAffixes]) for (const group of Object.values<any>(table)) for (const a of Object.values<any>(group)) types.add(a.type);
  const unknown = [...types].filter((type) => !PROPERTY_TO_STAT[type]);
  assert.deepEqual(unknown, [], `不认识的属性：${unknown.join("、")}`);
});

test("属性分类：固定值、百分比、加算、白值", () => {
  assert.deepEqual(PROPERTY_TO_STAT.HPDelta, { stat: "hp", kind: "flat" });
  assert.deepEqual(PROPERTY_TO_STAT.SpeedAddedRatio, { stat: "spd", kind: "pct" });
  assert.deepEqual(PROPERTY_TO_STAT.CriticalChanceBase, { stat: "critRate", kind: "add" });
  assert.deepEqual(PROPERTY_TO_STAT.ElationDamageAddedRatioBase, { stat: "elation", kind: "add" });
  assert.deepEqual(PROPERTY_TO_STAT.ThunderAddedRatio, { stat: "dmgLightning", kind: "add" });
  assert.deepEqual(PROPERTY_TO_STAT.BaseSpeed, { stat: "spd", kind: "base" });
});
