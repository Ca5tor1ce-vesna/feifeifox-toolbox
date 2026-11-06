/**
 * 第四批：光锥和遗器。数字来自 4.6 版本文案，S1 和 S5 都测，确认叠影数值读对了。
 * 穿戴者选机制最少的角色；能量从 0 开始，行迹速度清零，这样每一步都能手算。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { createBattle, type BattleInput, type GameData, type MemberInput } from "../../axis-engine/src/battle.ts";
import { AxisEngine } from "../../axis-engine/src/engine.ts";
import type { Elation } from "../../axis-engine/src/modules/elation.ts";
import { LIGHTCONE_EFFECTS, RELIC_EFFECTS } from "../../axis-engine/src/modules/gear-effects.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const dataDir = join(HERE, "..", "..", "modules", "honkai-star-rail", "data");
const json = (name: string) => JSON.parse(readFileSync(join(dataDir, name), "utf-8"));
const data: GameData = { axis: json("axis_data.json"), characters: json("characters.json") };

const battle = (input: BattleInput) => createBattle({ useTechnique: false, ...input }, data);
const near = (actual: number, expected: number, message = "") =>
  assert.ok(Math.abs(actual - expected) < 1e-7, `${message} 期望 ${expected}，实际 ${actual}`);
const zero = (id: string, extra: Partial<MemberInput> = {}): MemberInput => ({ id, traceSpd: 0, initialEnergy: 0, enhanced: false, ...extra });
const cone = (id: string, superimpose = 1) => ({ lightcone: { id, superimpose } });
const set4 = (id: string) => ({ relics: [{ id, pieces: 4 as const }] });
const set2 = (id: string) => ({ relics: [{ id, pieces: 2 as const }] });

// 各命途机制最少的穿戴者：基础速度、能量上限、普攻 20、战技 30、终结技 5。
const PRIEST = "1110"; // 玲可 100 速，上限 100，战技指定我方单体，终结技我方全体
const SHAMAN = "1215"; // 寒鸦 110 速，上限 140，终结技指定我方单体
const MAGE = "1003"; // 姬子 96 速，上限 120
const ROGUE = "1305"; // 真理医生 103 速，上限 140
const WARLOCK = "1004"; // 瓦尔特 102 速，上限 120。这里只看装备，按原版（强化版开局另有回能）
const WARRIOR = "1221"; // 云璃 94 速，上限 240
const KNIGHT = "1104"; // 杰帕德 92 速，上限 100
const ALLY = "1211"; // 白露 98 速，上限 100
const ELATION = "1501"; // 火花，欢愉光锥用

const SLOW = { baseSpd: 1 };

/** 只结算开局，不让任何人行动。 */
const opening = (...team: MemberInput[]) => {
  const engine = battle({ team, maxAV: 1 });
  engine.run();
  return engine;
};
/** 跑到穿戴者（第一个人）第 n 次行动结束。 */
const actions = (n: number, first: MemberInput, speed: number, ...rest: MemberInput[]) => {
  const engine = battle({ team: [first, ...rest], maxAV: (n * 10000) / speed + 0.01 });
  engine.run();
  return engine;
};

test("输入校验：没有的光锥、遗器、叠影写错都报可读错误；不穿装备不受影响", () => {
  assert.throws(() => opening(zero(PRIEST, cone("99999"))), /没有找到光锥 99999/);
  assert.throws(() => opening(zero(PRIEST, cone("20008", 6))), /叠影需要是 1~5/);
  assert.throws(() => opening(zero(PRIEST, set4("999"))), /没有找到遗器套装 999/);
  assert.throws(() => opening(zero(PRIEST, { relics: [{ id: "102", pieces: 3 as 2 }] })), /只能是 2 或 4/);
  near(opening(zero(PRIEST)).units[0].speed(), 100);
});

test("光锥命途不同时效果不生效，并在结果里说明", () => {
  const engine = battle({ team: [zero(ROGUE, cone("20008"))], maxAV: 1 }); // 嘉果是丰饶光锥
  const result = engine.run();
  near(engine.units[0].energy, 0);
  assert.ok(result.notes.some((text) => text.includes("嘉果")));
});

test("依赖敌方、生命或随机的效果写进未计入提示", () => {
  for (const [input, keyword] of [
    [zero(ROGUE, cone("20014")), "相抗"],
    [zero(PRIEST, set4("106")), "铁卫"],
    [zero(SHAMAN, cone("21032")), "随机"],
  ] as const) {
    const result = battle({ team: [input], maxAV: 1 }).run();
    assert.ok(result.unsupported.some((item) => item.mechanic.includes(keyword)), `应提到 ${keyword}：${JSON.stringify(result.unsupported)}`);
  }
});

// ------------------------------ 回能 ------------------------------

test("嘉果：战斗开始我方全体回能 6，S5 为 12", () => {
  const s1 = opening(zero(PRIEST, cone("20008")), zero(ALLY, SLOW));
  near(s1.units[0].energy, 6);
  near(s1.units[1].energy, 6);
  near(opening(zero(PRIEST, cone("20008", 5))).units[0].energy, 12);
});

test("回能吃能量恢复效率", () => {
  near(opening(zero(PRIEST, { ...cone("20008"), err: 50 })).units[0].energy, 9);
});

