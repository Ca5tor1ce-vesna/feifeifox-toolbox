/** 「读取我的配装」在浏览器里算：拿配速查询存的配置，用 speed-ui/src/calc.ts 算出这名角色的速度。 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { createApi } from "../../speed-ui/src/calc.ts";
import type { SavedBuild } from "../../axis-ui/src/build.ts";
import { makeBuildResolver } from "../../axis-ui/src/resolve-build.ts";

const DATA = join(import.meta.dirname, "..", "..", "modules", "honkai-star-rail", "data");
const json = (name: string): unknown => JSON.parse(readFileSync(join(DATA, `${name}.json`), "utf-8"));
const data = { characters: json("characters"), lightcones: json("lightcones"), relicSets: json("relic_sets"), modes: json("modes") };

test("读取我的配装：按保存的配置算，结果和配速查询一样", async () => {
  const config = { eidolon: 2, superimpose: 1, relic: { speedBoots: true, substatSpeed: 33, ornamentIds: ["308"] }, aha: { err: 19.4, initialEnergy: 80, rotation: "basic" } };
  const presets: Record<string, SavedBuild> = { "1502": { name: "爻光", savedAt: "2026-11-04 12:00", config } as SavedBuild };
  const resolve = makeBuildResolver(data, async () => presets);
  const resolved = await resolve("1502");
  assert.equal(resolved.entry, presets["1502"]);
  const expected = createApi({ characters: data.characters, lightcones: data.lightcones, relic_sets: data.relicSets, modes: data.modes, dataInfo: {} })
    .call("plan", { ...config, characterId: "1502" });
  assert.deepEqual(resolved.result, expected);
  assert.ok(resolved.result.speed.final > 0);
});

test("没存过配装的角色给出能看懂的提示", async () => {
  const resolve = makeBuildResolver(data, async () => ({}));
  await assert.rejects(resolve("1313"), /该角色尚未保存配装，请先到配速查询保存/);
  await assert.rejects(makeBuildResolver(data, async () => undefined)("1313"), /尚未保存配装/);
});

test("读取实际装配（1.2）：开战前速度等于面板速度，能量恢复效率只记遗器和行迹给的部分，欢愉度记成真实属性", async () => {
  const { buildStatData } = await import("../../ui-shared/src/stats/data.ts");
  const { fromEnka } = await import("../../ui-shared/src/import/enka.ts");
  const { computePanel } = await import("../../ui-shared/src/stats/panel.ts");
  const { memberFromRoster } = await import("../../axis-ui/src/roster-member.ts");
  const { createBattle } = await import("../../axis-engine/src/battle.ts");
  const { toMemberInput } = await import("../../axis-ui/src/model.ts");
  const stats = buildStatData(data.characters, data.lightcones, data.relicSets, json("relic_pieces"));
  const enka = fromEnka(JSON.parse(readFileSync(join(import.meta.dirname, "..", "fixtures", "roster", "enka-1505-1510.json"), "utf-8")), stats);
  const game = { axis: json("axis_data"), characters: data.characters } as any;
  const catalog = { lightcones: data.lightcones as any[], relicSets: data.relicSets as any[] };
  for (const id of ["1505", "1510"]) {
    const character = enka.characters.find((c) => c.id === id)!;
    const relics = enka.relics.filter((r) => r.equippedBy === id);
    const member = memberFromRoster(character, relics, stats, game, catalog);
    const panel = computePanel(character, relics, stats);
    const unit = createBattle({ team: [toMemberInput(member)], maxAV: 1 }, game).units[0];
    assert.ok(Math.abs(unit.speed() - panel.spd.total) < 1e-3, `${id} 引擎 ${unit.speed()}，面板 ${panel.spd.total}`);
    assert.equal(member.buildName, "实际装配");
    assert.ok(Math.abs(member.measured!.elation - panel.elation.total) < 1e-9);
  }
  const feiying = memberFromRoster(enka.characters.find((c) => c.id === "1505")!, enka.relics.filter((r) => r.equippedBy === "1505"), stats, game, catalog);
  assert.ok(Math.abs(feiying.err - 19.44) < 0.01, `绯英只有连结绳主词条的能量恢复效率 19.44%，实际 ${feiying.err}`);
  assert.equal(feiying.cavernId, "129");
  assert.equal(feiying.ornamentId, "325");
});
