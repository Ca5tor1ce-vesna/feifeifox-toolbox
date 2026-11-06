/** 行动轴页面的伤害展示：有模型才出现，面板传给模型，数字能对回时间轴。倍率都是假数。 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import type { GameData } from "../../axis-engine/src/battle.ts";
import type { DamageModel } from "../../axis-engine/src/damage/types.ts";
import { activeDamage, cardDamage, formatDamage } from "../../axis-ui/src/damage.ts";
import { computeAxis, newMember, newState, type PageData, type PageState } from "../../axis-ui/src/model.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const dataDir = join(HERE, "..", "..", "modules", "honkai-star-rail", "data");
const json = (name: string) => JSON.parse(readFileSync(join(dataDir, name), "utf-8"));
const game: GameData = { axis: json("axis_data.json"), characters: json("characters.json") };
const data: PageData = { game, characters: [], lightcones: [], relicSets: [], modes: json("modes.json").modes };

const HIMEKO = "1003";
const LYNX = "1110";
const stateOf = (...ids: string[]): PageState => ({ ...newState(), useTechnique: false, team: ids.map(newMember) });
const model: DamageModel = { evaluate: (hit) => (hit.kind === "skill" ? { zones: [{ zone: "增伤", factor: 2 }], expected: 100 } : null) };

test("没有伤害模型时页面数据里没有伤害", () => {
  assert.equal(activeDamage(""), null);
  assert.equal(computeAxis(stateOf(HIMEKO), data, null).damage, null);
});

test("预览只在地址带参数时打开，并标成预览", () => {
  assert.equal(activeDamage("?damage-preview")?.preview, true);
  assert.equal(activeDamage("?x=1&damage-preview=1")?.preview, true);
  const view = computeAxis(stateOf(HIMEKO), data, activeDamage("?damage-preview"));
  assert.equal(view.damage?.preview, true);
  assert.ok(view.damage!.total > 0);
});

test("总数、占比和每 100 AV 能对上，缺资料的写成人话", () => {
  const view = computeAxis(stateOf(HIMEKO, LYNX), data, { model });
  const damage = view.damage!;
  const skills = view.rows.filter((row) => row.type === "skill").length;
  assert.equal(damage.total, skills * 100);
  assert.ok(Math.abs(damage.per100AV - (damage.total / view.maxAV) * 100) < 1e-9);
  assert.ok(Math.abs(damage.units.reduce((sum, unit) => sum + unit.share, 0) - 1) < 1e-9);
  assert.ok(damage.missing.some((text) => /终结技 ×\d+/.test(text)) || view.rows.every((row) => row.type !== "ultimate"));
});

test("伤害挂在对应的时间轴行上，一张卡能把几行加起来", () => {
  const view = computeAxis(stateOf(HIMEKO), data, { model });
  const skill = view.rows.find((row) => row.type === "skill")!;
  assert.equal(view.damage!.rows[skill.key].expected, 100);
  assert.equal(view.damage!.rows[skill.key].zones[0].zone, "增伤");
  const basic = view.rows.find((row) => row.type === "ultimate");
  if (basic) assert.equal(view.damage!.rows[basic.key], undefined);
  assert.equal(cardDamage([skill.key, skill.key], view.damage!.rows), 200);
  assert.equal(cardDamage(["没有这一行"], view.damage!.rows), null);
  assert.equal(cardDamage([skill.key], null), null);
});

test("读过实际装配的面板会传给模型，没读的列出来", () => {
  const seen = new Map<string, unknown>();
  const spy: DamageModel = { evaluate: (hit, { attacker }) => { seen.set(hit.unitId, attacker); return null; } };
  const state = stateOf(HIMEKO, LYNX);
  state.team[0].panel = { atk: 3210 };
  const view = computeAxis(state, data, { model: spy });
  assert.deepEqual(seen.get(HIMEKO), { atk: 3210 });
  assert.equal(seen.get(LYNX), null);
  assert.deepEqual(view.damage!.noPanel, [view.units[1].name]);
});

test("数字按千分位显示，四舍五入", () => {
  assert.equal(formatDamage(1234567.6), "1,234,568");
});
