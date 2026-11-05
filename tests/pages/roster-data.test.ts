/** 「角色与遗器」用的数据：白值、属性行迹、光锥面板属性、单件遗器和主副词条表都齐全（1.2）。 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const ROOT = join(import.meta.dirname, "..", "..");
const DATA = join(ROOT, "modules", "honkai-star-rail", "data");
const read = (name: string): string => readFileSync(join(DATA, name), "utf-8");
const json = (name: string): any => JSON.parse(read(name));

const isPair = (value: unknown): boolean => Array.isArray(value) && value.length === 2 && value.every((n) => typeof n === "number" && n >= 0);

test("每个角色都有 7 档突破白值和属性行迹", () => {
  for (const character of json("characters.json")) {
    assert.equal(character.promotions?.length, 7, `${character.name} 的白值不是 7 档`);
    for (const row of character.promotions) {
      assert.ok(isPair(row.hp) && isPair(row.atk) && isPair(row.def), `${character.name} 的生命、攻击、防御格式不对`);
      assert.ok(row.spd > 0 && row.critRate === 0.05 && row.critDmg === 0.5, `${character.name} 的速度、暴击不对`);
    }
    assert.ok(Object.keys(character.statTraces ?? {}).length > 0, `${character.name} 没有属性行迹`);
    for (const [node, props] of Object.entries<any[]>(character.statTraces)) {
      assert.ok(node.startsWith(String(character.id).slice(0, 4)), `${character.name} 的行迹节点 ${node} 不是自己的`);
      assert.ok(props.every((p) => typeof p.type === "string" && typeof p.value === "number"));
    }
  }
});

test("绯英 4.6.54 版本资料：突破 6 的生命基础值 484.704、成长 7.128，速度 104", () => {
  const feiying = json("characters.json").find((c: any) => c.id === "1505");
  assert.deepEqual(feiying.promotions[6].hp, [484.704, 7.128]);
  assert.equal(feiying.promotions[6].spd, 104);
  assert.deepEqual(feiying.statTraces["1505201"], [{ type: "CriticalChanceBase", value: 0.027 }]);
});

test("每把光锥都有 7 档白值和 5 档叠影的面板属性", () => {
  for (const cone of json("lightcones.json")) {
    assert.equal(cone.promotions?.length, 7, `${cone.name} 的白值不是 7 档`);
    assert.ok(cone.promotions.every((row: any) => isPair(row.hp) && isPair(row.atk) && isPair(row.def)), `${cone.name} 的白值格式不对`);
    assert.equal(cone.panelProps?.length, 5, `${cone.name} 的面板属性不是 5 档`);
  }
});

test("每件遗器的套装、主词条组、副词条组都能查到", () => {
  const { pieces, mainAffixes, subAffixes } = json("relic_pieces.json");
  const sets = new Set(json("relic_sets.json").map((s: any) => String(s.id)));
  const slots = new Set(["HEAD", "HAND", "BODY", "FOOT", "NECK", "OBJECT"]);
  for (const [id, piece] of Object.entries<any>(pieces)) {
    assert.ok(sets.has(piece.setId), `遗器 ${id} 的套装 ${piece.setId} 不在套装表里`);
    assert.ok(slots.has(piece.slot), `遗器 ${id} 的部位 ${piece.slot} 不认识`);
    assert.ok(mainAffixes[piece.mainGroup], `遗器 ${id} 的主词条组 ${piece.mainGroup} 不在表里`);
    assert.ok(subAffixes[piece.subGroup], `遗器 ${id} 的副词条组 ${piece.subGroup} 不在表里`);
  }
  for (const setId of sets) assert.ok(Object.values<any>(pieces).some((p) => p.setId === setId), `套装 ${setId} 没有单件遗器`);
  assert.deepEqual(mainAffixes["51"]["1"], { type: "HPDelta", base: 112.896, step: 39.5136 });
});

test("面板用的数据文件里没有网址", () => {
  for (const name of ["characters.json", "lightcones.json", "relic_sets.json", "relic_pieces.json"]) {
    const urls = read(name).match(/https?:\/\/[^"]+/g) ?? [];
    assert.deepEqual(urls, [], `${name} 里有网址`);
  }
});
