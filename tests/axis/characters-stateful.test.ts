/**
 * 第二批：有状态的角色。数字来自 4.6 版本文案并手算。
 * 速度都把行迹清零，能量从 0 开始，这样每一步都能算清楚。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { createBattle, ENHANCEABLE, type BattleInput, type GameData } from "../../axis-engine/src/battle.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const dataDir = join(HERE, "..", "..", "modules", "honkai-star-rail", "data");
const json = (name: string) => JSON.parse(readFileSync(join(dataDir, name), "utf-8"));
const data: GameData = { axis: json("axis_data.json"), characters: json("characters.json") };

const battle = (input: BattleInput) => createBattle({ useTechnique: false, ...input }, data);
const near = (actual: number, expected: number, message = "") =>
  assert.ok(Math.abs(actual - expected) < 1e-7, `${message} 期望 ${expected}，实际 ${actual}`);
const zero = (id: string, extra: Record<string, unknown> = {}) => ({ id, traceSpd: 0, initialEnergy: 0, ...extra });
const rows = (engine: ReturnType<typeof battle>, slot = 0, types = ["basic", "skill", "enhanced_basic"]) =>
  engine.timeline.filter((row) => row.slot === slot && types.includes(row.type));
const kit = <T>(engine: ReturnType<typeof battle>, id: string) => engine.findUnit(id)!.kit as unknown as T;

test("青雀：战技不结束回合，接着打普攻；战技不回能", () => {
  const engine = battle({ team: [zero("1201")], maxAV: 10000 / 98 + 1 });
  engine.run();
  assert.deepEqual(rows(engine).map((row) => row.type), ["skill", "basic"]);
  assert.equal(rows(engine)[0].av, rows(engine)[1].av);
  near(engine.units[0].energy, 20);
});

test("刃：地狱变 3 回合，第 4 回合才需要再放战技；充能满 5 层追击回能 10", () => {
  // 第 1 回合战技 + 强化普攻（共 2 层）；第 2、3 回合强化普攻（4 层）；第 4 回合战技第 5 层追击。
  const engine = battle({ team: [zero("1205")], maxAV: 4 * (10000 / 97) + 1 });
  engine.run();
  const types = rows(engine).map((row) => row.type);
  assert.deepEqual(types, ["skill", "enhanced_basic", "enhanced_basic", "enhanced_basic", "skill", "enhanced_basic"]);
  assert.equal(engine.units[0].followUps, 1);
  // 能量：30 × 3，第 4 回合追击 +10，再 +30 = 130 满能当场开大，开大返还 5。
  near(engine.units[0].energy, 5);
  assert.equal(engine.units[0].ultimates, 1);
  // 第 5 层来自第 4 回合的战技，所以追击排在这回合的强化普攻之前。
  const order = engine.timeline.filter((row) => ["skill", "enhanced_basic", "fua"].includes(row.type)).map((row) => row.type);
  assert.deepEqual(order.slice(-3), ["skill", "fua", "enhanced_basic"]);
});

test("刃 E6：充能上限 4 层", () => {
  // 第 1 回合 2 层，第 2 回合 3 层，第 3 回合第 4 层时追击，排在第 3 回合强化普攻之后。
  const engine = battle({ team: [zero("1205", { eidolon: 6 })], maxAV: 3 * (10000 / 97) + 1 });
  engine.run();
  assert.equal(engine.units[0].followUps, 1);
  assert.equal(engine.timeline.filter((row) => ["enhanced_basic", "fua", "skill"].includes(row.type)).at(-1)!.type, "fua");
});

test("丹恒•饮月：默认三强普攻回能 40，只打普攻回能 20", () => {
  // 都要加上行迹【伏辰】开局的 15。
  const strong = battle({ team: [zero("1213")], maxAV: 10000 / 102 + 1 });
  strong.run();
  near(strong.units[0].energy, 15 + 40);
  const plain = battle({ team: [zero("1213", { rotation: "basic" })], maxAV: 10000 / 102 + 1 });
  plain.run();
  near(plain.units[0].energy, 15 + 20);
});

test("丹恒•饮月：战斗开始 +15，E2 开大后行动提前 100%", () => {
  const start = battle({ team: [{ id: "1213", traceSpd: 0 }], maxAV: 1 });
  start.run();
  near(start.units[0].energy, 70 + 15);
  const e2 = battle({ team: [zero("1213", { eidolon: 2, initialEnergy: 140 })], maxAV: 10 });
  e2.run();
  near(rows(e2)[0].av, 0);
});

test("波提欧：绝命对峙 2 回合，每回合开始减 1", () => {
  // 第 1 回合战技 + 强化；第 2 回合开始剩 1，强化；第 3 回合开始剩 0，重新战技。
  const engine = battle({ team: [zero("1315")], maxAV: 3 * (10000 / 107) + 1 });
  engine.run();
  assert.deepEqual(rows(engine).map((row) => row.type), ["skill", "enhanced_basic", "enhanced_basic", "skill", "enhanced_basic"]);
  near(engine.units[0].energy, 90);
});

test("藿藿：E1 持有【禳命】时我方全体速度 +12%", () => {
  const e1 = battle({ team: [zero("1217", { eidolon: 1, baseSpd: 1 }), zero("1218")], maxAV: 1 });
  e1.run();
  near(e1.units[1].speed(), 98 * 1.12);
  const e0 = battle({ team: [zero("1217", { baseSpd: 1 }), zero("1218")], maxAV: 1 });
  e0.run();
  near(e0.units[1].speed(), 98);
});

test("藿藿：队友回合开始触发治疗，恢复 1 能量", () => {
  // 原版：开局【禳命】1 回合。藿藿很慢，队友在 10000/98 行动，触发一次。
  const engine = battle({ team: [zero("1217", { baseSpd: 1, enhanced: false }), zero("1218")], maxAV: 10000 / 98 + 1 });
  engine.run();
  near(engine.units[0].energy, 1);
});

test("藿藿终结技：为队友恢复各自能量上限的 20%（E3 21%）", () => {
  // 终结技按练得到的等级：Lv10 20%，E3 Lv12 21%。目标用桑博，上限 120，开局没有回能效果：120 × 20% = 24。
  const engine = battle({ team: [zero("1217", { initialEnergy: 140 }), zero("1108")], maxAV: 1 });
  engine.run();
  near(engine.units[1].energy, 24);
  const e3 = battle({ team: [zero("1217", { initialEnergy: 140, eidolon: 3 }), zero("1108")], maxAV: 1 });
  e3.run();
  near(e3.units[1].energy, 120 * 0.21);
});

test("灵砂：浮元 90 速行动 3 次后消失，普攻额外回能 10", () => {
  // 第一动战技在 10000/98 召唤，之后每 10000/90 行动一次。ERR 压低，窗口内不开大（开大会拉满浮元）。
  const engine = battle({ team: [zero("1222", { script: ["skill"], rotation: "basic", err: -50 })], maxAV: 700 });
  engine.run();
  const fua = engine.timeline.filter((row) => row.type === "fua");
  assert.equal(fua.length, 3);
  const start = 10000 / 98;
  fua.forEach((row, index) => near(row.av, start + (index + 1) * (10000 / 90)));
  assert.equal(engine.summons.length, 0);
});

test("灵砂：战技使在场的浮元行动提前 20%", () => {
  // 第一次战技 t1 召唤。第二次战技时刻 2t1，浮元已跑 t1 × 90 = 9184，只差 816，拉 20% 后封底，当场行动。
  const t1 = 10000 / 98;
  const near2 = battle({ team: [zero("1222")], maxAV: 400 });
  near2.run();
  near(near2.timeline.filter((row) => row.type === "fua")[0].av, 2 * t1);
  // 灵砂放慢到速度 50 时：t = 200，第二次战技在 400，浮元在 311 就先动了，拉条影响的是下一次。
  // 没拉条时第 2 次在 200 + 2 × 111.11 = 422.22；400 时已跑 (400 - 311.11) × 90 = 8000，再扣 2000，剩 0，当场行动。
  const slow = battle({ team: [zero("1222", { baseSpd: 50 })], maxAV: 500 });
  slow.run();
  near(slow.timeline.filter((row) => row.type === "fua")[1].av, 400);
});

test("三月七•巡猎：战斗开始提前 25%；【师父】速度 +10%（E3 10.8%）", () => {
  // 战技按练得到的等级：Lv10 10%，E3 Lv12 10.8%。
  const engine = battle({ team: [zero("1224", { targetSlot: 1 }), zero("1218")], maxAV: 7500 / 102 + 0.1 });
  engine.run();
  near(rows(engine)[0].av, 7500 / 102);
  near(engine.units[1].speed(), 98 * 1.1);
  const e3 = battle({ team: [zero("1224", { targetSlot: 1, eidolon: 3 }), zero("1218")], maxAV: 7500 / 102 + 0.1 });
  e3.run();
  near(e3.units[1].speed(), 98 * 1.108);
});

test("三月七•巡猎：充能满 7 立即行动并打强化普攻，回能 30，消耗 7 点", () => {
  const engine = battle({ team: [zero("1224", { targetSlot: 1 }), zero("1218", { baseSpd: 1 })], maxAV: 7500 / 102 + 0.1 });
  engine.run(); // 第一动战技，【师父】就位
  const state = kit<{ charge: number; master: unknown }>(engine, "1224");
  state.charge = 6;
  const before = engine.units[0].energy;
  engine.attack(engine.units[1], "skill");
  assert.equal(state.charge, 7);
  near(engine.units[0].remDist, 0);
  engine.takeTurn(engine.units[0]);
  assert.equal(engine.timeline.at(-1)!.type === "enhanced_basic" || engine.timeline.some((row) => row.type === "enhanced_basic"), true);
  assert.equal(state.charge, 0);
  near(engine.units[0].energy, before + 30);
});

test("符玄：阵开着打普攻，快到期才补战技；阵开启时战技额外 +20", () => {
  // 第 1 回合战技开阵（3 回合，当回合不减）；第 2、3 回合普攻；第 4 回合剩 1，补战技。
  const engine = battle({ team: [zero("1208")], maxAV: 4 * (10000 / 100) + 1 });
  engine.run();
  assert.deepEqual(rows(engine).map((row) => row.type), ["skill", "basic", "basic", "skill"]);
  near(engine.units[0].energy, 30 + 20 + 20 + 30 + 20);
});

test("彦卿 E2：【智剑连心】期间能量恢复效率 +10%", () => {
  // 第 1 回合战技 30，之后持有【智剑连心】，第 2 回合战技 30 × 1.1。
  const e2 = battle({ team: [zero("1209", { eidolon: 2 })], maxAV: 2 * (10000 / 109) + 1 });
  e2.run();
  near(e2.units[0].energy, 30 + 33);
  const e0 = battle({ team: [zero("1209")], maxAV: 2 * (10000 / 109) + 1 });
  e0.run();
  near(e0.units[0].energy, 60);
});

test("镜流：两层【朔望】进入转魄，行动提前 100%，强化战技回能 30", () => {
  const engine = battle({ team: [zero("1212", { enhanced: false })], maxAV: 2 * (10000 / 96) });
  engine.run();
  const list = rows(engine);
  assert.deepEqual(list.slice(0, 3).map((row) => row.type), ["skill", "skill", "skill"]);
  // 第 1 动后下次行动提前 10%：第 2 动在 10000/96 + 9000/96。第 2 动进入转魄，立即接第 3 动。
  near(list[1].av, 19000 / 96);
  near(list[2].av, list[1].av);
  assert.ok(list[2].label.includes("寒川映月"));
  near(engine.units[0].energy, 20 + 20 + 30);
});

test("银枝：回能取决于敌人数量，战斗开始每个敌人 +2", () => {
  const engine = battle({ team: [zero("1302")], maxAV: 10000 / 103 + 1, enemyCount: 3 });
  engine.run();
  // 开局 2×3，战技基础 30，击中 3 个各 +3。
  near(engine.units[0].energy, 6 + 30 + 9);
  const single = battle({ team: [zero("1302", { rotation: "basic" })], maxAV: 10000 / 103 + 1, enemyCount: 3 });
  single.run();
  // 普攻只打 1 个目标。
  near(single.units[0].energy, 6 + 20 + 3);
});

test("飞霄：每 2 次攻击 +1 飞黄，队友攻击时每回合追击一次", () => {
  const engine = battle({ team: [{ id: "1220", traceSpd: 0, baseSpd: 1 }, zero("1218", { baseSpd: 1 })], maxAV: 1 });
  engine.run();
  const fei = engine.units[0];
  near(fei.energy, 3); // 行迹：战斗开始 3 点
  engine.attack(engine.units[1], "skill"); // 队友攻击 1 次，追击也算 1 次，共 2 次 → +1
  near(fei.energy, 4);
  assert.equal(fei.followUps, 1);
  engine.attack(engine.units[1], "skill"); // 同一回合不再追击，只累计 1 次
  near(fei.energy, 4);
  assert.equal(fei.followUps, 1);
});

test("飞霄 E2：我方任意追加攻击 +1 飞黄，每回合最多 6 次", () => {
  // 4.6.54 版本资料：「我方目标每施放1次追加攻击」+1，「每回合最多触发6次」。
  // 椒丘追加攻击 1 次：它自己 1 次 + 触发飞霄天赋追击 1 次 = 2 次 E2；同一回合再追 5 次，只剩 4 次额度，合计 6。
  const e2Notes = (engine: ReturnType<typeof battle>) => engine.timeline.filter((row) => row.label.startsWith("E2：")).length;
  const engine = battle({ team: [{ id: "1220", traceSpd: 0, baseSpd: 1, eidolon: 2 }, zero("1218", { baseSpd: 1 })], maxAV: 1 });
  engine.run();
  engine.attack(engine.units[1], "fua");
  assert.equal(e2Notes(engine), 2);
  for (let i = 0; i < 5; i += 1) engine.attack(engine.units[1], "fua");
  assert.equal(e2Notes(engine), 6);
  // 用户确认（2026-11-06）：次数在飞霄自己的回合开始时重置；队友的回合开始不重置
  engine.takeTurn(engine.units[1]);
  const afterAlly = e2Notes(engine);
  engine.attack(engine.units[1], "fua");
  assert.equal(e2Notes(engine), afterAlly, "队友回合开始不重置，额度还是用完的");
  engine.takeTurn(engine.units[0]);
  const afterOwn = e2Notes(engine);
  engine.attack(engine.units[1], "fua");
  assert.ok(e2Notes(engine) > afterOwn, "飞霄自己的回合开始后又能触发");
  const e0 = battle({ team: [{ id: "1220", traceSpd: 0, baseSpd: 1 }, zero("1218", { baseSpd: 1 })], maxAV: 1 });
  e0.run();
  e0.attack(e0.units[1], "fua");
  assert.equal(e2Notes(e0), 0);
});

test("飞霄：飞黄满 12 时还能再存 1 点，开大扣 6 后补上（剩 7）", () => {
  // 攻略视频实测：技能说明写最多 12 点，实际最多 13 点；飞黄和攻击次数都满时开大，结束后剩 7 点。
  const engine = battle({ team: [{ id: "1220", traceSpd: 0, baseSpd: 1 }, zero("1218", { baseSpd: 1 })], maxAV: 1 });
  engine.run();
  const fei = engine.units[0];
  fei.castingUltimate = true; // 先不让她开大，攒满再说
  fei.energy = 12;
  engine.attack(engine.units[1], "skill"); // 队友 1 次 + 飞霄追击 1 次 = 凑满 1 点，但已经 12 点：先存着
  near(fei.energy, 12);
  fei.castingUltimate = false;
  engine.castUltimate(fei);
  near(fei.energy, 7); // 12 − 6 + 存着的 1
});

test("飞霄：飞黄满 6 点可开大", () => {
  const engine = battle({ team: [{ id: "1220", traceSpd: 0, initialEnergy: 6, baseSpd: 1 }], maxAV: 1 });
  engine.run();
  assert.equal(engine.units[0].ultimates, 1);
  near(engine.units[0].energy, 3); // 开局有 3，先满足 6+3=9，开大扣 6
});

test("黄泉：残梦 9 点开大，战斗开始 5 点，战技 +1，E2 回合开始 +1", () => {
  const e0 = battle({ team: [{ id: "1308", traceSpd: 0 }], maxAV: 10000 / 101 + 1 });
  e0.run();
  near(e0.units[0].energy, 6);
  const e2 = battle({ team: [{ id: "1308", traceSpd: 0, eidolon: 2 }], maxAV: 10000 / 101 + 1 });
  e2.run();
  near(e2.units[0].energy, 7);
});

test("黄泉带专武：战技 +2 残梦（战技 1 + 【泡影】触发天赋 1），没带专武 +1", () => {
  // 专武「击中敌方目标时使其陷入【泡影】」是负面效果，触发天赋 +1；战技自带的【集真赤】不是负面效果（攻略实测）。
  // 101 速第一动在 10000/101：开局【赤鬼】5 点，战技后 7（带专武）/ 6（不带）。
  const at = (lightcone?: { id: string }) => {
    const engine = battle({ team: [{ id: "1308", traceSpd: 0, ...(lightcone ? { lightcone } : {}) }], maxAV: 10000 / 101 + 1 });
    engine.run();
    return engine.units[0].energy;
  };
  near(at({ id: "23024" }), 7);
  near(at(), 6);
});

test("黄泉：常配队友施放技能使敌人陷入负面效果时 +1【残梦】，每次施放最多 1 次", () => {
  // 4.6.54 版本资料天赋：「任意单位施放技能期间使敌方目标陷入负面效果，黄泉获得1点【残梦】……该效果每次施放技能最多触发1次」。
  // 负面效果按基础概率必中算。黄泉 1 速不行动，开局【赤鬼】5 点。
  const dream = (team: Record<string, unknown>[], maxAV: number) => {
    const engine = battle({ team: [zero("1308", { baseSpd: 1 }), ...team.map((member) => ({ traceSpd: 0, initialEnergy: 0, ...member }))] as BattleInput["team"], maxAV });
    engine.run();
    return engine.units[0].energy;
  };
  // 佩拉：终结技【通解】算；战技只解除增益不算，E4 战技降冰抗算。
  near(dream([{ id: "1106", initialEnergy: 110 }], 1), 6, "佩拉终结技");
  near(dream([{ id: "1106", rotation: "skill" }], 10000 / 105 + 1), 5, "佩拉战技（E0）");
  near(dream([{ id: "1106", rotation: "skill", eidolon: 4 }], 10000 / 105 + 1), 6, "佩拉战技（E4）");
  // 银狼：每次攻击植入【缺陷】；带「决心如汗珠般闪耀」同一次施放也只算 1 次。
  near(dream([{ id: "1006", rotation: "basic" }], 10000 / 107 + 1), 6, "银狼普攻");
  near(dream([{ id: "1006", rotation: "basic", lightcone: { id: "21015" } }], 10000 / 107 + 1), 6, "银狼普攻 + 决心光锥");
  // 加拉赫：终结技【酩酊】+1；终结技后的第一次普攻是【酒花奔涌】降攻击 +1；之后的普通普攻不算。
  near(dream([{ id: "1301", initialEnergy: 110, rotation: "basic" }], 10000 / 98 + 1), 7, "加拉赫");
  // 托帕：战技【负债证明】。
  near(dream([{ id: "1112", rotation: "skill" }], 10000 / 110 + 1), 6, "托帕战技");
  // 卡芙卡不行动：希儿普攻触发卡芙卡追击（触电）+1；希儿普攻本身不算。
  near(dream([{ id: "1005", baseSpd: 1 }, { id: "1102", rotation: "basic" }], 10000 / 115 + 1), 6, "卡芙卡追击");
  // 黑天鹅 E6：队友攻击时给目标【奥迹】；E0 不算。
  near(dream([{ id: "1307", baseSpd: 1, eidolon: 6 }, { id: "1102", rotation: "basic" }], 10000 / 115 + 1), 6, "黑天鹅 E6");
  near(dream([{ id: "1307", baseSpd: 1 }, { id: "1102", rotation: "basic" }], 10000 / 115 + 1), 5, "黑天鹅 E0");
  // 「决心如汗珠般闪耀」：装备者击中敌人使其陷入【攻陷】。虚无光锥，命途不对不生效。瓦尔特普攻本身不上负面。
  near(dream([{ id: "1004", rotation: "basic", lightcone: { id: "21015" } }], 10000 / 102 + 1), 6, "瓦尔特带决心光锥");
  near(dream([{ id: "1004", rotation: "basic" }], 10000 / 102 + 1), 5, "瓦尔特不带");
  near(dream([{ id: "1102", rotation: "basic", lightcone: { id: "21015" } }], 10000 / 115 + 1), 5, "希儿（巡猎）带了不生效");
});

test("黄泉：残梦溢出变【四相断我】（最多 3 层），开大后每层回 1 点残梦", () => {
  // 4.6.54 版本资料，行迹【赤鬼】和秘技【四相断我】。开局 8 点，战斗开始 +5 → 满 9，溢出 4 点只收 3 层。
  // 开局结束开大：9 → 0，再按 3 层回 3 点。开秘技时先有 1 层，溢出只再收 2 层，结果一样。
  for (const useTechnique of [false, true]) {
    const engine = battle({ team: [{ id: "1308", traceSpd: 0, initialEnergy: 8 }], maxAV: 1, useTechnique });
    engine.run();
    const unit = engine.units[0];
    assert.equal(unit.ultimates, 1, `秘技 ${useTechnique}`);
    near(unit.energy, 3, `秘技 ${useTechnique}`);
    const spill = engine.timeline.find((row) => row.label.includes("【残梦】溢出"))!;
    assert.ok(spill.details[0].startsWith(useTechnique ? "【四相断我】+2" : "【四相断我】+3"), spill.details[0]);
  }
});

test("云璃：终结技只消耗 120 能量", () => {
  const engine = battle({ team: [{ id: "1221", traceSpd: 0, initialEnergy: 120 }], maxAV: 1 });
  engine.run();
  assert.equal(engine.units[0].ultimates, 1);
  near(engine.units[0].energy, 5);
});

test("大丽花：进入战斗 +35，队友攻击时每回合追击一次回能 10", () => {
  const engine = battle({ team: [zero("1321", { baseSpd: 1 }), zero("1218", { baseSpd: 1 })], maxAV: 1 });
  engine.run();
  near(engine.units[0].energy, 35);
  engine.attack(engine.units[1], "skill");
  near(engine.units[0].energy, 45);
  assert.equal(engine.units[0].followUps, 1);
  engine.attack(engine.units[1], "skill");
  near(engine.units[0].energy, 45);
});

test("不死途：队友攻击固定 +8，消耗充能追击再回 5，充能耗尽不再追击", () => {
  const engine = battle({ team: [zero("1504", { baseSpd: 1 }), zero("1218", { baseSpd: 1 })], maxAV: 1 });
  engine.run();
  const unit = engine.units[0];
  engine.attack(engine.units[1], "skill");
  near(unit.energy, 13);
  engine.attack(engine.units[1], "skill");
  near(unit.energy, 26);
  assert.equal(unit.followUps, 2);
  engine.attack(engine.units[1], "skill"); // 初始 2 点充能用完
  near(unit.energy, 34);
  assert.equal(unit.followUps, 2);
});

test("Archer：进入战斗 1 点充能，队友攻击消耗充能追击回能 5", () => {
  const engine = battle({ team: [zero("1015", { baseSpd: 1 }), zero("1218", { baseSpd: 1 })], maxAV: 1 });
  engine.run();
  engine.attack(engine.units[1], "skill");
  near(engine.units[0].energy, 5);
  engine.attack(engine.units[1], "skill");
  near(engine.units[0].energy, 5);
  assert.equal(engine.units[0].followUps, 1);
});

test("开拓者•存护：E4 开局 4 层，第一次普攻强化回能 30，消耗 4 层", () => {
  const engine = battle({ team: [zero("8003", { eidolon: 4, rotation: "basic" })], maxAV: 2 * (10000 / 95) + 1 });
  engine.run();
  const list = rows(engine);
  assert.deepEqual(list.map((row) => row.type), ["enhanced_basic", "basic"]);
  // 第 2 回合开始持有护盾 +5：30 + 5 + 20。
  near(engine.units[0].energy, 55);
});

test("开拓者•同谐 E2：战斗开始能量恢复效率 +25%，持续 3 回合", () => {
  const engine = battle({ team: [zero("8005", { eidolon: 2 })], maxAV: 10000 / 105 + 1 });
  engine.run();
  near(engine.units[0].energy, 30 * 1.25);
});

test("乱破：开大进入结印，额外回合打强化普攻回能 20，彩墨耗尽退出", () => {
  // 额外回合用掉 1 点。E4 速度 96 × 1.12 = 107.52，之后两动在 93.01 和 186.01，用完 3 点退出。
  const speed = 96 * 1.12;
  const during = battle({ team: [zero("1317", { eidolon: 4, initialEnergy: 140 }), zero("1218", { baseSpd: 1 })], maxAV: 10000 / speed + 1 });
  during.run();
  const list = rows(during);
  assert.equal(list[0].type, "enhanced_basic");
  assert.equal(list[0].extra, true);
  assert.equal(list[0].av, 0);
  near(list[1].av, 10000 / speed);
  near(during.units[1].speed(), 1 * 1.12);
  const after = battle({ team: [zero("1317", { eidolon: 4, initialEnergy: 140 }), zero("1218", { baseSpd: 1 })], maxAV: 2 * (10000 / speed) + 1 });
  after.run();
  near(after.units[1].speed(), 1);
});

test("乱破 E4：结印期间我方全体速度 +12%，退出后恢复；E1 退出时 +20", () => {
  const engine = battle({ team: [zero("1317", { eidolon: 4, initialEnergy: 140 }), zero("1218", { baseSpd: 1 })], maxAV: 1 });
  engine.run();
  near(engine.units[1].speed(), 1 * 1.12);
  const ended = battle({ team: [zero("1317", { eidolon: 1, initialEnergy: 140 })], maxAV: 3 * (10000 / 96) });
  ended.run();
  const enhanced = rows(ended).filter((row) => row.type === "enhanced_basic");
  assert.equal(enhanced.length, 3);
  // 返还 5、三次强化普攻各 20、退出 +20。
  near(ended.units[0].energy, 5 + 60 + 20 + (ended.units[0].actions - 3) * 30);
});

test("大黑塔：开大后立即行动；我方攻击后固定恢复能量，按敌人数量计", () => {
  const engine = battle({ team: [zero("1401")], maxAV: 10000 / 99 + 1, enemyCount: 3 });
  engine.run();
  // 战技 30 + 3 个目标 × 3。
  near(engine.units[0].energy, 30 + 9);
  const cap = battle({ team: [zero("1401", { baseSpd: 1 })], maxAV: 1, enemyCount: 9 });
  cap.run();
  cap.attack(cap.units[0], "skill");
  near(cap.units[0].energy, 15); // 最多计算 5 个目标
  const ult = battle({ team: [zero("1401", { initialEnergy: 220 })], maxAV: 10 });
  ult.run();
  near(rows(ult)[0].av, 0);
});

test("大黑塔 E4：只有智识角色速度 +12%", () => {
  const engine = battle({ team: [zero("1401", { eidolon: 4 }), zero("1314"), zero("1218")], maxAV: 1 });
  engine.run();
  near(engine.units[0].speed(), 99 * 1.12);
  near(engine.units[1].speed(), 103 * 1.12); // 翡翠是智识
  near(engine.units[2].speed(), 98); // 椒丘是虚无
});

test("依赖敌方的部分写清楚了", () => {
  for (const [id, keyword] of [["1217", "生命值"], ["1221", "反击"], ["1308", "负面"], ["1315", "优势口袋"], ["1317", "弱点"]] as const) {
    const { unsupported } = battle({ team: [{ id }] }).run();
    assert.ok(unsupported.some((item) => item.mechanic.includes(keyword)), `${id} 应提到 ${keyword}：${JSON.stringify(unsupported)}`);
  }
});

// ---- 3.4 老角色加强（强化版，默认开）：4.6.54 版本资料，数字手算 ---- //

test("强化版瓦尔特：开局 +30；开大额外 +5（原版是 +10）", () => {
  const start = battle({ team: [zero("1004")], maxAV: 1 });
  start.run();
  near(start.units[0].energy, 30);
  const ult = battle({ team: [zero("1004", { initialEnergy: 120 })], maxAV: 1 });
  ult.run();
  near(ult.units[0].energy, 5 + 5, "开大后：基础 5 + 行迹【裁决】5");
});

test("强化版银狼：开局 +20，自己回合开始 +5；原版都没有", () => {
  const engine = battle({ team: [zero("1006")], maxAV: 10000 / 107 + 1 });
  engine.run();
  near(engine.units[0].energy, 20 + 5 + 30);
  const plain = battle({ team: [zero("1006", { enhanced: false })], maxAV: 10000 / 107 + 1 });
  plain.run();
  near(plain.units[0].energy, 30);
});

test("强化版希儿：战技提速 25% 持续 3 回合（原版 2 回合）", () => {
  for (const [enhanced, turns] of [[true, 3], [false, 2]] as const) {
    const engine = battle({ team: [zero("1102", { enhanced })], maxAV: 10000 / 115 + 1 });
    engine.run();
    const buff = engine.units[0].buffs.find((item) => item.kind === "pct" && item.value === 25);
    assert.equal(buff?.turns, turns, `enhanced=${enhanced}`);
  }
});

test("强化版镜流：战技 +15 能量不再拉条；进【转魄】额外 +1【朔望】，强化战技 +8", () => {
  const engine = battle({ team: [zero("1212")], maxAV: 2 * (10000 / 96) });
  engine.run();
  const list = rows(engine);
  near(list[1].av, 20000 / 96, "强化版第 1 动后不再提前 10%");
  near(list[2].av, list[1].av, "第 2 动进入转魄，立即接第 3 动");
  assert.ok(list[2].label.includes("寒川映月"));
  // 20+15、20+15、30+8
  near(engine.units[0].energy, 35 + 35 + 38);
  assert.equal(kit<{ moon: number }>(engine, "1212").moon, 2, "2 层 + 额外 1 层，打一次强化战技剩 2 层");
});

test("强化版藿藿：开局 +30，【禳命】2 回合；回能没有 6 次上限（两版都是）", () => {
  const engine = battle({ team: [zero("1217", { baseSpd: 1 }), zero("1218")], maxAV: 10000 / 98 + 1 });
  engine.run();
  near(engine.units[0].energy, 30 + 1);
  // 原版开局【禳命】1 回合：藿藿 1 速，到她第一回合前椒丘行动 8 次、开大 2 次（每 4 次战技攒满 100），每次 +1，不在第 6 次停住。
  const plain = battle({ team: [zero("1217", { baseSpd: 1, enhanced: false }), zero("1218")], maxAV: 8 * (10000 / 98) + 1 });
  plain.run();
  assert.equal(plain.timeline.filter((row) => row.slot === 1 && row.type === "ultimate").length, 2);
  near(plain.units[0].energy, 8 + 2);
});

test("强化版花火：秘技开局 +20；持有战技暴伤效果的队友施放战技时 +1", () => {
  const team = [zero("1306", { baseSpd: 200 }), zero("1218")];
  const tech = createBattle({ useTechnique: true, team: [zero("1306", { baseSpd: 200 })], maxAV: 1 }, data);
  tech.run();
  near(tech.units[0].energy, 20);
  // 花火 50 时战技 +30，椒丘被拉 50% 后约 51 时施放战技 → 花火 +1；花火下一动在 100。
  const engine = battle({ team, maxAV: 60 });
  engine.run();
  near(engine.units[0].energy, 30 + 1);
  const plain = battle({ team: [zero("1306", { baseSpd: 200, enhanced: false }), zero("1218")], maxAV: 60 });
  plain.run();
  near(plain.units[0].energy, 30);
});

test("卡芙卡天赋追击 +10：原版只认队友普攻、她的回合之间 1 次；强化版任意攻击、最多 2 次", () => {
  const run = (enhanced: boolean, rotation: "basic" | "skill") => {
    const engine = battle({ team: [zero("1005", { baseSpd: 1, enhanced }), zero("1218", { rotation })], maxAV: 2 * (10000 / 98) + 1 });
    engine.run();
    return engine.units[0].energy;
  };
  near(run(false, "basic"), 10, "队友普攻两次，卡芙卡没行动过，只追 1 次");
  near(run(false, "skill"), 0, "原版不认战技");
  near(run(true, "skill"), 20, "强化版战技也算，存了 2 次");
});

test("强化版刃：天赋追击额外 +15；原版没有", () => {
  const count = (enhanced: boolean) => {
    const engine = battle({ team: [zero("1205", { enhanced })], maxAV: 6 * (10000 / 97) });
    engine.run();
    return [engine.timeline.filter((row) => row.label.startsWith("天赋【倏忽恩赐】")).length, engine.timeline.filter((row) => row.label.includes("坏劫隳亡")).length];
  };
  const [fua, bonus] = count(true);
  assert.ok(fua >= 1);
  assert.equal(bonus, fua);
  assert.equal(count(false)[1], 0);
});

test("引擎里有强化版的角色和数据里标的一致（3.4 老角色加强）", () => {
  const marked = (data.characters as { id: string; enhanceable?: boolean }[]).filter((item) => item.enhanceable).map((item) => String(item.id)).sort();
  assert.deepEqual([...ENHANCEABLE].sort(), marked);
});

test("【阿哈时刻】里各人的欢愉技连着放完，中途不插终结技（2026-11-06 群里反馈：阿哈时刻只显示真珠一个人）", () => {
  // 复现：阿哈、真珠、爻光、绯英，到 300 AV。以前 261.86 那次：真珠放完欢愉技回能攒满，终结技（连带阿哈的额外回合）
  // 插在中间，爻光、绯英、阿哈的欢愉技排在后面，界面把它们挂到插进来的动作上，阿哈时刻那张卡只剩真珠。
  const engine = createBattle({ team: [{ id: "1511" }, { id: "1503" }, { id: "1502" }, { id: "1505" }], maxAV: 300 }, data);
  engine.run();
  const { timeline } = engine;
  const marks = new Set(["basic", "skill", "enhanced_basic", "ultimate", "fua", "memosprite", "elation_skill", "aha", "aha_extra"]);
  const rows = timeline.filter((row: { type: string }) => marks.has(row.type));
  let moments = 0;
  rows.forEach((row: { type: string }, index: number) => {
    if (row.type !== "aha" && row.type !== "aha_extra") return;
    moments += 1;
    const casts = rows.slice(index + 1, index + 5).map((next: { type: string; name: string }) => `${next.type}:${next.name}`);
    assert.deepEqual(casts, ["elation_skill:真珠", "elation_skill:爻光", "elation_skill:绯英", "elation_skill:星神★阿哈"], `第 ${moments} 次阿哈时刻`);
  });
  assert.ok(moments >= 5);
});

test("缇宝天赋：队友开大后追加攻击 +5，每人一次，缇宝开大时重置", () => {
  // 缇宝 1 速不行动，开局行迹 +30。椒丘开局满能开大 → 追击 +5；4 次战技后（5+30×4）再开大，不再触发。
  const engine = battle({ team: [zero("1403", { baseSpd: 1 }), zero("1218", { initialEnergy: 100 })], maxAV: 4 * (10000 / 98) + 1 });
  engine.run();
  assert.equal(engine.timeline.filter((row) => row.slot === 1 && row.type === "ultimate").length, 2);
  assert.equal(engine.timeline.filter((row) => row.label.startsWith("天赋【好忙好忙的缇宝】")).length, 1);
  near(engine.units[0].energy, 30 + 5);
});

test("三月七•巡猎天赋：【师父】开大 +1 充能，终结技不算攻击的也给；算攻击的只给一次", () => {
  // 4.6.54 版本资料：「【师父】施放攻击或终结技后，三月七每次获得最多1点充能」。
  for (const [id, label] of [["1313", "星期日（终结技不算攻击）"], ["1218", "椒丘（终结技算攻击）"]] as const) {
    const engine = battle({ team: [zero("1224", { baseSpd: 1 }), zero(id, { baseSpd: 1 })], maxAV: 1 });
    engine.run();
    const march = kit<{ charge: number; master: unknown }>(engine, "1224");
    const master = engine.units[1];
    march.master = master;
    const before = march.charge;
    master.energy = master.ultCost;
    engine.castUltimate(master);
    assert.equal(march.charge - before, 1, label);
  }
});