test("轮契：攻击后回能 4，单个回合内不重复", () => {
  const engine = opening(zero(SHAMAN, { ...cone("20012"), ...SLOW }));
  engine.attack(engine.units[0], "basic");
  engine.attack(engine.units[0], "basic");
  near(engine.units[0].energy, 4);
  engine.takeTurn(engine.units[0]); // 新回合：战技 30，再触发一次
  near(engine.units[0].energy, 4 + 30 + 4);
});

test("灵钥：施放战技后回能 8，普攻不触发", () => {
  near(actions(1, zero(MAGE, cone("20013")), 96).units[0].energy, 30 + 8);
  near(actions(1, zero(MAGE, cone("20013", 5)), 96).units[0].energy, 30 + 12);
  near(actions(1, zero(MAGE, { ...cone("20013"), rotation: "basic" }), 96).units[0].energy, 20);
});

test("记忆中的模样：攻击后回能 4，单个回合内不重复", () => {
  near(actions(1, zero(SHAMAN, cone("21004")), 110).units[0].energy, 30 + 4);
  near(actions(1, zero(SHAMAN, cone("21004", 5)), 110).units[0].energy, 30 + 8);
});

test("同一种心情：施放战技时我方全体回能 2", () => {
  const engine = actions(1, zero(PRIEST, cone("21007")), 100, zero(ALLY, SLOW));
  near(engine.units[0].energy, 30 + 2);
  near(engine.units[1].energy, 2);
  near(actions(1, zero(PRIEST, cone("21007", 5)), 100, zero(ALLY, SLOW)).units[1].energy, 4);
  near(actions(1, zero(PRIEST, { ...cone("21007"), rotation: "basic" }), 100, zero(ALLY, SLOW)).units[1].energy, 0);
});

test("别让世界静下来：进入战斗回能 20，S5 为 32", () => {
  near(opening(zero(MAGE, cone("21013"))).units[0].energy, 20);
  near(opening(zero(MAGE, cone("21013", 5))).units[0].energy, 32);
});

test("等价交换：只有 1 名队友不足 50% 时给他 8；多人时随机，不计入", () => {
  const one = actions(1, zero(PRIEST, cone("21021")), 100, zero(ALLY, { ...SLOW, initialEnergy: 40 }), zero(ROGUE, { ...SLOW, initialEnergy: 70 }));
  near(one.units[1].energy, 48);
  near(one.units[2].energy, 70);
  const two = actions(1, zero(PRIEST, cone("21021")), 100, zero(ALLY, { ...SLOW, initialEnergy: 40 }), zero(ROGUE, SLOW));
  near(two.units[1].energy, 40);
  near(two.units[2].energy, 0);
});

test("棺的回响：攻击后按击中目标数回能 3，最多 3 名；普攻按单体", () => {
  const skill = battle({ team: [zero(PRIEST, cone("23008"))], maxAV: 10000 / 100 + 0.01, enemyCount: 5 });
  skill.run();
  near(skill.units[0].energy, 30 + 3 * 3);
  const basic = battle({ team: [zero(PRIEST, { ...cone("23008"), rotation: "basic" })], maxAV: 10000 / 100 + 0.01, enemyCount: 5 });
  basic.run();
  near(basic.units[0].energy, 20 + 3);
  near(actions(1, zero(PRIEST, cone("23008", 5)), 100).units[0].energy, 30 + 5);
});

test("镜中故我：我方全体回能 10，两人都穿也只回一次", () => {
  const engine = opening(zero(SHAMAN, cone("23019")), zero("1101", { ...cone("23019"), ...SLOW }));
  near(engine.units[0].energy, 10);
  near(engine.units[1].energy, 10);
  near(opening(zero(SHAMAN, cone("23019", 5))).units[0].energy, 20);
});

test("忍法帖：进战回能 30；开大后 2 次普攻提前 50%", () => {
  near(opening(zero(MAGE, cone("23033"))).units[0].energy, 30);
  near(opening(zero(MAGE, cone("23033", 5))).units[0].energy, 40);
  const engine = opening(zero(MAGE, { ...cone("23033"), rotation: "basic", initialEnergy: 120, ...SLOW }));
  const unit = engine.units[0];
  assert.equal(unit.ultimates, 1);
  engine.takeTurn(unit);
  near(unit.remDist, 10000);
  engine.takeTurn(unit);
  near(unit.remDist, 5000);
  engine.takeTurn(unit); // 【雷遁】已移除，再打两次也不触发
  engine.takeTurn(unit);
  near(unit.remDist, 10000);
});

test("回到大地的飞行：对我方单体施放战技回能 6；战技不指定队友的不触发", () => {
  near(actions(1, zero(PRIEST, { lightcone: { id: "23034" }, relics: [] }), 100).units[0].energy, 30);
  near(actions(1, zero(SHAMAN, cone("23034")), 110).units[0].energy, 30); // 寒鸦战技打敌人
  const bronya = actions(1, zero("1101", cone("23034")), 99);
  near(bronya.units[0].energy, 30 + 6);
  near(actions(1, zero("1101", cone("23034", 5)), 99).units[0].energy, 30 + 8);
  near(opening(zero(SHAMAN, { ...cone("23034"), initialEnergy: 140 })).units[0].energy, 5 + 6); // 寒鸦终结技指定队友
});

test("如果时间是一朵花：进战回能 21；追加攻击回能 12", () => {
  const engine = opening(zero(SHAMAN, { ...cone("23038"), ...SLOW }));
  near(engine.units[0].energy, 21);
  engine.attack(engine.units[0], "fua");
  near(engine.units[0].energy, 33);
  engine.attack(engine.units[0], "basic");
  near(engine.units[0].energy, 33);
});

