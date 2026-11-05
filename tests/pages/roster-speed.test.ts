/** 配速查询「用实际装配填入」（1.2）：角色与遗器里的实际装配 → 配速查询的配置，算出的初始速度和面板速度一致。 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { speedConfigFromRoster } from "../../shell/src/roster-actions.ts";
import { createApi } from "../../speed-ui/src/calc.ts";
import { fromEnka } from "../../ui-shared/src/import/enka.ts";
import { buildStatData } from "../../ui-shared/src/stats/data.ts";
import { computePanel, displayStat } from "../../ui-shared/src/stats/panel.ts";
import { toSpeedConfig } from "../../ui-shared/src/stats/to-speed-config.ts";
import type { RelicPiece } from "../../ui-shared/src/stats/types.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const DATA = join(ROOT, "modules", "honkai-star-rail", "data");
const json = (path: string): any => JSON.parse(readFileSync(path, "utf-8"));
const raw = { characters: json(join(DATA, "characters.json")), lightcones: json(join(DATA, "lightcones.json")), relicSets: json(join(DATA, "relic_sets.json")), relicPieces: json(join(DATA, "relic_pieces.json")) };
const data = buildStatData(raw.characters, raw.lightcones, raw.relicSets, raw.relicPieces);
const calc = createApi({ characters: raw.characters, lightcones: raw.lightcones, relic_sets: raw.relicSets, modes: json(join(DATA, "modes.json")), dataInfo: {} });
const sample = fromEnka(json(join(ROOT, "tests", "fixtures", "roster", "enka-1505-1510.json")), data);
const of = (id: string) => ({ character: sample.characters.find((c) => c.id === id)!, relics: sample.relics.filter((r) => r.equippedBy === id) });

test("toSpeedConfig：光锥、叠影、星魂照抄，4 件套和外圈、速度鞋、副词条速度按身上的遗器填", () => {
  const { character, relics } = of("1505");
  const { config } = toSpeedConfig(character, relics, data);
  assert.equal(config.lightconeId, "23058");
  assert.equal(config.superimpose, 5);
  assert.equal(config.eidolon, 6);
  assert.equal(config.relic.fourPieceId, "129", "魔法少女 4 件");
  assert.equal(config.relic.ornamentIds[0], "325", "朋克洛德 2 件");
  assert.equal(config.relic.speedBoots, true);
  assert.ok(Math.abs(config.relic.substatSpeed - (2.3 + 2.3)) < 0.31, `副词条速度 ${config.relic.substatSpeed}`);
});

for (const [id, shown] of [["1505", "138"], ["1510", "100"]] as const) {
  test(`配速查询算出的初始速度等于面板速度（${id}，图上 ${shown}）`, () => {
    const { character, relics } = of(id);
    const filled = speedConfigFromRoster(character, relics, data, calc);
    const result = calc.call("plan", { ...filled.config, characterId: id });
    const panel = computePanel(character, relics, data);
    assert.ok(Math.abs(result.speed.final - panel.spd.total) < 1e-6, `配速 ${result.speed.final}，面板 ${panel.spd.total}`);
    assert.equal(displayStat("spd", result.speed.final), shown);
  });
}

test("2+2 内圈：配速查询的初始速度仍然等于面板速度（Review Focus 2）", () => {
  const { character, relics } = of("1505");
  const swapped: RelicPiece[] = relics.map((r) => {
    const info = data.pieces.get(r.pieceId)!;
    return info.slot === "HEAD" || info.slot === "HAND" ? { ...r, pieceId: `6114${info.slot === "HEAD" ? 1 : 2}` } : r; // 换成 2 件信使（速度 +6%）
  });
  const filled = speedConfigFromRoster(character, swapped, data, calc);
  assert.equal(filled.config.relic.fourPieceId, "", "凑不满 4 件就不填 4 件套");
  const result = calc.call("plan", { ...filled.config, characterId: "1505" });
  assert.ok(Math.abs(result.speed.final - computePanel(character, swapped, data).spd.total) < 1e-6);
});

test("光锥命途不同时不填光锥（配速查询不允许），速度照样对得上", () => {
  const { character, relics } = of("1505");
  const other = { ...character, lightcone: { id: "23060", level: 80, promotion: 6, superimpose: 1 } };
  const filled = speedConfigFromRoster(other, relics, data, calc);
  assert.equal(filled.config.lightconeId, "");
  assert.ok(filled.notes.some((line) => line.includes("命途")));
  const result = calc.call("plan", { ...filled.config, characterId: "1505" });
  assert.ok(Math.abs(result.speed.final - computePanel(other, relics, data).spd.total) < 1e-6);
});
