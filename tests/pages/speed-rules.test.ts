/** 配速查询的几条独立规则（从原来的 Python 测试搬过来）：副词条上限、每个角色都有配色、「我的配装」存取。 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { createApi } from "../../speed-ui/src/calc.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const DATA = join(ROOT, "modules", "honkai-star-rail", "data");
const json = (name: string): any => JSON.parse(readFileSync(join(DATA, `${name}.json`), "utf-8"));
const data = { characters: json("characters"), lightcones: json("lightcones"), relic_sets: json("relic_sets"), modes: json("modes"), dataInfo: json("data_info") };

test("副词条速度上限跟速度鞋走：穿鞋 78，不穿 93.6；超了或负数都报错", () => {
  const api = createApi(data);
  for (const [boots, limit] of [[true, 78.0], [false, 93.6]] as const) {
    const plan = (substatSpeed: number): any => api.call("plan", { characterId: "1502", relic: { speedBoots: boots, substatSpeed } });
    const breakdown = plan(limit).speed.breakdown;
    assert.ok(Math.abs(breakdown.find((item: any) => item.label === "遗器副词条速度").value - limit) < 1e-9);
    assert.throws(() => plan(limit + 0.1), /副词条/);
  }
  assert.throws(() => api.call("plan", { characterId: "1502", relic: { substatSpeed: -1 } }), /副词条/);
});

test("每个收录的角色都有且只有一个配色", () => {
  const source = readFileSync(join(ROOT, "speed-ui", "src", "themes.ts"), "utf-8");
  const groups = source.split("const CHARACTER_THEME_GROUPS = {")[1].split("};")[0];
  const ids = [...groups.matchAll(/"(\d+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, new Set(ids).size, "角色配色不能重复配置");
  assert.deepEqual(new Set(ids), new Set(data.characters.map((character: any) => String(character.id))));
});

test("「我的配装」存、读、删；没有角色或配置时报错", () => {
  let saved: any = {};
  const api = createApi(data, { load: () => saved, save: (value: any) => { saved = JSON.parse(JSON.stringify(value)); } });
  const result = api.call("save_preset", { characterId: "1502", config: { eidolon: 1, relic: { substatSpeed: 10 } } });
  assert.equal(result.saved, "1502");
  assert.equal(saved["1502"].name, "爻光");
  assert.match(saved["1502"].savedAt, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  assert.deepEqual(Object.keys(api.call("presets", {}).presets), ["1502"]);
  assert.throws(() => api.call("save_preset", { config: {} }), /缺少 characterId/);
  assert.throws(() => api.call("save_preset", { characterId: "1502" }), /缺少 config/);
  assert.throws(() => api.call("save_preset", { characterId: "1502", config: { relic: { speedBoots: true, substatSpeed: 99 } } }), /副词条/);
  assert.equal(api.call("delete_preset", { characterId: "1502" }).count, 0);
});

test("技能数值按练得到的等级：0 魂战技/终结技/天赋 10 级，3/5 魂加了等级就换成加完的数", () => {
  const api = createApi(data);
  const effect = (characterId: string, eidolon: number, name: string, list: "speed" | "advance"): any[] =>
    api.call("plan", { characterId, eidolon }).effects[list].filter((item: any) => item.name === name);
  // 艾丝妲终结技：Lv10 全队 +50 速度，E5 终结技 +2 级 → Lv12 +52.8（资料最高的 Lv15 是 57，练不到）
  assert.deepEqual(effect("1009", 0, "星空祝言", "speed").map((item) => item.value), [50]);
  assert.deepEqual(effect("1009", 4, "星空祝言", "speed").map((item) => item.value), [50]);
  const e5 = effect("1009", 5, "星空祝言", "speed");
  assert.deepEqual(e5.map((item) => item.value), [52.8]);
  assert.match(e5[0].text, /52\.8/);
  // 布洛妮娅天赋：普攻后拉条 Lv10 30%，E3 天赋 +2 级 → Lv12 33%；只有一条，不再有 1 级和 15 级两份
  assert.deepEqual(effect("1101", 2, "先人一步", "advance").map((item) => item.value), [30]);
  assert.deepEqual(effect("1101", 3, "先人一步", "advance").map((item) => item.value), [33]);
});

test("有强化版的角色（3.4 老角色加强）：默认按强化版，enhanced: false 按原版", () => {
  const api = createApi(data);
  const names = (payload: any, list: "speed" | "advance") => api.call("plan", payload).effects[list].map((item: any) => `${item.name}:${item.value}:${item.durationTurns}`);
  // 瓦尔特天赋的【失重】减速只有强化版有
  assert.ok(names({ characterId: "1004" }, "speed").some((item: string) => item.startsWith("时空扭曲")));
  assert.ok(!names({ characterId: "1004", enhanced: false }, "speed").some((item: string) => item.startsWith("时空扭曲")));
  // 希儿战技提速：强化版 3 回合，原版 2 回合
  assert.deepEqual(names({ characterId: "1102" }, "speed").filter((item: string) => item.startsWith("归刃")), ["归刃:25:3"]);
  assert.deepEqual(names({ characterId: "1102", enhanced: false }, "speed").filter((item: string) => item.startsWith("归刃")), ["归刃:25:2"]);
  // 镜流行迹【剑首】的拉条只有原版有
  assert.ok(!names({ characterId: "1212" }, "advance").some((item: string) => item.startsWith("剑首")));
  assert.ok(names({ characterId: "1212", enhanced: false }, "advance").some((item: string) => item.startsWith("剑首")));
  // 藿藿 E1 全队 +12% 两版都有（原版文案是「提高12%的速度」）
  for (const enhanced of [true, false]) {
    const e1 = api.call("plan", { characterId: "1217", eidolon: 1, enhanced }).effects.speed.find((item: any) => item.rank === 1);
    assert.equal(e1?.value, 12);
    assert.equal(e1?.apply, "team");
  }
  // 数据里标了哪些角色有强化版
  const list = data.characters.filter((item: any) => item.enhanceable).map((item: any) => item.id).sort();
  assert.deepEqual(list, ["1004", "1005", "1006", "1102", "1205", "1212", "1217", "1306", "1307", "1310"]);
});