test("生命当付之一炬：回合开始回能 10", () => {
  near(actions(1, zero(MAGE, cone("23041")), 96).units[0].energy, 10 + 30);
});

test("没有回报的加冕：上限 ≥ 300 才固定回 10%", () => {
  near(opening(zero(WARRIOR, { ...cone("23045"), initialEnergy: 120 })).units[0].energy, 5); // 云璃消耗 120
  near(opening(zero("1014", { ...cone("23045"), initialEnergy: 360 })).units[0].energy, 5 + 36);
});

test("灼尽炼狱的新骸：回合开始固定回 20，只触发一次", () => {
  const engine = actions(2, zero(WARLOCK, cone("23059")), 102);
  near(engine.units[0].energy, 20 + 30 + 30);
  // 固定恢复不吃能量恢复效率，战技吃。
  near(actions(1, zero(WARLOCK, { ...cone("23059"), err: 100 }), 102).units[0].energy, 20 + 60);
});

test("焚影：首次召唤忆灵回能 12，再召唤不算", () => {
  const engine = actions(1, zero("8007", { ...cone("20021"), baseSpd: 100 }), 100);
  // 迷迷开局提前 30%，这里只看开大前的第一次战技：30 + 12。
  near(engine.units[0].energy, 30 + 12);
  const evernight = opening(zero("1413", { ...cone("20021", 5), ...SLOW }));
  // 开局 70，长夜 0 AV 行动 20 + 5，焚影 S5 20。
  const unit = evernight.units[0];
  near(unit.energy, 70 + 25 + 20);
  // 迷梦后长夜消失，下次战技再召唤不算首次。
  (unit.kit as unknown as { memory: number }).memory = 16;
  const night = evernight.summons.find((actor) => actor.name === "长夜")!;
  night.onTurn(night);
  const before = unit.energy;
  evernight.takeTurn(unit);
  assert.ok(evernight.summons.some((actor) => actor.name === "长夜"));
  near(unit.energy, before + 30 + 5);
});

test("致长夜的星光：忆灵消失时回能 8", () => {
  const engine = opening(zero("1413", { ...cone("23049"), ...SLOW }));
  near(engine.units[0].energy, 70 + 20 + 5); // 长夜上场不回
  const before = engine.units[0].energy;
  const state = engine.units[0].kit as unknown as { memory: number };
  state.memory = 16;
  const night = engine.summons.find((actor) => actor.name === "长夜")!;
  night.onTurn(night);
  // 迷梦 10 + 消失 8。
  near(engine.units[0].energy, before + 10 + 8);
});

test("献给明日的色彩：真珠施放欢愉技固定回 10，其他人不触发", () => {
  const pearl = opening(zero("1503", { ...cone("23055"), ...SLOW }));
  const before = pearl.units[0].energy;
  pearl.attack(pearl.units[0], "elation_skill");
  near(pearl.units[0].energy, before + 10);
  const other = opening(zero("1501", { ...cone("23055"), ...SLOW }));
  const start = other.units[0].energy;
  other.attack(other.units[0], "elation_skill");
  near(other.units[0].energy, start);
});

// ------------------------------ 能量恢复效率 ------------------------------

test("常驻能量恢复效率：一场术后对话 8%，S5 16%", () => {
  near(actions(1, zero(PRIEST, cone("21000")), 100).units[0].energy, 30 * 1.08);
  near(actions(1, zero(PRIEST, cone("21000", 5)), 100).units[0].energy, 30 * 1.16);
});

test("其他常驻能量恢复效率读的是文案对应的数值", () => {
  const rate = (input: MemberInput) => opening(input).units[0].totalErr();
  near(rate(zero(SHAMAN, cone("23003"))), 10);
  near(rate(zero(SHAMAN, cone("23003", 5))), 18);
  near(rate(zero(KNIGHT, cone("23011"))), 12);
  near(rate(zero(KNIGHT, cone("23011", 5))), 20);
  near(rate(zero(PRIEST, cone("23017"))), 12);
  near(rate(zero(PRIEST, cone("23017", 5))), 20);
  near(rate(zero(WARRIOR, cone("23062"))), 10);
  near(rate(zero(WARRIOR, cone("23062", 5))), 20);
});

test("邂逅于下一个花季：上限 480 时 10% + 36 × 0.3%", () => {
  const rate = opening(zero("1505", { ...cone("23058"), ...SLOW })).units[0].totalErr();
  near(rate, 10 + 36 * 0.3);
});

test("光锥数值的下标：不变的常量也占位，不能按文案顺序数", () => {
  // 这些是第一版写错过的：等价交换的 0.5、焚影的 1 个战技点、驶向的 150% 门槛都占了位置。
  const ally = zero(ALLY, { ...SLOW, initialEnergy: 40 });
  near(actions(1, zero(PRIEST, cone("21021", 5)), 100, ally, zero(ROGUE, { ...SLOW, initialEnergy: 70 })).units[1].energy, 56);
  near(opening(zero(ROGUE, { ...cone("23027"), baseSpd: 100 })).units[0].speed(), 112);
  near(opening(zero(ROGUE, { ...cone("23027", 5), baseSpd: 100 })).units[0].speed(), 120);
  near(opening(zero("1505", { ...cone("23058", 5), ...SLOW })).units[0].totalErr(), 16 + 36 * 0.3);
});

