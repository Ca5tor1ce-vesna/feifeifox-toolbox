/** 「角色与遗器」的存档和后端动作（1.2）：读写、整库替换前的差异统计、局部合并、换穿、增删改。 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { ROSTER, rosterActions } from "../../shell/src/roster-actions.ts";
import { createStore, type Backend } from "../../shell/src/store.ts";
import { fromEnka } from "../../ui-shared/src/import/enka.ts";
import { diffLibrary, mergeCharacters, sameRelic } from "../../ui-shared/src/import/merge.ts";
import { buildStatData } from "../../ui-shared/src/stats/data.ts";
import type { RelicPiece, RosterSave } from "../../ui-shared/src/stats/types.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const DATA = join(ROOT, "modules", "honkai-star-rail", "data");
const json = (path: string): any => JSON.parse(readFileSync(path, "utf-8"));
const data = buildStatData(json(join(DATA, "characters.json")), json(join(DATA, "lightcones.json")), json(join(DATA, "relic_sets.json")), json(join(DATA, "relic_pieces.json")));
const sample = fromEnka(json(join(ROOT, "tests", "fixtures", "roster", "enka-1505-1510.json")), data);

function memoryStore(kind: Backend["kind"] = "tauri") {
  const files = new Map<string, string>();
  const store = createStore({ kind, read: async (name) => files.get(name) ?? null, write: async (name, text) => { files.set(name, text); } }, null);
  return { store, files };
}
async function setup(kind: Backend["kind"] = "tauri") {
  const { store, files } = memoryStore(kind);
  await store.ready;
  let n = 0;
  const actions = rosterActions(store, async () => data, () => `r${++n}`, () => new Date(2026, 10, 5, 14, 0, 0));
  return { store, files, actions };
}
const payload = { characters: sample.characters, relics: sample.relics, source: "enka" };

test("空存档：get 返回默认结构", async () => {
  const { actions } = await setup();
  assert.deepEqual(await actions.get(), { version: 1, uid: "", importedAt: "", source: "manual", characters: {}, relics: [] });
});

test("replace 之后能读回来，写进同名存档，导出存档里有它", async () => {
  const { actions, files, store } = await setup();
  const saved = await actions.replace(payload);
  assert.equal(Object.keys(saved.characters).length, 2);
  assert.equal(saved.relics.length, 12);
  assert.ok(saved.relics.every((r: RelicPiece) => /^r\d+$/.test(r.id)), "存档里的遗器编号由存档自己发");
  assert.equal(saved.importedAt, "2026-11-05 14:00");
  assert.equal(JSON.parse(files.get(ROSTER)!).relics.length, 12);
  assert.ok((store.exportAll() as any).stores[ROSTER]);
});

test("同一份数据第二次 preview_replace 是没有变化（Review Focus 3）", async () => {
  const { actions } = await setup();
  assert.deepEqual(await actions.preview_replace(payload), { added: 12, removed: 0, changed: 0, characters: 2 });
  await actions.replace(payload);
  assert.deepEqual(await actions.preview_replace(payload), { added: 0, removed: 0, changed: 0, characters: 2 });
});

test("diffLibrary：强化过的遗器算改动，换了人穿也算改动", () => {
  const before: RosterSave = { version: 1, uid: "", importedAt: "", source: "enka", characters: {}, relics: sample.relics };
  const upgraded = sample.relics.map((r, i) => (i === 0 ? { ...r, subAffixes: r.subAffixes.map((s, j) => (j === 0 ? { ...s, count: s.count + 1 } : s)) } : r));
  assert.deepEqual(diffLibrary(before, { ...before, relics: upgraded }), { added: 0, removed: 0, changed: 1, characters: 0 });
  const moved = sample.relics.map((r, i) => (i === 0 ? { ...r, equippedBy: null } : r));
  assert.deepEqual(diffLibrary(before, { ...before, relics: moved }), { added: 0, removed: 0, changed: 1, characters: 0 });
  assert.deepEqual(diffLibrary(before, { ...before, relics: sample.relics.slice(1) }), { added: 0, removed: 1, changed: 0, characters: 0 });
});

test("merge 两次不多出遗器（Review Focus 3）", async () => {
  const { actions } = await setup();
  await actions.merge({ ...payload, loose: false });
  const twice = await actions.merge({ ...payload, loose: false });
  assert.equal(twice.relics.length, 12);
});

test("merge 只改传进来的角色：原来穿着、这次没穿的遗器变成未装备，不删除", async () => {
  const { actions } = await setup();
  await actions.replace(payload);
  const feiyingOnly = sample.characters.filter((c) => c.id === "1505");
  const twoPieces = sample.relics.filter((r) => r.equippedBy === "1505").slice(0, 2);
  const merged = await actions.merge({ characters: feiyingOnly, relics: twoPieces, source: "enka", loose: false });
  assert.equal(merged.relics.length, 12, "没有遗器被删除");
  assert.equal(merged.relics.filter((r: RelicPiece) => r.equippedBy === "1505").length, 2);
  assert.equal(merged.relics.filter((r: RelicPiece) => r.equippedBy === null).length, 4);
  assert.equal(merged.relics.filter((r: RelicPiece) => r.equippedBy === "1510").length, 6, "别的角色不受影响");
});

test("sameRelic：识图模式（loose）不看档位，其余都要一样", () => {
  const relic = sample.relics[0];
  const otherStep = { ...relic, id: "x", subAffixes: relic.subAffixes.map((s, i) => (i === 0 ? { ...s, step: s.step + 1 } : s)) };
  assert.ok(sameRelic(relic, { ...relic, id: "y", equippedBy: null }, false), "编号和穿戴不算内容");
  assert.ok(!sameRelic(relic, otherStep, false));
  assert.ok(sameRelic(relic, otherStep, true));
  assert.ok(!sameRelic(relic, { ...relic, level: relic.level - 1 }, true));
});

test("mergeCharacters 识图模式：档位不同也认成同一件，换穿过去而不是新增", () => {
  const save: RosterSave = { version: 1, uid: "", importedAt: "", source: "enka", characters: {}, relics: sample.relics.map((r) => ({ ...r, equippedBy: null })) };
  const fuzzy = sample.relics.filter((r) => r.equippedBy === "1505").map((r) => ({ ...r, id: "tmp", subAffixes: r.subAffixes.map((s) => ({ ...s, step: 0 })) }));
  let n = 0;
  const merged = mergeCharacters(save, { characters: sample.characters.filter((c) => c.id === "1505"), relics: fuzzy }, true, () => `n${++n}`);
  assert.equal(merged.relics.length, 12);
  assert.equal(merged.relics.filter((r) => r.equippedBy === "1505").length, 6);
});

test("equip：换到别人身上时，对方同部位那件脱下来", async () => {
  const { actions } = await setup();
  const saved = await actions.replace(payload);
  const feiyingHead = saved.relics.find((r: RelicPiece) => r.equippedBy === "1505" && data.pieces.get(r.pieceId)!.slot === "HEAD")!;
  const himekoHead = saved.relics.find((r: RelicPiece) => r.equippedBy === "1510" && data.pieces.get(r.pieceId)!.slot === "HEAD")!;
  const after = await actions.equip({ relicId: feiyingHead.id, characterId: "1510" });
  const find = (id: string) => after.relics.find((r: RelicPiece) => r.id === id)!;
  assert.equal(find(feiyingHead.id).equippedBy, "1510");
  assert.equal(find(himekoHead.id).equippedBy, null);
  const off = await actions.equip({ relicId: feiyingHead.id, characterId: null });
  assert.equal(off.relics.find((r: RelicPiece) => r.id === feiyingHead.id).equippedBy, null);
  await assert.rejects(actions.equip({ relicId: "不存在", characterId: null }), /这件遗器已经不在了/);
});

test("save_relic、delete_relic、save_character 的校验", async () => {
  const { actions } = await setup();
  const created = await actions.save_relic({ relic: { pieceId: "61191", level: 15, mainAffix: "1", subAffixes: [{ affix: "7", count: 1, step: 2 }], equippedBy: null } });
  assert.equal(created.relics[0].id, "r1");
  await assert.rejects(actions.save_relic({ relic: { pieceId: "99999", level: 15, mainAffix: "1", subAffixes: [], equippedBy: null } }), /遗器编号 99999 不在数据里/);
  await assert.rejects(actions.save_relic({ relic: { pieceId: "61191", level: 16, mainAffix: "1", subAffixes: [], equippedBy: null } }), /等级/);
  const removed = await actions.delete_relic({ id: "r1" });
  assert.deepEqual(removed.relics, []);
  const withChar = await actions.save_character({ character: { id: "1312", level: 40, promotion: 2, eidolon: 0, lightcone: null, traces: [], defaults: [] } });
  assert.equal(withChar.characters["1312"].level, 40);
  await assert.rejects(actions.save_character({ character: { id: "1999", level: 80, promotion: 6, eidolon: 0, lightcone: null, traces: [], defaults: [] } }), /角色 1999 不在数据里/);
  await assert.rejects(actions.save_character({ character: { id: "1312", level: 90, promotion: 6, eidolon: 0, lightcone: null, traces: [], defaults: [] } }), /等级/);
});

test("网页版（不是 exe）调 UID 查询报出能看懂的话", async () => {
  const { actions } = await setup("browser");
  await assert.rejects(actions.showcase({ uid: "102304752" }), /网页版不支持 UID 查询，请用 exe 或导入文件/);
});

test("exe 里 UID 查询：把 Enka 的返回转好并合并，记下 UID，跳过的条目交给页面", async () => {
  const { store } = memoryStore("tauri");
  await store.ready;
  const raw = readFileSync(join(ROOT, "tests", "fixtures", "roster", "enka-1505-1510.json"), "utf-8");
  const calls: unknown[] = [];
  let n = 0;
  const actions = rosterActions(store, async () => data, () => `r${++n}`, () => new Date(2026, 10, 5, 14, 0, 0), async (command, args) => {
    calls.push([command, args]);
    return raw;
  });
  const result = await actions.showcase({ uid: " 102304752 " });
  assert.deepEqual(calls, [["fetch_showcase", { uid: "102304752" }]]);
  assert.equal(result.roster.uid, "102304752");
  assert.equal(result.roster.source, "enka");
  assert.equal(result.roster.relics.length, 12);
  assert.deepEqual(result.skipped, []);
  const again = await actions.showcase({ uid: "102304752" });
  assert.equal(again.roster.relics.length, 12, "再查一次不多出遗器");
});

test("exe 里 UID 查询：UID 不对先在页面这边拦下，Rust 报的错原样交给页面", async () => {
  const { store } = memoryStore("tauri");
  await store.ready;
  const actions = rosterActions(store, async () => data, undefined, undefined, async () => { throw "查得太频繁，请 30 秒后再试。"; });
  await assert.rejects(actions.showcase({ uid: "123" }), /UID 是 9 到 10 位数字/);
  await assert.rejects(actions.showcase({ uid: "102304752" }), /查得太频繁，请 30 秒后再试/);
});
