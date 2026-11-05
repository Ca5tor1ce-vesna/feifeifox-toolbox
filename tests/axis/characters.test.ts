/**
 * 全角色模块的独立预期。数字来自 4.6 版本文案并手算，不来自引擎。
 * 为了算得清楚，这里把行迹速度清零（traceSpd: 0），速度就是基础速度。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { createBattle, type BattleInput, type GameData } from "../../axis-engine/src/battle.ts";
import { KIT_IDS } from "../../axis-engine/src/characters/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const dataDir = join(HERE, "..", "..", "modules", "honkai-star-rail", "data");
const json = (name: string) => JSON.parse(readFileSync(join(dataDir, name), "utf-8"));
const data: GameData = { axis: json("axis_data.json"), characters: json("characters.json") };

const run = (input: BattleInput) => createBattle(input, data).run();
const near = (actual: number, expected: number, message = "") =>
  assert.ok(Math.abs(actual - expected) < 1e-7, `${message} 期望 ${expected}，实际 ${actual}`);
const actions = (result: ReturnType<typeof run>, slot = 0) =>
  result.timeline.filter((row) => row.slot === slot && !row.extra && ["basic", "skill", "enhanced_basic"].includes(row.type)).map((row) => row.av);
const flat = (id: string, extra: Record<string, unknown> = {}) => ({ id, traceSpd: 0, ...extra });

// ---- 入口 ---- //

test("只给角色 id 就能算，速度和能量来自资料", () => {
  const { units, timeline } = run({ team: [{ id: "1218" }] });
  assert.equal(units[0].name, "椒丘");
  assert.ok(units[0].speed >= 98);
  assert.ok(timeline.length > 1);
});

test("没有欢愉角色的队伍不跑【阿哈时刻】", () => {
  const { timeline } = run({ team: [{ id: "1101" }, { id: "1306" }] });
  assert.ok(!timeline.some((row) => row.type === "aha" || row.type === "aha_extra"));
});

test("有欢愉角色的队伍照常有【阿哈时刻】", () => {
  const { timeline } = run({ team: [{ id: "1503" }] });
  assert.ok(timeline.some((row) => row.type === "aha"));
});

test("模式决定轮次结构", () => {
  const moc = createBattle({ team: [{ id: "1218" }], maxAV: 300 }, data);
  const arb = createBattle({ team: [{ id: "1218" }], maxAV: 300, cycle: { firstCycleAV: 300, cycleAV: 100 } }, data);
  assert.equal(moc.cycleOf(300), 2);
  assert.equal(arb.cycleOf(300), 0);
});

test("不认识的角色给出可读错误", () => {
  assert.throws(() => run({ team: [{ id: "9999" }] }), /没有找到角色 9999/);
});

test("星神★阿哈进了正式服，结果不再提示资料来自测试版", () => {
  const { warnings } = run({ team: [{ id: "1511" }] });
  assert.ok(!warnings.some((text) => text.includes("测试版")), warnings.join("\n"));
});

test("星神★阿哈专武：没选光锥按叠 1 算，选了按叠影算基础速度和笑点", () => {
  // 4.6.54 版本资料：基础速度 +12/14/16/18/20，战技给笑点 10/12/14/16/18。
  const speed = (extra: Record<string, unknown>) => run({ team: [flat("1511", extra)], maxAV: 1 }).units[0].speed;
  near(speed({}), 94 + 12);
  near(speed({ lightcone: { id: "23065", superimpose: 5 } }), 94 + 20);
  near(speed({ lightcone: { id: "23065", superimpose: 1 } }), 94 + 12);
  const punchlines = (lightcone?: { id: string; superimpose: number }) =>
    run({ team: [flat("1511", { lightcone })], maxAV: 200 }).timeline.find((row) => row.type === "skill")!.details.find((text) => text.startsWith("专武"));
  assert.equal(punchlines(), "专武：笑点 +10");
  assert.equal(punchlines({ id: "23065", superimpose: 5 }), "专武：笑点 +18");
  // 别人穿：只算基础速度，笑点不算，并说明。
  const other = run({ team: [flat("1513", { lightcone: { id: "23065", superimpose: 1 } })], maxAV: 1 });
  near(other.units[0].speed, 107 + 12);
  assert.ok(other.timeline.some((row) => row.details.some((text) => text.includes("只给星神★阿哈算"))));
});

test("依赖敌方或概率的机制，结果里逐条列出", () => {
  const { unsupported, warnings } = run({ team: [{ id: "1107" }] });
  assert.ok(unsupported.some((item) => item.unit === "克拉拉" && item.mechanic.includes("反击")));
  assert.ok(warnings.some((text) => text.includes("未计入") && text.includes("克拉拉")));
});

test("已收录的每名角色都能单独算出轴", () => {
  for (const id of KIT_IDS) {
    const result = run({ team: [{ id }] });
    assert.ok(result.timeline.length > 1, id);
    assert.ok(result.units[0].speed > 0, id);
  }
});

test("没有规则的角色：第一动正好在 10000/速度，开局能量是上限的一半", () => {
  // 这些角色的行动轴机制要么没有，要么全部依赖敌方或概率。
  for (const [id, speed, max] of [
    ["1001", 101, 120], ["1104", 92, 100], ["1003", 96, 120], ["1013", 100, 110], ["1105", 98, 90],
    ["1110", 100, 100], ["1203", 101, 100], ["1211", 98, 100], ["1002", 110, 100], ["1305", 103, 140],
    ["1005", 100, 120], ["1006", 107, 110], ["1106", 105, 110], ["1111", 103, 130], ["1307", 102, 120],
    ["1406", 106, 130], ["1410", 102, 110], ["1008", 102, 110], ["1107", 90, 110], ["1214", 103, 120], ["1312", 96, 100],
  ] as const) {
    const battle = createBattle({ team: [flat(id)], maxAV: 1 }, data);
    battle.run();
    near(battle.units[0].energy, max * 0.5, `${id} 开局能量`);
    near(battle.units[0].speed(), speed, `${id} 速度`);
    near(actions(run({ team: [flat(id)], maxAV: 10000 / speed + 0.01 }))[0], 10000 / speed, `${id} 第一动`);
  }
});

test("依赖敌方的机制写清楚了，不是空着", () => {
  for (const [id, keyword] of [["1001", "反击"], ["1104", "不屈之身"], ["1003", "乘胜追击"], ["1102", "额外回合"], ["1305", "反击"], ["1214", "追击"]] as const) {
    const { unsupported } = run({ team: [{ id }] });
    assert.ok(unsupported.some((item) => item.mechanic.includes(keyword)), `${id} 应提到 ${keyword}`);
  }
});

// ---- 开局拉条和回能 ---- //

test("翡翠行迹：战斗开始行动提前 50%", () => {
  // 基础速度 103：(10000 - 5000) / 103
  near(actions(run({ team: [flat("1314")], maxAV: 100 }))[0], 5000 / 103);
});

test("桂乃芬行迹：战斗开始行动提前 25%", () => {
  near(actions(run({ team: [flat("1210")], maxAV: 100 }))[0], 7500 / 106);
});

test("貊泽行迹：波次开始行动提前 30%，E1 进战恢复 20 能量", () => {
  near(actions(run({ team: [flat("1223")], maxAV: 100 }))[0], 7000 / 111);
  // 上限 120，开局 60。E0 第一动前能量 60；E1 进战 +20 = 80。
  const opening = (eidolon: number) => createBattle({ team: [flat("1223", { eidolon })], maxAV: 1 }, data);
  const e0 = opening(0); e0.run();
  const e1 = opening(1); e1.run();
  near(e0.units[0].energy, 60);
  near(e1.units[0].energy, 80);
});

test("椒丘、希露瓦、开拓者•毁灭行迹：战斗开始恢复 15 能量", () => {
  for (const [id, max] of [["1218", 100], ["1103", 100], ["8001", 120]] as const) {
    const battle = createBattle({ team: [flat(id)], maxAV: 1 }, data);
    battle.run();
    near(battle.units[0].energy, max * 0.5 + 15, id);
  }
});

test("缇宝行迹：战斗开始恢复 30 能量", () => {
  const battle = createBattle({ team: [flat("1403")], maxAV: 1 }, data);
  battle.run();
  near(battle.units[0].energy, 60 + 30);
});

test("回能吃能量恢复效率，固定回能不吃", () => {
  // 椒丘 ERR 20%：15 × 1.2 = 18
  const battle = createBattle({ team: [flat("1218", { err: 20 })], maxAV: 1 }, data);
  battle.run();
  near(battle.units[0].energy, 50 + 18);
});

// ---- 自身拉条 ---- //

test("布洛妮娅天赋：普攻后下一次行动提前 37.5%", () => {
  // 速度 99，rotation basic：第 1、2 动间隔 6250 / 99
  const avs = actions(run({ team: [flat("1101", { rotation: "basic", initialEnergy: 0 })], maxAV: 300 }));
  near(avs[0], 10000 / 99);
  near(avs[1] - avs[0], 6250 / 99);
});

test("希儿行迹：普攻后下一次行动提前 20%", () => {
  const avs = actions(run({ team: [flat("1102", { rotation: "basic", initialEnergy: 0 })], maxAV: 200 }));
  near(avs[1] - avs[0], 8000 / 115);
});

test("希儿战技：速度提高 25%，持续 2 回合", () => {
  // 第 1 动战技后速度 115 × 1.25 = 143.75，下一动间隔 10000 / 143.75
  const avs = actions(run({ team: [flat("1102", { initialEnergy: 0 })], maxAV: 200 }));
  near(avs[1] - avs[0], 10000 / 143.75);
});

test("加拉赫行迹：开大后自身行动提前 100%，E1 进战 +20 能量", () => {
  // 上限 110，开局 55，无 E1。给满能：开局插大（不在回合内），距离清零，0 AV 就行动。
  const avs = actions(run({ team: [flat("1301", { initialEnergy: 110 })], maxAV: 50 }));
  near(avs[0], 0);
  const battle = createBattle({ team: [flat("1301", { eidolon: 1 })], maxAV: 1 }, data);
  battle.run();
  near(battle.units[0].energy, 55 + 20);
});

test("虎克行迹：开大后行动提前 20% 并额外恢复 5 能量", () => {
  const battle = createBattle({ team: [flat("1109", { initialEnergy: 120 })], maxAV: 1 }, data);
  battle.run();
  // 开局插大：120 → 0，+5 行迹，+5 返还，共 10。距离 10000 - 2000。
  near(battle.units[0].energy, 10);
  near(battle.units[0].remDist, 8000);
});

test("素裳终结技：使自身立即行动", () => {
  const avs = actions(run({ team: [flat("1206", { initialEnergy: 120 })], maxAV: 10 }));
  near(avs[0], 0);
});

// ---- 拉队友 ---- //

test("布洛妮娅战技：目标立即行动，对自己无效", () => {
  // 布洛妮娅速度 99 先于希儿？希儿 115 先动，所以把希儿放慢：基础 50。
  const avs = run({ team: [flat("1101", { targetSlot: 1 }), flat("1102", { baseSpd: 50 })], maxAV: 110 });
  const first = actions(avs, 0)[0];
  near(first, 10000 / 99);
  near(actions(avs, 1)[0], first); // 同一时刻紧接着行动
  const solo = run({ team: [flat("1101")], maxAV: 110 });
  near(actions(solo, 0)[0], 10000 / 99);
  assert.equal(actions(solo, 0).length, 1); // 对自己不触发立即行动
});

test("布洛妮娅 E2：战技目标立即行动后速度提高 30%，持续 1 回合", () => {
  // 布洛妮娅 60 速在 166.67 战技拉桑博（90 速）；桑博先在 111.11 自然行动一次，再在 166.67 立即行动。
  // E2：这一动之后按 117 速跑下一整段，166.67 + 10000/117；E0 是 166.67 + 10000/90。
  const team = (eidolon: number) => [
    flat("1101", { eidolon, baseSpd: 60, targetSlot: 1, rotation: "skill", initialEnergy: 0 }),
    flat("1108", { baseSpd: 90, initialEnergy: 0 }),
  ];
  const pull = 10000 / 60;
  const e0 = actions(run({ team: team(0), maxAV: 300 }), 1);
  const e2 = actions(run({ team: team(2), maxAV: 300 }), 1);
  near(e0[1], pull);
  near(e2[1], pull);
  near(e0[2], pull + 10000 / 90, "E0");
  near(e2[2], pull + 10000 / 117, "E2");
});

test("停云 E1：【赐福】目标施放终结技后速度提高 20%，持续 1 回合", () => {
  // 停云 112 速在 89.29 战技给桑博【赐福】。桑博 100 速、能量 90，在 100 战技 +30 满能开大。
  // E1：下一动按 120 速，100 + 10000/120；E0 是 200。再下一动增益已过期，回到 100 速。
  const team = (eidolon: number) => [
    flat("1202", { eidolon, targetSlot: 1, initialEnergy: 0 }),
    flat("1108", { baseSpd: 100, initialEnergy: 90 }),
  ];
  const e0 = actions(run({ team: team(0), maxAV: 320, useTechnique: false }), 1);
  const e1 = actions(run({ team: team(1), maxAV: 320, useTechnique: false }), 1);
  near(e0[1], 200, "E0");
  near(e1[1], 100 + 10000 / 120, "E1");
  near(e1[2], 100 + 10000 / 120 + 100, "增益只持续 1 回合");
  // 没拿到【赐福】的人开大不提速：【赐福】给了 3 号位的娜塔莎（速度 1，窗口内不行动）。
  const other = actions(run({
    team: [flat("1202", { eidolon: 1, targetSlot: 2, initialEnergy: 0 }), flat("1108", { baseSpd: 100, initialEnergy: 90 }), flat("1105", { baseSpd: 1 })],
    maxAV: 220, useTechnique: false,
  }), 1);
  near(other[1], 200, "没有【赐福】");
});

test("银狼LV.999 E2：本次【无敌玩家】隐藏分每 120 点给 1 个额外回合并补 1 次强化普攻", () => {
  // 专武、开局 60 隐藏分，0 AV 开大。本次累计：进入时 60 + 隐藏关卡 20 + 专武 20 + 两次强化普攻 10 = 110；
  // 【阿哈时刻】欢愉技 +15 → 125，过了 120：阿哈时刻结算完紧跟 1 个额外回合，打掉补上的那次强化普攻。
  // 所以 E0 打 3 次强化普攻就退出【无敌玩家】，E2 打 4 次。下一个 240 在窗口里达不到。
  const team = (eidolon: number) => [flat("1506", { eidolon, initialEnergy: 60, equipment: { hasWolfLc: true } })];
  const e0 = run({ team: team(0), maxAV: 200, useTechnique: false });
  const e2 = run({ team: team(2), maxAV: 200, useTechnique: false });
  const extra = (result: ReturnType<typeof run>) => result.timeline.filter((row) => row.type === "extra_turn" && row.label.startsWith("E2"));
  const enhanced = (result: ReturnType<typeof run>) => result.timeline.filter((row) => row.type === "enhanced_basic").length;
  assert.equal(extra(e0).length, 0);
  assert.equal(extra(e2).length, 1);
  near(extra(e2)[0].av, e2.timeline.find((row) => row.type === "aha")!.av, "阿哈时刻之后");
  assert.equal(enhanced(e0), 3);
  assert.equal(enhanced(e2), 4);
  assert.ok(e2.unsupported.some((item) => item.mechanic.includes("增益延长")), "增益延长 1 回合列为未计入");
});

// ---- 需要敌方条件的星魂：试装遗器之前按满足算 ---- //

test("丹恒 E4：开大消灭敌方立即行动，条件按满足算", () => {
  // 开局满能 0 AV 开大：E4 立即行动，第一动在 0；E0 在 10000/110。
  const run4 = (eidolon: number) => actions(run({ team: [flat("1002", { eidolon, initialEnergy: 100 })], maxAV: 100, useTechnique: false }));
  near(run4(0)[0], 10000 / 110);
  near(run4(4)[0], 0);
});

test("寒鸦 E1：持有终结技效果的队友攻击（按消灭算）时寒鸦提前 15%，每回合 1 次", () => {
  // 寒鸦 60 速开局满能开大，桑博得到 60 × 22.5% = 13.5 点速度，在 t1 = 10000/115.5 行动。
  // 那一下按消灭算：寒鸦剩 10000 − 60·t1，再扣 1500，之后按 60 速跑完。E0 照常 10000/60。
  const team = (eidolon: number) => [flat("1215", { eidolon, baseSpd: 60, initialEnergy: 140, targetSlot: 1 }), flat("1108", { initialEnergy: 0 })];
  const t1 = 10000 / (102 + 60 * 0.225);
  near(actions(run({ team: team(0), maxAV: 200, useTechnique: false }), 0)[0], 10000 / 60, "E0");
  near(actions(run({ team: team(1), maxAV: 200, useTechnique: false }), 0)[0], t1 + (10000 - 60 * t1 - 1500) / 60, "E1");
});

test("流萤 E2：完全燃烧里强化攻击按消灭或击破算，每隔一动多 1 个额外回合", () => {
  // 开局补到 120，t 时战技满能开大进入完全燃烧（179 速），当场再动。
  // E2：这一动后额外回合（冷却中不再触发），下一动 t + 10000/179 又触发。E0 只有两动。
  const t = 10000 / 104;
  const enhanced = (eidolon: number) => run({ team: [flat("1310", { eidolon, initialEnergy: 0 })], maxAV: t + 10000 / 179 + 0.01, useTechnique: false })
    .timeline.filter((row) => row.label.includes("死星过载") || row.label.includes("底火斩击")).map((row) => [row.av, row.extra]);
  assert.equal(enhanced(0).length, 2);
  const e2 = enhanced(2);
  assert.equal(e2.length, 4);
  assert.deepEqual(e2.map(([, extra]) => extra), [false, true, false, true]);
  near(e2[2][0] as number, t + 10000 / 179);
});

test("知更鸟行迹【华彩花腔】：战斗开始自身行动提前 25%", () => {
  const result = run({ team: [flat("1309", { baseSpd: 100, initialEnergy: 0 })], maxAV: 100, useTechnique: false });
  near(actions(result)[0], 7500 / 100);
});

test("知更鸟 E2：【协奏】期间我方全体速度提高 16%", () => {
  // 知更鸟满能开局开大，桑博（100 速）被拉 100% 在 0 行动；【协奏】倒计时 90 速，到 111.11 才结束。
  // 桑博的下一动在【协奏】里：E2 按 116 速 10000/116，E0 是 100。
  const team = (eidolon: number) => [flat("1309", { eidolon, baseSpd: 100, initialEnergy: 160 }), flat("1108", { baseSpd: 100, initialEnergy: 0 })];
  const e0 = actions(run({ team: team(0), maxAV: 105, useTechnique: false }), 1);
  const e2 = actions(run({ team: team(2), maxAV: 105, useTechnique: false }), 1);
  near(e0[0], 0);
  near(e2[0], 0);
  near(e0[1], 100, "E0");
  near(e2[1], 10000 / 116, "E2");
});

test("花火战技：目标行动提前 50%，对自己无效", () => {
  // 花火速度 101 在 99.01 行动。目标速度 30：已跑 at × 30，剩 10000 - at × 30，再扣 5000。
  const result = run({ team: [flat("1306", { targetSlot: 1 }), flat("1218", { baseSpd: 30 })], maxAV: 200 });
  const at = actions(result, 0)[0];
  near(at, 10000 / 101);
  near(actions(result, 1)[0], at + (10000 - at * 30 - 5000) / 30);
  // 目标跑得够快时，拉条后距离封底为 0，紧接着行动。
  const fast = run({ team: [flat("1306", { targetSlot: 1 }), flat("1218", { baseSpd: 60 })], maxAV: 110 });
  near(actions(fast, 1)[0], at);
  // 只有自己时不触发：下一动照常是一整段距离。
  const solo = actions(run({ team: [flat("1306", { initialEnergy: 0 })], maxAV: 200 }));
  near(solo[1] - solo[0], 10000 / 101);
});

test("忘归人 E2：开大后我方全体行动提前 24%", () => {
  const result = run({ team: [flat("1225", { eidolon: 2, initialEnergy: 130 }), flat("1218")], maxAV: 100 });
  near(actions(result, 1)[0], 7600 / 98);
});

// ---- 速度增益 ---- //

test("艾丝妲终结技：我方全体速度提高 57 点，持续 2 回合", () => {
  const battle = createBattle({ team: [flat("1009", { initialEnergy: 120 }), flat("1218")], maxAV: 1 }, data);
  battle.run();
  near(battle.units[0].speed(), 106 + 57);
  near(battle.units[1].speed(), 98 + 57);
});

test("阮•梅天赋：使除自身以外的队友速度提高 11%", () => {
  const battle = createBattle({ team: [flat("1303"), flat("1218")], maxAV: 1 }, data);
  battle.run();
  near(battle.units[0].speed(), 104);
  near(battle.units[1].speed(), 98 * 1.11);
});

test("驭空 E1：进入战斗时我方全体速度提高 10%", () => {
  const battle = createBattle({ team: [flat("1207", { eidolon: 1 }), flat("1218")], maxAV: 1 }, data);
  battle.run();
  near(battle.units[1].speed(), 98 * 1.1);
  const e0 = createBattle({ team: [flat("1207"), flat("1218")], maxAV: 1 }, data);
  e0.run();
  near(e0.units[1].speed(), 98);
});

test("寒鸦终结技：目标速度提高寒鸦速度的 22.5%", () => {
  const battle = createBattle({ team: [flat("1215", { initialEnergy: 140, targetSlot: 1 }), flat("1218")], maxAV: 1 }, data);
  battle.run();
  near(battle.units[1].speed(), 98 + 110 * 0.225);
});

test("翡翠战技：指定队友速度提高 30 点，自己成为收债人时不提速", () => {
  const battle = createBattle({ team: [flat("1314", { targetSlot: 1, baseSpd: 200 }), flat("1218")], maxAV: 30 }, data);
  battle.run();
  near(battle.units[1].speed(), 128);
  const solo = createBattle({ team: [flat("1314", { baseSpd: 200 })], maxAV: 30 }, data);
  solo.run();
  near(solo.units[0].speed(), 200);
});

test("刻律德菈：施放战技时自身和【军功】队友速度提高 20 点", () => {
  // 速度 300 的第一动在 33.33 AV。
  const battle = createBattle({ team: [flat("1412", { targetSlot: 1, baseSpd: 300 }), flat("1218")], maxAV: 40 }, data);
  battle.run();
  near(battle.units[0].speed(), 320);
  near(battle.units[1].speed(), 118);
});

// ---- 回能 ---- //

test("停云：回合开始 +5，终结技给目标 50 能量，E6 再加 10", () => {
  // 目标用桑博：他开局没有回能效果。
  const e0 = createBattle({ team: [flat("1202", { initialEnergy: 130, targetSlot: 1 }), flat("1108", { initialEnergy: 0 })], maxAV: 1, useTechnique: false }, data);
  e0.run();
  near(e0.units[1].energy, 50);
  const e6 = createBattle({ team: [flat("1202", { eidolon: 6, initialEnergy: 130, targetSlot: 1 }), flat("1108", { initialEnergy: 0 })], maxAV: 1, useTechnique: false }, data);
  e6.run();
  near(e6.units[1].energy, 60);
  // 回合开始 +5：能量 0、战技回能 30，第一动结束是 5 + 30。
  const turn = createBattle({ team: [flat("1202", { initialEnergy: 0 })], maxAV: 10000 / 112 + 1, useTechnique: false }, data);
  turn.run();
  near(turn.units[0].energy, 35);
});

test("停云秘技：使用后为自身恢复 50 能量", () => {
  const on = createBattle({ team: [flat("1202", { initialEnergy: 0 })], maxAV: 1 }, data);
  on.run();
  near(on.units[0].energy, 50);
  const off = createBattle({ team: [flat("1202", { initialEnergy: 0 })], maxAV: 1, useTechnique: false }, data);
  off.run();
  near(off.units[0].energy, 0);
});

test("瓦尔特、桑博行迹：施放终结技时额外恢复 10 能量", () => {
  for (const [id, max] of [["1004", 120], ["1108", 120]] as const) {
    const battle = createBattle({ team: [flat(id, { initialEnergy: max })], maxAV: 1 }, data);
    battle.run();
    near(battle.units[0].energy, 10 + 5, id);
  }
});

test("花火、那刻夏行迹：施放普攻时额外恢复 10 能量", () => {
  for (const [id, speed] of [["1306", 101], ["1405", 97]] as const) {
    const battle = createBattle({ team: [flat(id, { rotation: "basic", initialEnergy: 0 })], maxAV: 10000 / speed + 1 }, data);
    battle.run();
    near(battle.units[0].energy, 20 + 10, id);
  }
});

test("回能默认值来自资料：战技 30、普攻 20、弹射按总量", () => {
  // 瓦尔特战技是 3 段 × 10 = 30，不是 10。
  const battle = createBattle({ team: [flat("1004", { initialEnergy: 0 })], maxAV: 10000 / 102 + 1 }, data);
  battle.run();
  near(battle.units[0].energy, 30);
});