test("比阳光更明亮的：普攻叠【龙吟】，每层 6%，最多 2 层，持续 2 回合", () => {
  const engine = opening(zero(WARRIOR, { ...cone("23015"), rotation: "basic", ...SLOW }));
  const unit = engine.units[0];
  engine.takeTurn(unit); // 第 1 层：这一动的普攻回能还没吃到
  near(unit.energy, 20);
  near(unit.totalErr(), 6);
  engine.takeTurn(unit); // 吃 6%，叠到 2 层
  near(unit.energy, 20 + 20 * 1.06);
  near(unit.totalErr(), 12);
  engine.takeTurn(unit); // 吃 12%，上限 2 层
  near(unit.totalErr(), 12);
  near(opening(zero(WARRIOR, { ...cone("23015", 5), rotation: "basic" })).units[0].totalErr(), 0);
});

test("比阳光更明亮的：不再普攻时 2 回合后消失", () => {
  const engine = opening(zero(WARRIOR, { ...cone("23015"), script: ["basic", "skill", "skill", "skill"], ...SLOW }));
  const unit = engine.units[0];
  engine.takeTurn(unit);
  near(unit.totalErr(), 6);
  engine.takeTurn(unit); // 回合开始已存在，回合结束减到 1
  near(unit.totalErr(), 6);
  engine.takeTurn(unit); // 减到 0，消失
  near(unit.totalErr(), 0);
});

test("夜色流光溢彩：我方每次攻击 1 层【歌咏】，每层 3%，最多 5 层，开大清空", () => {
  const engine = opening(zero(SHAMAN, { ...cone("23026"), ...SLOW }), zero(ALLY, SLOW));
  const unit = engine.units[0];
  engine.attack(engine.units[1], "basic");
  near(unit.totalErr(), 3);
  for (let i = 0; i < 9; i += 1) engine.attack(engine.units[1], "skill");
  near(unit.totalErr(), 15);
  engine.attack(engine.units[1], "memosprite"); // 忆灵不算「我方角色」，不过此时已满层，单独再测
  unit.energy = 140;
  engine.maybeUltimate(unit);
  near(unit.totalErr(), 0);
  engine.attack(engine.units[1], "memosprite");
  near(unit.totalErr(), 0);
  near(opening(zero(SHAMAN, cone("23026", 5))).units[0].totalErr(), 0);
});

test("当她决定看见：速度 18%；【上上签】能量恢复效率 12% 持续 3 回合；进战固定回 15", () => {
  const bare = opening(zero(ELATION, { baseSpd: 100, rotation: "basic" })).units[0].energy;
  const engine = opening(zero(ELATION, { ...cone("23054"), baseSpd: 100, rotation: "basic" }));
  const unit = engine.units[0];
  near(unit.speed(), 118);
  near(unit.energy, bare + 15);
  near(unit.totalErr(), 12);
  for (let i = 0; i < 2; i += 1) engine.takeTurn(unit);
  near(unit.totalErr(), 12);
  engine.takeTurn(unit);
  near(unit.totalErr(), 0);
  const s5 = opening(zero(ELATION, { ...cone("23054", 5), baseSpd: 100 })).units[0];
  near(s5.speed(), 130);
  near(s5.totalErr(), 20);
});

test("当她决定看见：对我方目标开大刷新【上上签】，打敌人的不刷新", () => {
  const after = (id: string) => {
    const engine = opening(zero(id, { ...cone("23054"), rotation: "basic", ...SLOW }), zero(ALLY, SLOW));
    const unit = engine.units[0];
    for (let i = 0; i < 3; i += 1) engine.takeTurn(unit);
    assert.equal(unit.ultimates, 0, "这个场景不该提前开大");
    near(unit.totalErr(), 0);
    unit.energy = unit.ultCost;
    engine.maybeUltimate(unit);
    assert.equal(unit.ultimates, 1);
    return unit.totalErr();
  };
  near(after("1503"), 12); // 真珠：终结技指定我方单体
  near(after(ELATION), 0); // 火花：终结技打敌人
});

// ------------------------------ 速度 ------------------------------

test("常驻速度百分比：吃百分比乘区，不吃行迹固定速度", () => {
  const unit = opening(zero(ROGUE, { ...cone("21024"), baseSpd: 100, traceSpd: 10 })).units[0];
  near(unit.speed(), 100 * 1.08 + 10);
  near(opening(zero(ROGUE, { ...cone("21024", 5), baseSpd: 100 })).units[0].speed(), 112);
});

test("基础速度提高的光锥进百分比乘区", () => {
  const unit = opening(zero(WARRIOR, { ...cone("23044"), baseSpd: 100, pctSpd: 10 })).units[0];
  near(unit.speed(), 112 * 1.1);
  near(opening(zero(WARRIOR, { ...cone("23044", 5), baseSpd: 100 })).units[0].speed(), 120);
  near(opening(zero("8007", { ...cone("23036"), baseSpd: 100 })).units[0].speed(), 112);
  near(opening(zero(ROGUE, { ...cone("23044"), baseSpd: 100 })).units[0].speed(), 100); // 命途不同
});

