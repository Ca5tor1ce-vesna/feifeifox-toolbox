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
