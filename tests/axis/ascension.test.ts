/**
 * 「欢愉」命途升格的 2 级和昔涟【献予「创世」之诗】。预期按原文参数手算，不来自引擎。
 * 星神★阿哈 2 魂「使「欢愉」命途升格效果获得加强」（4.6.54），各【欢愉万相★】行迹的 1、2 级参数见 4.6.53。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { createBattle, type GameData } from "../../axis-engine/src/battle.ts";
import { simulateLegacy } from "../../axis-engine/src/legacy.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const dataDir = join(HERE, "..", "..", "modules", "honkai-star-rail", "data");
const json = (name: string) => JSON.parse(readFileSync(join(dataDir, name), "utf-8"));
const game: GameData = { axis: json("axis_data.json"), characters: json("characters.json") };

/* 旧结果结构里的事件、单位，字段多，这里不逐个写类型。 */
type Row = { label: string; type: string; name: string; details: string[]; av: number; res: Record<string, number | null> };
type Result = { timeline: Row[]; notes: string[]; units: { id: string; finalSpd: number; finalEnergy: number; mechanics: Record<string, unknown> }[] };

const sim = (payload: Record<string, unknown>) => simulateLegacy(payload) as unknown as Result;
const unit = (res: Result, id: string) => res.units.find((item) => item.id === id)!;
const near = (actual: number, expected: number, message = "") =>
  assert.ok(Math.abs(actual - expected) < 1e-7, `${message} 期望 ${expected}，实际 ${actual}`);

const slowAha = (eidolon: number) => ({ id: "1511", eidolon, baseSpd: 1, traceSpd: 0, lcBaseSpd: 0, rotation: "basic", equipment: { hasSigLc: false } });
const ASCENDED = { useTech: false, trace3Advance: false, e1Wishpower: 8 };

test("献予「创世」之诗：开拓者•记忆施放强化普攻后，德谬歌获得额外回合施放【花与箭的舞曲】", () => {
  // 昔涟满【追忆】开局开大，诗献给开拓者•记忆；开拓者满能开大后下一动打强化普攻。
  const timeline = (targetSlot: number) => createBattle({
    team: [{ id: "1415", initialEnergy: 24, targetSlot, traceSpd: 0 }, { id: "8007", initialEnergy: 160, traceSpd: 0 }, { id: "1218", traceSpd: 0 }],
    maxAV: 120,
    useTechnique: false,
  }, game).run().timeline;
  const rows = timeline(1);
  const enhanced = rows.find((row) => row.slot === 1 && row.type === "enhanced_basic")!;
  const genesis = rows.filter((row) => row.label === "【献予「创世」之诗】：额外回合");
  assert.equal(genesis.length, 1);
  assert.equal(genesis[0].av, enhanced.av);
  // 诗给了椒丘，开拓者•记忆的强化普攻就不触发。
  assert.equal(timeline(2).filter((row) => row.label === "【献予「创世」之诗】：额外回合").length, 0);
});

test("三赌牌局：没填就按升格等级，2 级全队速度 +25%", () => {
  // 旧接口总会补上 15，「留空按等级」走新入口。砂金(存护)基础 106、行迹 0，结束时【欢愉万相】仍生效。
  const speedOf = (eidolon: number, sanduTeamSpdPct?: number) => {
    const engine = createBattle({
      team: [{ id: "1511", eidolon, targetSlot: 2 }, { id: "1513" }, { id: "1304", rotation: "basic", traceSpd: 0 }],
      maxAV: 120,
      useTechnique: false,
      elation: { e1Wishpower: 8, ...(sanduTeamSpdPct === undefined ? {} : { sanduTeamSpdPct }) },
    }, game);
    engine.run();
    return engine.units.find((item) => item.id === "1304")!.speed();
  };
  near(speedOf(1), 106 * 1.15, "1 级");
  near(speedOf(2), 106 * 1.25, "2 级");
  near(speedOf(2, 15), 106 * 1.15, "设置里填了数就听设置");
});

test("心灵感应 2 级：爻光开大固定回能 30，【大吉大利】倍率提高原倍率的 40%", () => {
  const res = sim({
    maxAV: 90, ...ASCENDED, ahaAdvancePct: 100,
    team: [slowAha(2), { id: "1502", baseSpd: 200, traceSpd: 0, err: 500, initAdv: 100, rotation: "skill" }],
  });
  const ults = res.timeline.filter((ev) => ev.label.includes("爻光终结技"));
  assert.ok(ults.some((ev) => ev.details.some((d) => d.includes("+30 固定能量 +10 笑点"))));
  assert.ok(res.notes.some((note) => note.includes("【欢愉万相★心灵感应】2级")));
  near(unit(res, "1502").mechanics.dajiElationDamage as number, 0.2 * 1.4);
});

test("全息幻象 2 级：好活当赏的 40% 进隐藏分", () => {
  // 真珠 0 AV 开大，全队好活当赏 20；1 级给银狼 4，2 级给 8。
  const team = (eidolon: number) => [slowAha(eidolon), { id: "1503", initAdv: 100, err: 0, baseSpd: 200, traceSpd: 0, targetSlot: 0 }, { id: "1506", baseSpd: 1, traceSpd: 0 }];
  // 另有开战 3 名欢愉角色的人头笑点同步 +3（开战时还没升格）。
  near(unit(sim({ maxAV: 5, ...ASCENDED, team: team(1) }), "1506").finalEnergy, 3 + 4);
  near(unit(sim({ maxAV: 5, ...ASCENDED, team: team(2) }), "1506").finalEnergy, 3 + 8);
});

test("跃然纸上 2 级：额外回合结束保留该次好活当赏的 20%", () => {
  // 4 欢愉，真珠终结技额外回合给火花好活当赏 30；1 级留 3，2 级留 6。
  const team = (eidolon: number) => [
    slowAha(eidolon),
    { id: "1503", initAdv: 100, err: 500, targetSlot: 2 },
    { id: "1501", baseSpd: 1, traceSpd: 0 },
    { id: "1502", baseSpd: 1, traceSpd: 0 },
  ];
  const kept = (eidolon: number) => (unit(sim({ maxAV: 20, ...ASCENDED, team: team(eidolon) }), "1501").mechanics.haohuo as { label: string; count: number }[])
    .filter((item) => item.label === "真珠终结技·【美学底本】额外回合").map((item) => item.count);
  assert.deepEqual(kept(1), [3]);
  assert.deepEqual(kept(2), [6]);
});