test("调和：我方全体 +12 点，持续 1 回合", () => {
  const engine = opening(zero(SHAMAN, { ...cone("20019"), baseSpd: 100 }), zero(ALLY, { baseSpd: 100 }));
  near(engine.units[0].speed(), 112);
  near(engine.units[1].speed(), 112);
  engine.takeTurn(engine.units[0]);
  near(engine.units[0].speed(), 100);
  near(engine.units[1].speed(), 112);
  near(opening(zero(SHAMAN, { ...cone("20019", 5), baseSpd: 100 })).units[0].speed(), 120);
});

test("谐乐静默之后：开大后速度 +8%，持续 2 回合", () => {
  const engine = opening(zero(MAGE, { ...cone("21045"), baseSpd: 100, initialEnergy: 120 }));
  const unit = engine.units[0];
  near(unit.speed(), 108);
  engine.takeTurn(unit);
  near(unit.speed(), 108);
  engine.takeTurn(unit);
  near(unit.speed(), 100);
  near(opening(zero(MAGE, { ...cone("21045", 5), baseSpd: 100, initialEnergy: 120 })).units[0].speed(), 116);
});

test("黑夜如影随行：进入战斗速度 +8%，持续 2 回合", () => {
  const engine = opening(zero(ROGUE, { ...cone("21047"), baseSpd: 100 }));
  near(engine.units[0].speed(), 108);
  engine.takeTurn(engine.units[0]);
  near(engine.units[0].speed(), 108);
  engine.takeTurn(engine.units[0]);
  near(engine.units[0].speed(), 100);
});

test("只需等待：每次攻击速度 +4.8%，最多 3 层", () => {
  const engine = opening(zero(WARLOCK, { ...cone("23006"), baseSpd: 100 }));
  const unit = engine.units[0];
  near(unit.speed(), 100);
  engine.attack(unit, "basic");
  near(unit.speed(), 104.8);
  engine.attack(unit, "memosprite"); // 忆灵的攻击不算
  near(unit.speed(), 104.8);
  for (let i = 0; i < 5; i += 1) engine.attack(unit, "basic");
  near(unit.speed(), 114.4);
});

test("棺的回响：开大后我方全体 +12 点，持续 1 回合", () => {
  const engine = opening(zero(PRIEST, { ...cone("23008"), baseSpd: 100, initialEnergy: 100 }), zero(ALLY, { baseSpd: 100 }));
  near(engine.units[0].speed(), 112);
  near(engine.units[1].speed(), 112);
});

test("你将起身歌唱：开局提前 30%，【新声】期间全队 +20%，持续 2 回合", () => {
  const engine = opening(zero("8007", { ...cone("23063"), baseSpd: 100 }), zero(ALLY, { baseSpd: 100 }));
  const [unit, ally] = engine.units;
  near(unit.speed(), 120);
  near(ally.speed(), 120);
  near(unit.remDist, 10000 - 3000 - 3000); // 开拓者自身行迹 30% + 光锥 30%
  engine.takeTurn(unit);
  near(ally.speed(), 120);
  engine.takeTurn(unit);
  near(ally.speed(), 100);
  const s5 = opening(zero("8007", { ...cone("23063", 5), baseSpd: 100 }));
  near(s5.units[0].speed(), 140);
  near(s5.units[0].remDist, 10000 - 3000 - 4000);
});

test("向浪花掷下盛夏：施放欢愉技后速度 +24%，S5 40%，不叠加", () => {
  const engine = opening(zero("1501", { ...cone("23064"), baseSpd: 100 }));
  near(engine.units[0].speed(), 100);
  engine.attack(engine.units[0], "basic");
  near(engine.units[0].speed(), 100);
  engine.attack(engine.units[0], "elation_skill");
  engine.attack(engine.units[0], "elation_skill");
  near(engine.units[0].speed(), 124);
  const s5 = opening(zero("1501", { ...cone("23064", 5), baseSpd: 100 }));
  s5.attack(s5.units[0], "elation_skill");
  near(s5.units[0].speed(), 140);
});

test("实际施放的判定：召唤物的记录不算装备者施放", () => {
  const casts: (readonly string[])[] = [];
  const engine = new AxisEngine({
    maxAV: 1,
    units: [{
      id: "x",
      name: "测试",
      baseSpd: 100,
      maxEnergy: 100,
      kit: {
        id: "x",
        act: ({ engine: current, self }) => {
          current.record("skill", self, "召唤物放的", { kind: "summon" });
          current.record("basic", self, "自己放的");
        },
      },
    }],
  });
  engine.on("actionDone", ({ casts: done }) => casts.push(done));
  engine.takeTurn(engine.units[0]);
  assert.deepEqual(casts, [["basic"]]);
});

test("欢迎来到银河城：对自身开大获得笑点，3 次普攻后才能再触发", () => {
  // 银狼自己的终结技也可能给笑点，和不穿这件光锥的同一个流程比差值。
  const play = (extra: Partial<MemberInput>) => {
    const engine = opening(zero("1506", { ...extra, rotation: "basic", ...SLOW }));
    const unit = engine.units[0];
    const elation = engine.module<Elation>("elation")!;
    const cast = () => {
      const before = elation.punchline;
      engine.castUltimate(unit);
      return elation.punchline - before;
    };
    const gains = [cast(), cast()];
    for (let i = 0; i < 3; i += 1) engine.takeTurn(unit);
    gains.push(cast());
    return gains;
  };
  const bare = play({});
  const worn = play(cone("23057"));
  near(worn[0] - bare[0], 20);
  near(worn[1] - bare[1], 0);
  near(worn[2] - bare[2], 20);
  near(play(cone("23057", 5))[0] - bare[0], 40);
});

