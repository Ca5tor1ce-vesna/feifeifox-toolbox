/**
 * 战技点系统：全队共享，上限 5、开局 3；普攻（含强化普攻）+1、战技 -1、终结技 0。
 * 不足时不能放战技：那一动改成普攻并留一条说明。默认不结算，只有 useSkillPoints 打开时才跑。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { createBattle, type BattleInput, type GameData } from "../../axis-engine/src/battle.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const dataDir = join(HERE, "..", "..", "modules", "honkai-star-rail", "data");
const json = (name: string) => JSON.parse(readFileSync(join(dataDir, name), "utf-8"));
const data: GameData = { axis: json("axis_data.json"), characters: json("characters.json") };

const run = (input: BattleInput) => createBattle(input, data).run();
const spOf = (row: { res: Record<string, unknown> }) => row.res.sp;
const spValues = (res: ReturnType<typeof run>) =>
  res.timeline.map(spOf).filter((value): value is number => typeof value === "number");
const casts = (res: ReturnType<typeof run>) =>
  res.timeline.filter((row) => row.slot === 0 && (row.type === "basic" || row.type === "skill"));

test("战技点默认不结算：不开时时间轴上没有 sp 字段", () => {
  const res = run({ team: [{ id: "1218", rotation: "skill" }], maxAV: 120, useTechnique: false });
  assert.equal(spValues(res).length, 0);
});

test("战技点：开局 3，普攻 +1，上限 5", () => {
  const res = run({ team: [{ id: "1218", rotation: "basic" }], maxAV: 400, useTechnique: false, useSkillPoints: true });
  const values = spValues(res);
  assert.equal(values[0], 3, "进入战斗就是开局 3 点");
  assert.equal(Math.max(...values), 5, "封顶 5 点");
});

test("战技点不足时这一动的战技改成普攻", () => {
  // 开局 3 点：三动战技各 -1 → 0，第四动不能再放战技。
  const res = run({ team: [{ id: "1218", rotation: "skill" }], maxAV: 500, useTechnique: false, useSkillPoints: true });
  assert.deepEqual(casts(res).slice(0, 4).map((row) => row.type), ["skill", "skill", "skill", "basic"]);
  const blocked = res.timeline.filter((row) => row.label === "战技点不足");
  assert.equal(blocked.length, 1, "只拦了第一次不足");
  assert.ok(blocked[0].details.join(" ").includes("战技点 0/5"));
});

test("终结技不消耗战技点", () => {
  const res = run({
    team: [{ id: "1218", initialEnergy: 200, rotation: "basic" }],
    maxAV: 120,
    useTechnique: false,
    useSkillPoints: true,
  });
  const index = res.timeline.findIndex((row) => row.type === "ultimate");
  assert.ok(index > 0, "开出了终结技");
  assert.equal(spOf(res.timeline[index]), spOf(res.timeline[index - 1]), "终结技前后战技点不变");
});

test("强化普攻不回复战技点：刃一战一强化普攻，净 -1", () => {
  // 刃：战技 -1，强化普攻 +0（2026-11-06 用户确认：强化普攻一律不回复）。
  const res = run({ team: [{ id: "1205", rotation: "skill" }], maxAV: 200, useTechnique: false, useSkillPoints: true });
  assert.equal(spValues(res).find((value) => value !== 3), 2);
});

test("丹恒•饮月：一次「龙力自在」强化 3 层，扣 3 点", () => {
  const res = run({ team: [{ id: "1213", rotation: "skill" }], maxAV: 200, useTechnique: false, useSkillPoints: true });
  assert.equal(spValues(res).find((value) => value !== 3), 0, "开局 3 点一次用光");
});

test("青雀：额外能力【争番】每场只回 1 次", () => {
  // 一战一普攻本来净 0，加上【争番】+1：这一动结束时是 4；第二动起不再加。
  const res = run({ team: [{ id: "1201", rotation: "skill" }], maxAV: 300, useTechnique: false, useSkillPoints: true });
  const zhengfan = res.timeline.filter((row) => row.label === "战技点" && row.details.join(" ").includes("争番"));
  assert.equal(zhengfan.length, 1, "每场只触发一次");
  assert.equal(zhengfan[0].res.sp, 4, "【争番】结算后是 4 点");
});

test("依赖战技点但还没接的机制写进「未计入」，且集中在一处", () => {
  // 花火、Archer（追击/星魂回点）、远坂凛（宝石能量）、银狼LV.999、寒鸦、米沙、火花（互动陷阱/不视为战技）、一条伤害类遗器。
  const unsupportedOf = (team: Parameters<typeof run>[0]["team"]) =>
    run({ team, maxAV: 1, useTechnique: false, useSkillPoints: true }).unsupported.map((item) => item.mechanic).join("；");
  const text = [
    unsupportedOf([{ id: "1306" }, { id: "1015" }, { id: "1508" }, { id: "1506" }]),
    unsupportedOf([{ id: "1215", relics: [{ id: "324", pieces: 2 }] }, { id: "1312" }, { id: "1501" }]),
  ].join("；");
  for (const key of ["溢出记录", "回路连接", "连携追加攻击", "爆爆爆蛋", "承载", "消耗战技点回能", "互动陷阱", "不视为使用战技", "天国@直播间"]) {
    assert.ok(text.includes(key), `「未计入」里应该有 ${key}：${text}`);
  }
});

test("Archer 在场时战技点上限 +2（=7）", () => {
  // 两人都只放普攻，战技点一路涨到上限。
  const res = run({
    team: [{ id: "1015", rotation: "basic" }, { id: "1218", rotation: "basic" }],
    maxAV: 600,
    useTechnique: false,
    useSkillPoints: true,
  });
  assert.equal(Math.max(...spValues(res)), 7, "上限应是 7");
  const notes = res.timeline.filter((row) => row.label === "战技点").map((row) => row.details.join(" "));
  assert.ok(notes.some((line) => line.includes("上限 7")), "提示里写明上限 7");
});

test("【云无留迹的过客】4 件：开局 4 个战技点", () => {
  const res = run({ team: [{ id: "1218", rotation: "basic", relics: [{ id: "101", pieces: 4 }] }], maxAV: 1, useTechnique: false, useSkillPoints: true });
  assert.equal(spValues(res)[0], 4);
});

test("Archer「伪•螺旋剑」一次 −2：开局 3 点只够开一次", () => {
  const res = run({ team: [{ id: "1015", rotation: "skill" }], maxAV: 500, useTechnique: false, useSkillPoints: true });
  const actions = res.timeline.filter((row) => row.slot === 0 && (row.type === "skill" || row.type === "basic"));
  assert.deepEqual(actions.slice(0, 3).map((row) => row.type), ["skill", "basic", "skill"], "第二动 1 点不够 2 点，降级普攻补 1 点");
});

test("远坂凛在场时战技点上限 +2（=7）", () => {
  const res = run({ team: [{ id: "1508", rotation: "basic" }, { id: "1218", rotation: "basic" }], maxAV: 600, useTechnique: false, useSkillPoints: true });
  assert.equal(Math.max(...spValues(res)), 7);
});

test("Archer：天赋追击恢复 1 个战技点", () => {
  // 队友攻击后 Archer 消耗充能追击，追击回 1 点。
  const res = run({ team: [{ id: "1015", rotation: "basic" }, { id: "1218", rotation: "basic" }], maxAV: 300, useTechnique: false, useSkillPoints: true });
  const fua = res.timeline.filter((row) => row.type === "fua");
  assert.ok(fua.length > 0, "触发了追击");
  assert.ok(
    res.timeline.some((row) => row.label === "战技点" && row.details.join(" ").includes("心眼（真）")),
    "追击那一笔记了战技点",
  );
});

test("火花：秘技为我方恢复 2 个战技点", () => {
  const withTech = run({ team: [{ id: "1501" }], maxAV: 1, useTechnique: true, useSkillPoints: true });
  const without = run({ team: [{ id: "1501" }], maxAV: 1, useTechnique: false, useSkillPoints: true });
  assert.equal(Math.max(...spValues(withTech)), 5, "开局 3 + 秘技 2");
  assert.equal(spValues(without)[0], 3);
});

test("火花：【爆点】先抵扣战技点消耗，并视为消耗战技点", () => {
  // 火花 + 星神★阿哈：阿哈时刻她施放欢愉技 +2 爆点，之后的战技先扣爆点。
  const res = run({ team: [{ id: "1501", rotation: "skill" }, { id: "1511" }], maxAV: 300, useTechnique: false, useSkillPoints: true });
  assert.ok(res.timeline.some((row) => row.label === "【爆点】"), "有获得爆点的记录");
  const use = res.timeline.find((row) => row.label === "【爆点】抵扣");
  assert.ok(use, "战技时用爆点抵扣");
  assert.ok(use.details.join(" ").includes("视为消耗战技点"));
});

test("远坂凛：队友恢复战技点时获得【宝石能量】", () => {
  const res = run({ team: [{ id: "1508", rotation: "basic" }, { id: "1218", rotation: "basic" }], maxAV: 300, useTechnique: false, useSkillPoints: true });
  assert.ok(
    res.timeline.some((row) => row.label === "【宝石能量】" && row.details.join(" ").includes("恢复 1 点战技点")),
    "普攻回点要给她宝石能量",
  );
});

test("远坂凛：终结技把战技点消耗至 2，每点 +2 宝石能量", () => {
  const res = run({ team: [{ id: "1508", initialEnergy: 200 }], maxAV: 1, useTechnique: false, useSkillPoints: true });
  assert.ok(res.timeline.some((row) => row.label === "战技点" && row.details.join(" ").includes("消耗战技点至 2")), "终结技把战技点消耗到 2");
  assert.ok(res.timeline.some((row) => row.label === "【宝石能量】" && row.details.join(" ").includes("× 2")), "每消耗 1 点 +2");
});

test("不开战技点系统时不登记这些「未计入」", () => {
  const res = run({ team: [{ id: "1501" }, { id: "1306" }], maxAV: 1, useTechnique: false });
  const text = res.unsupported.map((item) => item.mechanic).join("；");
  assert.ok(!text.includes("互动陷阱"));
  assert.ok(!text.includes("回复 6 点"));
});
