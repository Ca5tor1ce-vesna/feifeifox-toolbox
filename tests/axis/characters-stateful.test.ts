/**
 * 第二批：有状态的角色。数字来自 4.6 版本文案并手算。
 * 速度都把行迹清零，能量从 0 开始，这样每一步都能算清楚。
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
  // 开局【禳命】1 回合。藿藿很慢，队友在 10000/98 行动，触发一次。
  const engine = battle({ team: [zero("1217", { baseSpd: 1 }), zero("1218")], maxAV: 10000 / 98 + 1 });
  engine.run();
  near(engine.units[0].energy, 1);
});

test("藿藿终结技：为队友恢复各自能量上限的 22.5%", () => {
  // 目标用桑博，上限 120，开局没有回能效果：120 × 22.5% = 27。
  const engine = battle({ team: [zero("1217", { initialEnergy: 140 }), zero("1108")], maxAV: 1 });
  engine.run();
  near(engine.units[1].energy, 27);
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

test("三月七•巡猎：战斗开始提前 25%；【师父】速度 +12%", () => {
  const engine = battle({ team: [zero("1224", { targetSlot: 1 }), zero("1218")], maxAV: 7500 / 102 + 0.1 });
  engine.run();
  near(rows(engine)[0].av, 7500 / 102);
  near(engine.units[1].speed(), 98 * 1.12);
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
  const engine = battle({ team: [zero("1212")], maxAV: 2 * (10000 / 96) });
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