// ------------------------------ 拉条 ------------------------------

test("蕃息：普攻后下一次行动提前 12%，战技不触发", () => {
  const engine = opening(zero(PRIEST, { ...cone("20015"), rotation: "basic", ...SLOW }));
  engine.takeTurn(engine.units[0]);
  near(engine.units[0].remDist, 8800);
  const s5 = opening(zero(PRIEST, { ...cone("20015", 5), rotation: "basic", ...SLOW }));
  s5.takeTurn(s5.units[0]);
  near(s5.units[0].remDist, 8000);
  const skill = opening(zero(PRIEST, { ...cone("20015"), ...SLOW }));
  skill.takeTurn(skill.units[0]);
  near(skill.units[0].remDist, 10000);
});

test("舞！舞！舞！：开大后我方全体提前 16%，S5 24%", () => {
  const engine = opening(zero(SHAMAN, { ...cone("21018"), initialEnergy: 140 }), zero(ALLY, SLOW));
  near(engine.units[0].remDist, 8400);
  near(engine.units[1].remDist, 8400);
  near(opening(zero(SHAMAN, { ...cone("21018", 5), initialEnergy: 140 })).units[0].remDist, 7600);
});

test("舞！舞！舞！：装备者自己行动完开大，自己也吃这次拉条（回合结束后结算，和风套一样）", () => {
  // 攻略 BV1sW421P7t8（10:26）实测：未强化花火、风套 + 翁瓦克，158 速四轮八动；再带舞！舞！舞！159 速四轮九动。
  // 也就是自己放完战技满能开大，舞！舞！舞！给自己的那口照样算。以前「在自己回合里开大」时整个跳过自己，只有 8 动。
  const sparkle = (speed: number, withCone: boolean) => {
    const probe = battle({ team: [zero("1306")], maxAV: 1 });
    const base = probe.units[0].speed();
    const engine = battle({
      team: [zero("1306", { enhanced: false, initialEnergy: undefined, flatSpd: speed - base, err: 19.4, relics: [{ id: "110", pieces: 4 }, { id: "308", pieces: 2 }], ...(withCone ? cone("21018", 5) : {}) })],
      maxAV: 450,
      useTechnique: true,
    });
    engine.run();
    return engine.timeline.filter((row) => row.type === "skill" || row.type === "basic").length;
  };
  assert.equal(sparkle(158, false), 8, "风翁 158 速四轮八动");
  assert.equal(sparkle(159, true), 9, "再带舞！舞！舞！159 速四轮九动");
});

test("让告别，更美一些：忆灵消失时提前 12%，只触发一次，开大重置", () => {
  const engine = opening(zero("1413", { ...cone("23040"), ...SLOW }));
  const unit = engine.units[0];
  const start = unit.remDist;
  const state = unit.kit as unknown as { memory: number };
  const night = () => engine.summons.find((actor) => actor.name === "长夜")!;
  state.memory = 16;
  night().onTurn(night());
  near(unit.remDist, start - 1200);
  engine.takeTurn(unit); // 再召唤长夜
  state.memory = 16;
  const before = unit.remDist;
  night().onTurn(night());
  near(unit.remDist, before); // 这次不触发
  engine.takeTurn(unit);
  unit.energy = 240;
  engine.maybeUltimate(unit);
  state.memory = 16;
  const after = unit.remDist;
  night().onTurn(night());
  near(unit.remDist, after - 1200);
});

// ------------------------------ 遗器 ------------------------------

test("2 件套速度 6%：4 件也生效", () => {
  for (const id of ["114", "121", "125", "130", "133", "316", "320"]) {
    near(opening(zero(PRIEST, { ...set2(id), baseSpd: 100 })).units[0].speed(), 106, id);
    near(opening(zero(PRIEST, { ...set4(id), baseSpd: 100 })).units[0].speed(), 106, id);
  }
});

test("快枪手 4 件速度 6%，2 件没有", () => {
  near(opening(zero(PRIEST, { ...set4("102"), baseSpd: 100 })).units[0].speed(), 106);
  near(opening(zero(PRIEST, { ...set2("102"), baseSpd: 100 })).units[0].speed(), 100);
});

test("哀歌覆国的诗人 4 件速度降低 8%", () => {
  near(opening(zero(PRIEST, { ...set4("124"), baseSpd: 100 })).units[0].speed(), 92);
});

test("能量恢复效率 5%：翁瓦克、匹诺康尼、露莎卡", () => {
  for (const id of ["308", "312", "317"]) near(opening(zero(PRIEST, set2(id))).units[0].totalErr(), 5, id);
});

test("翔鹰 4 件：开大后自身提前 25%，回合内挂起到回合结束", () => {
  const engine = opening(zero(PRIEST, { ...set4("110"), initialEnergy: 100 }));
  near(engine.units[0].remDist, 7500);
  near(opening(zero(PRIEST, { ...set2("110"), initialEnergy: 100 })).units[0].remDist, 10000);
  // 回合内开大：能量 75 + 战技 30 = 105，当场开大，距离 10000 - 2500。
  const inside = opening(zero(PRIEST, { ...set4("110"), initialEnergy: 75, ...SLOW }));
  inside.takeTurn(inside.units[0]);
  assert.equal(inside.units[0].ultimates, 1);
  near(inside.units[0].remDist, 7500);
});

// 试装遗器之前，有条件的开局拉条一律按满足算。
test("神的瞬息欢愉：速度 +6%，开局提前 40%；欢愉度条件按满足算", () => {
  // 星神★阿哈速度 ≥ 125 时行迹【盒中蕴藏的世界】给欢愉度 +120%，本来就满足。行迹自己的开局 30% 这里关掉。
  const aha = (baseSpd: number) => ({ id: "1511", traceSpd: 0, lcBaseSpd: 0, baseSpd, ...set2("329") });
  const fast = battle({ team: [aha(118)], maxAV: 1, elation: { trace3Advance: false } });
  const fastResult = fast.run();
  near(fast.units[0].speed(), 118 * 1.06);
  near(fast.units[0].remDist, 6000);
  assert.ok(fastResult.timeline.some((row) => row.details.some((d) => d.includes("满足 40%"))));
  const slow = battle({ team: [aha(117)], maxAV: 1, elation: { trace3Advance: false } });
  const slowResult = slow.run();
  near(slow.units[0].remDist, 6000, "117 × 1.06 < 125 也按满足算");
  assert.ok(!slowResult.unsupported.some((item) => item.mechanic.includes("欢愉度")));
  const other = battle({ team: [zero(PRIEST, { ...set2("329"), baseSpd: 100 })], maxAV: 1 });
  const otherResult = other.run();
  near(other.units[0].remDist, 6000);
  assert.ok(otherResult.timeline.some((row) => row.details.some((d) => d.includes("条件按满足算"))));
});

test("翁瓦克：开局提前 40%；速度不到 120 时条件按满足算，并写明", () => {
  near(opening(zero(PRIEST, { ...set2("308"), baseSpd: 120 })).units[0].remDist, 6000);
  const slow = opening(zero(PRIEST, { ...set2("308"), baseSpd: 119 }));
  near(slow.units[0].remDist, 6000);
  assert.ok(slow.timeline.some((row) => row.details.some((d) => d.includes("< 120，条件按满足算"))));
  const withSet = zero(PRIEST, { baseSpd: 114, relics: [{ id: "308", pieces: 2 }, { id: "121", pieces: 2 }] });
  near(opening(withSet).units[0].remDist, 6000); // 114 × 1.06 = 120.84
});

test("信使 4 件：对我方目标开大全队 +12%，持续 1 回合；打敌人的不触发；不叠加", () => {
  const engine = opening(zero(PRIEST, { ...set4("114"), baseSpd: 100, initialEnergy: 100 }), zero(ALLY, { baseSpd: 100 }));
  near(engine.units[0].speed(), 118); // 百分比相加：6% + 12%
  near(engine.units[1].speed(), 112);
  near(opening(zero(WARLOCK, { ...set4("114"), baseSpd: 100, initialEnergy: 120 })).units[0].speed(), 106);
  const both = opening(zero(PRIEST, { ...set4("114"), baseSpd: 100, initialEnergy: 100 }), zero("1211", { ...set4("114"), baseSpd: 100, initialEnergy: 100 }));
  near(both.units[1].speed(), 118);
});

test("凯歌祝捷的英豪 4 件：忆灵在场时速度 +6%，消失后没有", () => {
  const engine = opening(zero("1413", { ...set4("123"), baseSpd: 100 }));
  const unit = engine.units[0];
  near(unit.speed(), 106);
  const state = unit.kit as unknown as { memory: number };
  state.memory = 16;
  const night = engine.summons.find((actor) => actor.name === "长夜")!;
  night.onTurn(night);
  near(unit.speed(), 100 * (1 + (10 + 16) / 100));
  near(opening(zero(PRIEST, { ...set4("123"), baseSpd: 100 })).units[0].speed(), 100);
});

test("永恒之地翁法罗斯：装备者忆灵在场时全队 +8%，无法叠加", () => {
  const engine = opening(zero("1413", { ...set2("323"), baseSpd: 100 }), zero("8007", { ...set2("323"), ...SLOW }), zero(ALLY, { baseSpd: 100 }));
  near(engine.units[2].speed(), 108);
  near(opening(zero(PRIEST, { ...set2("323"), ...SLOW }), zero(ALLY, { baseSpd: 100 })).units[1].speed(), 100);
});

test("女武神 4 件：行动后【甘霖】速度 +6%，持续 2 回合；提示是假设", () => {
  const engine = battle({ team: [zero(PRIEST, { ...set4("125"), baseSpd: 100 })], maxAV: 1 });
  const result = engine.run();
  const unit = engine.units[0];
  near(unit.speed(), 106); // 2 件
  engine.takeTurn(unit);
  near(unit.speed(), 112);
  assert.ok(result.unsupported.some((item) => item.mechanic.includes("甘霖")));
});

test("光锥、遗器、面板一起算：加法在同一个百分比乘区", () => {
  const unit = opening(zero(ROGUE, { baseSpd: 100, pctSpd: 10, flatSpd: 5, traceSpd: 9, ...cone("21024"), relics: [{ id: "121", pieces: 2 }] })).units[0];
  near(unit.speed(), 100 * (1 + 0.1 + 0.08 + 0.06) + 5 + 9);
});

// ------------------------------ 跨模块一致 ------------------------------

test("常驻速度百分比和配速查询的数据一致（全部叠影）", () => {
  const cones = json("lightcones.json") as { id: string; path: string; effects: { kind: string; value: number; apply: string; durationTurns: number; maxStacks: number; superimpose: number | null; text: string }[] }[];
  const wearer: Record<string, string> = { Rogue: ROGUE, Priest: PRIEST, Shaman: SHAMAN, Mage: MAGE, Warlock: WARLOCK, Warrior: WARRIOR, Knight: KNIGHT, Memory: "8007", Elation: "1501" };
  let checked = 0;
  for (const item of cones) {
    for (const effect of item.effects) {
      const plain = effect.kind === "pct" && effect.apply === "self" && effect.durationTurns === 0 && effect.maxStacks === 0;
      if (!plain || !effect.superimpose || !LIGHTCONE_EFFECTS[item.id] || !/速度提高/.test(effect.text) || /欢愉技/.test(effect.text)) continue;
      const unit = opening(zero(wearer[item.path], { ...cone(item.id, effect.superimpose), baseSpd: 100 })).units[0];
      near(unit.speed(), 100 + effect.value, `${item.id} S${effect.superimpose}`);
      checked += 1;
    }
  }
  assert.ok(checked >= 45, `只比较了 ${checked} 条`);
});

test("常驻遗器速度和配速查询的数据一致", () => {
  const sets = json("relic_sets.json") as { id: string; effects: { source: string; kind: string; value: number; apply: string; durationTurns: number }[] }[];
  let checked = 0;
  for (const item of sets) {
    for (const effect of item.effects) {
      if (effect.kind !== "pct" || effect.apply !== "self" || effect.durationTurns !== 0) continue;
      const pieces = effect.source.includes("4") ? 4 : 2;
      if (item.id === "125" && pieces === 4) continue; // 【甘霖】有触发条件，配速查询记成常驻，这里按触发算。
      const speed = opening(zero(PRIEST, { baseSpd: 100, relics: [{ id: item.id, pieces }] })).units[0].speed();
      const fromTwo = pieces === 4 ? item.effects.filter((other) => other.source.includes("2") && other.kind === "pct" && other.durationTurns === 0).reduce((sum, other) => sum + other.value, 0) : 0;
      near(speed, 100 + effect.value + fromTwo, `${item.id} ${pieces} 件`);
      checked += 1;
    }
  }
  assert.ok(checked >= 9, `只比较了 ${checked} 条`);
});

test("分类标出的光锥和遗器都有处理，或者确认过只有伤害类效果", () => {
  const axis = data.axis as unknown as {
    lightcones: Record<string, { categories: string[] }>;
    relicSets: Record<string, { pieces: Record<string, { categories: string[] }> }>;
  };
  // 文案核对过：只是提到召唤物，没有行动轴效果。
  const reviewed = new Set(["23051"]);
  const missedCones = Object.entries(axis.lightcones)
    .filter(([id, item]) => item.categories.length > 0 && !LIGHTCONE_EFFECTS[id] && !reviewed.has(id))
    .map(([id]) => id);
  assert.deepEqual(missedCones, []);
  const reviewedRelics = new Set(["318:2"]);
  const missedRelics: string[] = [];
  for (const [id, set] of Object.entries(axis.relicSets)) {
    for (const [pieces, effect] of Object.entries(set.pieces)) {
      const key = `${id}:${pieces}`;
      if (effect.categories.length > 0 && !RELIC_EFFECTS[key] && !reviewedRelics.has(key)) missedRelics.push(key);
    }
  }
  assert.deepEqual(missedRelics, []);
});

// 1.2：成员带上「实际装配」的真实属性（measured）时，看属性的条件按真实值判断。
test("当一颗星照亮夜空：每次助战技（队友用的也算）装备者 +6", () => {
  // 4.6.54 版本资料：「当装备者施放助战技时，恢复6点能量」；攻略实测 BV1cBMe69Ejk：队友用助战技也算姬子•启行施放。
  // 姬子•启行 1 速不行动，瓦尔特（开拓同行）98.04 回合开始用 1 次助战技：+18，带专武再 +6。
  const himeko = (withCone: boolean) => {
    const engine = battle({ team: [zero("1510", { baseSpd: 1, ...(withCone ? cone("23060") : {}) }), zero("1004", { rotation: "basic" })], maxAV: 100 });
    engine.run();
    return engine.units[0].energy;
  };
  near(himeko(false), 18);
  near(himeko(true), 18 + 6);
});

test("翁瓦克 + 实际装配：速度 119.9 不触发并写明，120 触发", () => {
  const slow = opening(zero(PRIEST, { ...set2("308"), baseSpd: 119.9, measured: { elation: 0 } }));
  near(slow.units[0].remDist, 10000);
  assert.ok(slow.timeline.some((row) => row.details.some((d) => d.includes("< 120，不触发"))));
  near(opening(zero(PRIEST, { ...set2("308"), baseSpd: 120, measured: { elation: 0 } })).units[0].remDist, 6000);
});

test("神的瞬息欢愉 + 实际装配：欢愉度 39.9% 不拉条，40% 拉条", () => {
  near(opening(zero(PRIEST, { ...set2("329"), baseSpd: 100, measured: { elation: 0.399 } })).units[0].remDist, 10000);
  near(opening(zero(PRIEST, { ...set2("329"), baseSpd: 100, measured: { elation: 0.4 } })).units[0].remDist, 6000);
});
