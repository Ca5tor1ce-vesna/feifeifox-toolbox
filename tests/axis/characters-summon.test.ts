/**
 * 第三批：变身、忆灵、召唤物。数字来自 4.6 版本文案并手算。
 * 行迹速度清零，能量默认从 0 开始，这样每一步都能算清楚。
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

const battle = (input: BattleInput) => createBattle({ useTechnique: false, ...input }, data);
const near = (actual: number, expected: number, message = "") =>
  assert.ok(Math.abs(actual - expected) < 1e-7, `${message} 期望 ${expected}，实际 ${actual}`);
const zero = (id: string, extra: Record<string, unknown> = {}) => ({ id, traceSpd: 0, initialEnergy: 0, ...extra });
const named = (engine: ReturnType<typeof battle>, name: string) => engine.timeline.filter((row) => row.name === name);
const labelled = (engine: ReturnType<typeof battle>, label: string) => engine.timeline.filter((row) => row.label.includes(label));
const kit = <T>(engine: ReturnType<typeof battle>, id: string) => engine.findUnit(id)!.kit as unknown as T;

test("93 名已实装角色全部有模块", () => {
  const local = data.characters.map((item) => String(item.id));
  assert.deepEqual(local.filter((id) => !KIT_IDS.includes(id)), []);
});

test("手动指定开大：第几动之后放，不看能量", () => {
  const engine = battle({ team: [zero("1218", { manualUltimates: [2] })], maxAV: 3 * (10000 / 98) + 1 });
  engine.run();
  const order = engine.timeline.filter((row) => ["skill", "ultimate"].includes(row.type)).map((row) => row.type);
  assert.deepEqual(order, ["skill", "skill", "ultimate", "skill"]);
});

test("终结技攻击事件：攻击型的发，辅助型的不发", () => {
  // 结界里 9 点充能追加战技。先开大进结界，再看队友开大算不算一次攻击。
  const attacks = (ally: string) => {
    const engine = battle({ team: [zero("1507", { initialEnergy: 160, baseSpd: 1 }), zero(ally, { baseSpd: 1, initialEnergy: 1000 })], maxAV: 1 });
    engine.run();
    return kit<{ charge: number }>(engine, "1507").charge;
  };
  assert.equal(attacks("1218"), 1); // 椒丘：对敌方全体造成伤害
  assert.equal(attacks("1009"), 0); // 艾丝妲：全队加速
});

test("景元：神君 60 速 3 段，战斗开始 +15，E4 每段回能 2", () => {
  const engine = battle({ team: [zero("1204", { baseSpd: 1, eidolon: 4 })], maxAV: 10000 / 60 + 1 });
  engine.run();
  near(named(engine, "【神君】")[0].av, 10000 / 60);
  near(engine.units[0].energy, 15 + 3 * 2);
});

test("景元：战技加 2 段，神君速度 +20，已跑进度保留", () => {
  const t = 10000 / 99;
  const engine = battle({ team: [zero("1204")], maxAV: 200 });
  engine.run();
  near(named(engine, "【神君】")[0].av, t + (10000 - 60 * t) / 80);
});

test("景元：神君行动后恢复 3 段 60 速；秘技让第 1 回合多 3 段", () => {
  const slow = battle({ team: [zero("1204", { baseSpd: 1 })], maxAV: 2 * (10000 / 60) + 1 });
  slow.run();
  near(named(slow, "【神君】")[1].av, 2 * (10000 / 60));
  const opened = battle({ team: [zero("1204", { baseSpd: 1 })], maxAV: 278, useTechnique: true });
  opened.run();
  near(named(opened, "【神君】")[0].av, 10000 / 90);
  near(named(opened, "【神君】")[1].av, 10000 / 90 + 10000 / 60);
});

test("托帕：账账 80 速；战技让账账攻击，算追加攻击，再拉 50%", () => {
  const slow = battle({ team: [zero("1112", { baseSpd: 1 })], maxAV: 126 });
  slow.run();
  near(named(slow, "账账")[0].av, 125);
  // 托帕 110 速：t = 90.91，账账已跑 7272.7。战技时账账攻击，距离被拉到 0，当场再行动。
  const t = 10000 / 110;
  const fast = battle({ team: [zero("1112")], maxAV: t + 1 });
  fast.run();
  const rows = named(fast, "账账");
  assert.equal(rows.length, 2);
  near(rows[1].av, t);
});

test("托帕：账账自己回合内的追加攻击不拉自己", () => {
  const engine = battle({ team: [zero("1112", { baseSpd: 1 })], maxAV: 251 });
  engine.run();
  assert.deepEqual(named(engine, "账账").map((row) => Math.round(row.av)), [125, 250]);
});

test("托帕：开大后账账两次攻击内额外回能 10，第三次没有", () => {
  // 开大 0 + 返还 5，账账 125、250、375 AV 三次攻击。
  const energy = (maxAV: number) => {
    const engine = battle({ team: [zero("1112", { baseSpd: 1, initialEnergy: 130 })], maxAV });
    engine.run();
    return engine.units[0].energy;
  };
  near(energy(126), 15);
  near(energy(251), 25);
  near(energy(376), 25);
});

test("丹恒•腾荒：开局提前 40%；战技召唤 165 速龙灵；同袍攻击回能 6 并拉龙灵 15%", () => {
  const t = 6000 / 97;
  const engine = battle({ team: [zero("1414", { targetSlot: 1 }), zero("1218", { baseSpd: 1 })], maxAV: t + 1 });
  engine.run();
  near(engine.timeline.find((row) => row.type === "skill" && row.slot === 0)!.av, t);
  const dragon = engine.summons.find((actor) => actor.name === "【龙灵】")!;
  near(dragon.remDist, 10000);
  const before = engine.units[0].energy;
  engine.attack(engine.units[1], "basic");
  near(engine.units[0].energy, before + 6);
  near(dragon.remDist, 8500);
});

test("丹恒•腾荒：有同袍后默认打普攻；秘技相当于先放过一次战技", () => {
  const t = 6000 / 97;
  const plain = battle({ team: [zero("1414"), zero("1218", { baseSpd: 1 })], maxAV: t + 10000 / 97 + 0.01 });
  plain.run();
  assert.deepEqual(plain.timeline.filter((row) => row.slot === 0 && ["basic", "skill"].includes(row.type)).map((row) => row.type), ["skill", "basic"]);
  const opened = battle({ team: [zero("1414"), zero("1218", { baseSpd: 1 })], maxAV: t + 0.01, useTechnique: true });
  opened.run();
  assert.equal(opened.timeline.find((row) => row.slot === 0 && ["basic", "skill"].includes(row.type))!.type, "basic");
});

test("千冶•刃：开局能量补到 75%，开大后 70 速倒计时结束结界", () => {
  const engine = battle({ team: [zero("1507", { initialEnergy: 160, baseSpd: 1 })], maxAV: 10000 / 70 + 1 });
  engine.run();
  assert.equal(engine.units[0].ultimates, 1);
  near(labelled(engine, "结界解除")[0].av, 10000 / 70);
  // 开大 160 → 0，返还 5；结界解除时不足 75% 补到 120。
  near(engine.units[0].energy, 120);
});

test("千冶•刃：未开大时只能普攻，结界里才能放战技", () => {
  const t = 10000 / 108;
  const engine = battle({ team: [zero("1507")], maxAV: t + 1 });
  engine.run();
  assert.equal(engine.timeline.find((row) => row.slot === 0 && ["basic", "skill"].includes(row.type))!.type, "basic");
  near(engine.units[0].energy, 120 + 20);
});

test("千冶•刃：结界内每次攻击 +1 充能，9 点恢复 30 并追加战技；结界外不计", () => {
  const engine = battle({ team: [zero("1507", { initialEnergy: 160, baseSpd: 1 }), zero("1218", { baseSpd: 1 })], maxAV: 1 });
  engine.run();
  const unit = engine.units[0];
  for (let i = 0; i < 8; i += 1) engine.attack(engine.units[1], "basic");
  assert.equal(unit.followUps, 0);
  engine.attack(engine.units[1], "basic");
  assert.equal(unit.followUps, 1);
  // 开大后 5，+30 恢复，+30 追加战技基础回能。
  near(unit.energy, 5 + 30 + 30);
  const outside = battle({ team: [zero("1507", { baseSpd: 1 }), zero("1218", { baseSpd: 1 })], maxAV: 1 });
  outside.run();
  for (let i = 0; i < 20; i += 1) outside.attack(outside.units[1], "basic");
  assert.equal(outside.units[0].followUps, 0);
});

test("千冶•刃：E2 只要 7 点；E1 追加战技后倒计时延后 15%", () => {
  const engine = battle({ team: [zero("1507", { initialEnergy: 160, baseSpd: 1, eidolon: 2 }), zero("1218", { baseSpd: 1 })], maxAV: 1 });
  engine.run();
  const countdown = engine.summons.find((actor) => actor.role === "countdown")!;
  const before = countdown.remDist;
  for (let i = 0; i < 7; i += 1) engine.attack(engine.units[1], "basic");
  assert.equal(engine.units[0].followUps, 1);
  near(countdown.remDist, before + 1500);
});

test("千冶•刃：溢出能量最多 80，开大后恢复", () => {
  const engine = battle({ team: [zero("1507", { baseSpd: 1 })], maxAV: 1 });
  engine.run();
  const unit = engine.units[0];
  unit.castingUltimate = true; // 先攒满，不让它开大
  engine.gainEnergy(unit, 500, { fixed: true });
  unit.castingUltimate = false;
  near(unit.energy, 240);
  engine.maybeUltimate(unit);
  // 溢出 80 先留出来，扣 160，恢复 80，返还 5。
  near(unit.energy, 85);
});

test("万敌：战技损失当前生命的一半积攒充能，100 点进入血仇并提前 100%", () => {
  // 开局 80 能量，每动 +30，第 3 动 170 满能开大（在第 3 动的攻击之前）。
  // 前两动生命 100 → 50 → 25，充能 75。开大 +20 = 95，生命 47.5；第 3 动再损失 23.75，充能 118.75，进入【血仇】。
  const t = 10000 / 95;
  const engine = battle({ team: [{ id: "1404", traceSpd: 0 }], maxAV: 3 * t + 0.01 });
  engine.run();
  near(labelled(engine, "进入【血仇】")[0].av, 3 * t);
  const auto = labelled(engine, "弑王成王");
  assert.equal(auto.length, 1);
  near(auto[0].av, 3 * t);
});

test("万敌：两次战技生命 100 → 50 → 25，充能 75", () => {
  const engine = battle({ team: [zero("1404")], maxAV: 2 * (10000 / 95) + 0.01 });
  engine.run();
  near(kit<{ charge: number }>(engine, "1404").charge, 75);
});

test("万敌：血仇里充能到 150 立刻额外回合弑神登神，消耗 150", () => {
  const engine = battle({ team: [zero("1404", { baseSpd: 1 })], maxAV: 1 });
  engine.run();
  const state = kit<{ charge: number; addCharge(n: number): void }>(engine, "1404");
  state.addCharge(100); // 进入血仇，充能回到 0
  assert.equal(labelled(engine, "弑神登神").length, 0);
  state.addCharge(149);
  assert.equal(labelled(engine, "弑神登神").length, 0);
  state.addCharge(1);
  assert.equal(labelled(engine, "弑神登神").length, 1);
  near(state.charge, 0);
  assert.equal(engine.units[0].extraTurns, 1);
});

test("万敌 E6：进战直接血仇，当场行动；100 点充能就能弑神登神。秘技 +50 充能", () => {
  const engine = battle({ team: [zero("1404", { eidolon: 6 })], maxAV: 1 });
  engine.run();
  assert.equal(labelled(engine, "进入【血仇】").length, 1);
  near(labelled(engine, "弑王成王")[0].av, 0);
  const state = kit<{ addCharge(n: number): void }>(engine, "1404");
  state.addCharge(100 - 35);
  assert.equal(labelled(engine, "弑神登神").length, 1);
  const opened = battle({ team: [zero("1404", { baseSpd: 1 })], maxAV: 1, useTechnique: true });
  opened.run();
  near(kit<{ charge: number }>(opened, "1404").charge, 50);
});

test("Saber：战技不够回满时 +3 共鸣，够回满时消耗全部并立即行动", () => {
  // 开局补到 60% = 216。第 1 动 246，1 × 8 不够 → 共鸣 1 + 3 = 4。
  const t = 10000 / 101;
  const plain = battle({ team: [zero("1014")], maxAV: t + 1 });
  plain.run();
  near(plain.units[0].energy, 246);
  assert.equal(kit<{ resonance: number }>(plain, "1014").resonance, 4);
  // 7 共鸣：300 + 30 + 56 = 386，够回满。开大：溢出 26 留出来，扣 360，恢复 26，返还 5 = 31。
  // 立即行动的强化普攻 +30 = 61，共鸣 0 + 开大 3 + 强化普攻 2 = 5。
  const full = battle({ team: [zero("1014", { initialEnergy: 300 })], maxAV: t + 1 });
  kit<{ resonance: number }>(full, "1014").resonance = 7;
  full.run();
  near(full.units[0].energy, 61);
  assert.equal(kit<{ resonance: number }>(full, "1014").resonance, 5);
  const rows = full.timeline.filter((row) => row.slot === 0 && ["skill", "enhanced_basic"].includes(row.type));
  assert.deepEqual(rows.map((row) => row.type), ["skill", "enhanced_basic"]);
  near(rows[1].av, t);
});

test("Saber：队友开大 +3 共鸣；开大后下次普攻强化；秘技 +2 共鸣", () => {
  const engine = battle({ team: [zero("1014", { initialEnergy: 360 }), zero("1218", { initialEnergy: 100 })], maxAV: 1 });
  engine.run();
  // 开局 1；椒丘开大 +3；自己开大也算「任意目标」+3。
  assert.equal(kit<{ resonance: number }>(engine, "1014").resonance, 7);
  const rows = battle({ team: [zero("1014", { initialEnergy: 360 })], maxAV: 10000 / 101 + 1 });
  rows.run();
  assert.equal(rows.timeline.find((row) => row.label.includes("解放的金色王权"))!.type, "enhanced_basic");
  const opened = battle({ team: [zero("1014", { baseSpd: 1 })], maxAV: 1, useTechnique: true });
  opened.run();
  assert.equal(kit<{ resonance: number }>(opened, "1014").resonance, 3);
});

test("Saber：溢出能量最多 120", () => {
  const engine = battle({ team: [zero("1014", { baseSpd: 1 })], maxAV: 1 });
  engine.run();
  const unit = engine.units[0];
  unit.castingUltimate = true;
  engine.gainEnergy(unit, 1000, { fixed: true });
  near(unit.energy, 480);
});

test("Saber E6：溢出上限 200；第 1、4、7 次开大固定 +300", () => {
  const engine = battle({ team: [zero("1014", { eidolon: 6, baseSpd: 1 })], maxAV: 1 });
  engine.run();
  const unit = engine.units[0];
  // 第 1 次：填满到 560 再开大。溢出 200 恢复，+300，返还 5：505，又够开第 2 次。
  // 第 2 次：溢出 145 恢复，返还 5：150。
  engine.gainEnergy(unit, 1000, { fixed: true });
  assert.equal(unit.ultimates, 2);
  near(unit.energy, 150);
  // 第 3 次：无 +300。溢出 0，返还 5。第 4 次：+300。
  unit.energy = 360;
  engine.maybeUltimate(unit);
  assert.equal(unit.ultimates, 3);
  near(unit.energy, 5);
  unit.energy = 360;
  engine.maybeUltimate(unit);
  assert.equal(unit.ultimates, 4);
  near(unit.energy, 305);
});

test("吉尔伽美什：队友行动 +1 兴致，每点速度 +10%；默认打普攻", () => {
  const engine = battle({ team: [zero("1509", { baseSpd: 1 }), zero("1218")], maxAV: 10000 / 98 + 1 });
  engine.run();
  near(engine.units[0].speed(), 1.1);
  const self = battle({ team: [zero("1509")], maxAV: 10000 / 97 + 1 });
  self.run();
  assert.equal(self.timeline.find((row) => row.slot === 0 && ["basic", "skill"].includes(row.type))!.type, "basic");
});

test("吉尔伽美什：召唤物行动也 +1 兴致，倒计时不算", () => {
  const summon = battle({ team: [zero("1509", { baseSpd: 1 }), zero("1204", { baseSpd: 1 })], maxAV: 10000 / 60 + 1 });
  summon.run();
  near(summon.units[0].speed(), 1.1); // 神君
  const timer = battle({ team: [zero("1509", { baseSpd: 1 }), zero("1507", { baseSpd: 1, initialEnergy: 160 })], maxAV: 10000 / 70 + 1 });
  timer.run();
  near(timer.units[0].speed(), 1.2); // 只有千冶•刃开大的 +2
});

test("吉尔伽美什：与 Saber 累计 8 次攻击连携，Saber 固定 +120，连携不计入累计", () => {
  const engine = battle({ team: [zero("1509", { baseSpd: 1 }), zero("1014", { baseSpd: 1 })], maxAV: 1 });
  engine.run();
  const saber = engine.units[1];
  saber.energy = 0;
  for (let i = 0; i < 8; i += 1) engine.attack(engine.units[0], "basic");
  near(saber.energy, 120);
  near(engine.units[0].speed(), 1.3); // +3 兴致
  for (let i = 0; i < 7; i += 1) engine.attack(engine.units[1], "basic");
  near(saber.energy, 120);
  engine.attack(engine.units[1], "basic");
  near(saber.energy, 240);
});

test("吉尔伽美什：队友开大时固定恢复其消耗的 30%；特殊资源不算能量", () => {
  const engine = battle({ team: [zero("1509", { baseSpd: 1 }), zero("1218", { initialEnergy: 100 })], maxAV: 1 });
  engine.run();
  near(engine.units[0].energy, 30);
  const resource = battle({ team: [zero("1509", { baseSpd: 1 }), zero("1415", { baseSpd: 1, initialEnergy: 24 })], maxAV: 1 });
  resource.run();
  near(resource.units[0].energy, 0);
  near(resource.units[0].speed(), 1.2);
});

test("吉尔伽美什：兴致首次到 10 后只放战技，放完清零；E1 +40", () => {
  const engine = battle({ team: [zero("1509", { eidolon: 1 })], maxAV: 10000 / 97 + 1 });
  const state = kit<{ addZest(n: number): void }>(engine, "1509");
  state.addZest(10);
  engine.run();
  assert.equal(engine.timeline.find((row) => row.slot === 0 && ["basic", "skill"].includes(row.type))!.type, "skill");
  near(engine.units[0].speed(), 97);
  near(engine.units[0].energy, 30 + 40);
});

test("远坂凛：开局 20 宝石，速度 +20% 持续 3 回合；≥15 强化战技，消耗到不足 3", () => {
  const engine = battle({ team: [zero("1508")], maxAV: 10000 / (102 * 1.2) + 1 });
  engine.run();
  near(engine.timeline.find((row) => row.label.includes("第二魔法实验"))!.av, 10000 / (102 * 1.2));
  assert.equal(kit<{ gems: number }>(engine, "1508").gems, 2);
});

test("远坂凛：宝石不够时放普通战技", () => {
  const engine = battle({ team: [zero("1508")], maxAV: 2 * (10000 / (102 * 1.2)) + 1 });
  engine.run();
  const rows = engine.timeline.filter((row) => row.slot === 0 && row.type === "skill").map((row) => row.label);
  assert.ok(rows[0].includes("第二魔法实验"));
  assert.ok(!rows[1].includes("第二魔法实验"));
});

test("远坂凛 E6：开大 36 宝石并得到额外回合；E1 单次消耗 30 以上得影子宝石", () => {
  const engine = battle({ team: [zero("1508", { eidolon: 6, initialEnergy: 160 })], maxAV: 1 });
  engine.run();
  // 20 + 36 = 56，额外回合强化战技消耗 54，留 2；影子宝石 54。
  assert.equal(engine.units[0].extraTurns, 1);
  assert.equal(kit<{ gems: number }>(engine, "1508").gems, 2);
  assert.equal(kit<{ shadow: number }>(engine, "1508").shadow, 54);
});

test("姬子•启行：回合开始助战技次数满时 +5；秘技相当于开局放一次战技", () => {
  const engine = battle({ team: [zero("1510")], maxAV: 10000 / 98 + 1 });
  engine.run();
  near(engine.units[0].energy, 5 + 30);
  const opened = battle({ team: [zero("1510", { baseSpd: 1 })], maxAV: 1, useTechnique: true });
  opened.run();
  near(opened.units[0].energy, 30);
});

test("流萤：战技固定回 65% 能量上限并提前 25%；满能开大进入完全燃烧", () => {
  // 开局补到 120。第 1 动 +156 封顶 240，当场开大：能量 0 + 5。挂起 25% + 100%，距离 0，当场再动。
  const t = 10000 / 104;
  const engine = battle({ team: [zero("1310")], maxAV: t + 1 });
  engine.run();
  const unit = engine.units[0];
  assert.equal(unit.ultimates, 1);
  near(unit.speed(), 104 + 75);
  const rows = engine.timeline.filter((row) => row.slot === 0 && ["skill", "enhanced_basic"].includes(row.type));
  near(rows[1].av, t);
  assert.ok(rows[1].label.includes("死星过载"));
});

test("流萤：70 速倒计时结束后解除完全燃烧，之后的战技只挂起提前 25%", () => {
  const t = 10000 / 104;
  const engine = battle({ team: [zero("1310")], maxAV: t + 10000 / 70 + 0.01 });
  engine.run();
  near(labelled(engine, "解除完全燃烧")[0].av, t + 10000 / 70);
  const unit = engine.units[0];
  near(unit.speed(), 104);
  unit.energy = 0; // 第一次战技一定回满开大，这里单独看不开大时的提前量。
  engine.takeTurn(unit);
  near(unit.energy, 156);
  near(unit.remDist, 7500);
});

test("流萤：完全燃烧期间不能开大，解除后能量够再开", () => {
  const t = 10000 / 104;
  const engine = battle({ team: [zero("1310")], maxAV: t + 1 });
  engine.run();
  const unit = engine.units[0];
  engine.gainEnergy(unit, 240, { fixed: true });
  assert.equal(unit.ultimates, 1);
  near(unit.energy, 240);
  const countdown = engine.summons.find((actor) => actor.role === "countdown")!;
  countdown.onTurn(countdown);
  assert.equal(unit.ultimates, 2);
});

test("阿格莱雅：战技召唤衣匠并立即行动，衣匠速度是她的 35%", () => {
  // 开局 175，t 时战技 +20，召唤衣匠（提前 100%），自己也提前 100%。
  const t = 10000 / 102;
  const engine = battle({ team: [zero("1402")], maxAV: t + 0.01 });
  engine.run();
  const garmaker = named(engine, "衣匠");
  assert.ok(garmaker.length >= 1);
  near(garmaker[0].av, t);
  const self = engine.timeline.filter((row) => row.slot === 0 && ["skill", "basic"].includes(row.type));
  assert.deepEqual(self.map((row) => row.type), ["skill", "basic"]);
  near(self[1].av, t);
});

test("阿格莱雅：衣匠攻击叠速度，每层 +63.8 点，最多 6 层，E4 7 层", () => {
  const engine = battle({ team: [zero("1402", { baseSpd: 100 })], maxAV: 100.01 });
  engine.run();
  const actor = engine.summons.find((item) => item.name === "衣匠")!;
  near(actor.speed(), 100 * 0.35 + 63.8);
  const state = kit<{ fillStacks(): void }>(engine, "1402");
  state.fillStacks();
  near(actor.speed(), 100 * 0.35 + 6 * 63.8);
  const e4 = battle({ team: [zero("1402", { baseSpd: 100, eidolon: 4 })], maxAV: 1 });
  e4.run();
  const e4State = kit<{ fillStacks(): void; stacks: number }>(e4, "1402");
  e4State.fillStacks();
  assert.equal(e4State.stacks, 7);
});

test("阿格莱雅：至高之姿每层自身速度 +17.5%；100 速倒计时结束衣匠消失，留 1 层，回能 20", () => {
  const engine = battle({ team: [zero("1402", { baseSpd: 100, initialEnergy: 350 })], maxAV: 1 });
  engine.run();
  // 开大：能量 0 + 5。衣匠 0 AV 行动一次：+10，1 层。
  const unit = engine.units[0];
  assert.equal(unit.ultimates, 1);
  near(unit.speed(), 100 * 1.175);
  const countdown = engine.summons.find((actor) => actor.role === "countdown")!;
  const before = unit.energy;
  countdown.onTurn(countdown);
  near(unit.energy, before + 20);
  near(unit.speed(), 100);
  assert.equal(engine.summons.some((actor) => actor.name === "衣匠"), false);
});

test("风堇：首次召唤小伊卡回能 45，已在场时再放战技不算被召唤", () => {
  const t = 10000 / 110;
  const first = battle({ team: [zero("1409")], maxAV: t + 1 });
  first.run();
  near(first.units[0].energy, 30 + 45);
  const second = battle({ team: [zero("1409")], maxAV: 2 * t + 1 });
  second.run();
  near(second.units[0].energy, 30 + 45 + 30);
});

test("风堇：雨过天晴期间每次施放技能后小伊卡行动，回能 5，3 回合（回合开始减 1）", () => {
  const t = 10000 / 110;
  const engine = battle({ team: [zero("1409", { initialEnergy: 140, rotation: "basic" })], maxAV: 3 * t + 1 });
  engine.run();
  // 开大：0 + 45 + 小伊卡 5 + 返还 5 = 55。第 1 动（剩 2 回合）、第 2 动（剩 1 回合）各 20 + 5，第 3 动开始减到 0。
  near(engine.units[0].energy, 55 + 25 + 25 + 20);
  assert.equal(named(engine, "小伊卡").length, 3);
});

test("开拓者•记忆：开局提前 30%；首次召唤迷迷 50% + 40% 充能；回能 10 点 +1% 充能", () => {
  const t = 7000 / 103;
  const engine = battle({ team: [zero("8007")], maxAV: t + 1 });
  engine.run();
  near(engine.timeline.find((row) => row.type === "skill")!.av, t);
  // 战技回能 30 算 3%，召唤 +90%。
  near(kit<{ charge: number }>(engine, "8007").charge, 93);
});

test("开拓者•记忆：迷迷满充能后当场再行动，拉队友 100%，回能 10，充能清零后继续累计", () => {
  // 椒丘开局回能 15，战技 30，累计 45 = 4%（余 5）。召唤 +90，t 时 94%。
  // 迷迷第 1 次：回能 10 → 累计 15，+1%，再 +5 = 100%，挂起 100%，当场再行动。
  // 第 2 次清零，回能 10 → 余 5 + 10，+1%；椒丘被拉到当场战技 30 → 余 5 + 30，+3%，共 4%。
  const t = 7000 / 103;
  const av = t + 10000 / 130;
  const engine = battle({ team: [zero("8007", { targetSlot: 1 }), zero("1218", { baseSpd: 1 })], maxAV: av + 0.01 });
  engine.run();
  const help = labelled(engine, "我会！帮你！");
  assert.equal(help.length, 1);
  near(help[0].av, av);
  near(kit<{ charge: number }>(engine, "8007").charge, 4);
  // 拉条 100%，椒丘当场行动。
  near(engine.timeline.find((row) => row.slot === 1 && row.type === "skill")!.av, av);
  near(engine.units[0].energy, 30 + 10 + 10);
});

test("开拓者•记忆：特殊资源不算能量；开大给史诗，普攻变强化", () => {
  const resource = battle({ team: [zero("8007", { baseSpd: 1 }), zero("1408", { baseSpd: 1 })], maxAV: 1 });
  resource.run();
  resource.gainEnergy(resource.units[1], 10);
  near(kit<{ charge: number }>(resource, "8007").charge, 0);
  const t = 7000 / 103;
  const engine = battle({ team: [zero("8007", { initialEnergy: 160 })], maxAV: t + 1 });
  engine.run();
  assert.ok(engine.timeline.some((row) => row.label.includes("明天，一同写下！")));
});

test("开拓者•记忆 E2：其他忆灵行动 +8，每回合 1 次", () => {
  const engine = battle({ team: [zero("8007", { baseSpd: 1, eidolon: 2 }), zero("1413", { baseSpd: 1 })], maxAV: 10000 / 160 + 1 });
  engine.run();
  // 长夜 0 AV 和 62.5 AV 各行动一次，只算第一次。
  near(engine.units[0].energy, 8);
});

test("遐蝶：默认第 2 动后开大并提示可调整；死龙 165 速，3 回合后消失", () => {
  const engine = battle({ team: [zero("1407")], maxAV: 400 });
  const result = engine.run();
  const speed = 95 * 1.4;
  const dragon = named(engine, "死龙");
  near(dragon[0].av, 2 * (10000 / speed)); // 行动提前 100%，当场行动
  assert.equal(dragon.filter((row) => row.type === "memosprite").length, 3);
  assert.equal(engine.units[0].ultimates, 1);
  assert.ok(result.warnings.some((text) => text.includes("遐蝶") && text.includes("新蕊")));
});

test("遐蝶：秘技开局召唤死龙；死龙在场时手动开大顺延到下一动", () => {
  // 速度 133：第 1 动 75.2 AV 时死龙还在（0、60.6、121.2 行动），第 2 动 150.4 AV 时已消失。
  const t = 10000 / 133;
  const first = battle({ team: [zero("1407", { manualUltimates: [1] })], maxAV: t + 1, useTechnique: true });
  first.run();
  near(named(first, "死龙")[0].av, 0);
  assert.equal(first.units[0].ultimates, 0);
  const second = battle({ team: [zero("1407", { manualUltimates: [1] })], maxAV: 2 * t + 1, useTechnique: true });
  second.run();
  assert.equal(second.units[0].ultimates, 1);
  near(second.timeline.find((row) => row.type === "ultimate")!.av, 2 * t);
});

test("长夜月：进战召唤长夜并立即行动，战斗开始 +70，忆灵施放技能 +5", () => {
  const engine = battle({ team: [zero("1413")], maxAV: 1 });
  engine.run();
  near(named(engine, "长夜")[0].av, 0);
  near(engine.units[0].energy, 70 + 20 + 5);
  const actor = engine.summons.find((item) => item.name === "长夜")!;
  near(actor.remDist, 10000);
});

test("长夜月：忆质满 16 立即行动施放迷梦，长夜消失，速度提高 10% + 消耗点数", () => {
  // 开局 70 能量、1 点忆质，长夜每次能量 +25、忆质 +2（追忆 +1，行迹 +1），间隔 62.5 AV。
  // 第 7 次（375 AV）开始时 13 点、能量 220。追忆回能 20 到 240，当场开大：行迹忆质 +1 = 14。
  // 追忆 +1 = 15，行迹 +1 = 16，立即行动。同一 AV 迷梦消耗 16，速度 +26%。
  const engine = battle({ team: [zero("1413", { baseSpd: 1 })], maxAV: 376 });
  engine.run();
  const dream = labelled(engine, "迷梦");
  assert.equal(dream.length, 1);
  near(dream[0].av, 375);
  assert.equal(engine.units[0].ultimates, 1);
  assert.equal(engine.summons.some((actor) => actor.name === "长夜"), false);
  near(engine.units[0].speed(), 1.26);
  // 迷梦本身也算施放技能，行迹再 +1。
  assert.equal(kit<{ memory: number }>(engine, "1413").memory, 1);
});

test("长夜月：加速在她下个回合开始时移除；战技再召唤长夜", () => {
  const engine = battle({ team: [zero("1413", { baseSpd: 100 })], maxAV: 1 });
  engine.run();
  const state = kit<{ memory: number }>(engine, "1413");
  state.memory = 16;
  const actor = engine.summons.find((item) => item.name === "长夜")! as unknown as { onTurn(a: unknown): void };
  actor.onTurn(actor);
  near(engine.units[0].speed(), 100 * 1.26);
  engine.takeTurn(engine.units[0]);
  near(engine.units[0].speed(), 100);
  assert.ok(engine.summons.some((item) => item.name === "长夜"));
});

test("长夜月 E2：每次获得忆质多 2 点", () => {
  const engine = battle({ team: [zero("1413", { baseSpd: 1, eidolon: 2 })], maxAV: 1 });
  engine.run();
  // 开局 1 + 2；长夜 0 AV：追忆 1 + 2，行迹 1 + 2。
  assert.equal(kit<{ memory: number }>(engine, "1413").memory, 9);
});

test("知更鸟•晴歌：气氛 6 和 12 召唤后两名乐手，每次 +20；全员登台进入 Fever 不再行动", () => {
  const t = 10000 / 95;
  const engine = battle({ team: [zero("1512", { targetSlot: 1 }), zero("1218", { baseSpd: 1 })], maxAV: t + 0.01 });
  engine.run();
  const unit = engine.units[0];
  near(unit.energy, 30 + 20);
  const state = kit<{ atmosphere: number; members: number }>(engine, "1512");
  state.atmosphere = 5;
  engine.attack(engine.units[1], "basic");
  assert.equal(state.members, 2);
  near(unit.energy, 70);
  state.atmosphere = 11;
  engine.attack(engine.units[1], "basic");
  assert.equal(state.members, 3);
  assert.equal(unit.paused, true);
  assert.ok(engine.summons.some((actor) => actor.name === "「晴空乐手」"));
});

test("知更鸟•晴歌：Fever 倒计时每次扣一半（至少 12），气氛归零退出并提前 50%", () => {
  const engine = battle({ team: [zero("1512", { baseSpd: 100 })], maxAV: 1 });
  engine.run();
  const unit = engine.units[0];
  const before = unit.remDist;
  const state = kit<{ atmosphere: number; enterFever(): void }>(engine, "1512");
  state.atmosphere = 40;
  state.enterFever();
  const countdown = engine.summons.find((actor) => actor.name === "Fever 倒计时")! as unknown as { onTurn(a: unknown): void };
  countdown.onTurn(countdown); // 40 → 20（扣一半）
  assert.equal(state.atmosphere, 20);
  countdown.onTurn(countdown); // 20 → 8（扣一半不足 12）
  assert.equal(state.atmosphere, 8);
  countdown.onTurn(countdown); // 8 → 0，退出
  assert.equal(state.atmosphere, 0);
  assert.equal(unit.paused, false);
  near(unit.remDist, Math.max(0, before - 5000));
  assert.equal(engine.summons.some((actor) => actor.name === "「晴空乐手」"), false);
});

test("知更鸟•晴歌：开大拉目标 100%，固定回 24%，特邀嘉宾攻击多 2 点气氛，持有者 2 回合", () => {
  const engine = battle({ team: [zero("1512", { baseSpd: 1, initialEnergy: 140, targetSlot: 1 }), zero("1218", { baseSpd: 1 })], maxAV: 1 });
  engine.run();
  const ally = engine.units[1];
  // 椒丘 0 AV 被拉到当场行动：开局 15，开大时固定 +24% × 100 = 24，战技 +30。
  near(ally.energy, 15 + 24 + 30);
  const state = kit<{ atmosphere: number }>(engine, "1512");
  assert.equal(state.atmosphere, 3); // 那次战技 1 + 2
  engine.takeTurn(ally); // 持续减到 0
  assert.equal(state.atmosphere, 3 + 1);
});

test("知更鸟•晴歌：秘技提前 20% +6 气氛，贝茜被召唤时立即再召啾米", () => {
  const t = 8000 / 95;
  const engine = battle({ team: [zero("1512")], maxAV: t + 0.01, useTechnique: true });
  engine.run();
  near(engine.timeline.find((row) => row.type === "skill")!.av, t);
  const state = kit<{ members: number }>(engine, "1512");
  assert.equal(state.members, 2);
  // 战技 30 + 贝茜 20 + 啾米 20。
  near(engine.units[0].energy, 70);
});

test("白厄：变身后队友不行动，8 个额外回合按 60% 速度，结束全队速度 +15%", () => {
  // 基础 300，变身速度 180；间隔 55.56，第 8 次在 444.44。
  const speed = 300 * 0.6;
  const end = 8 * (10000 / speed);
  const engine = battle({ team: [{ id: "1408", traceSpd: 0, baseSpd: 300, initialEnergy: 12 }, zero("1218", { baseSpd: 1000 })], maxAV: end + 1 });
  engine.run();
  const kaos = named(engine, "卡厄斯兰那");
  assert.equal(kaos.length, 8);
  near(kaos[7].av, end);
  // 队友 1000 速，变身前的 0 AV 还没动过，变身期间一次也不行动。
  assert.equal(engine.timeline.filter((row) => row.slot === 1 && row.av < end && ["skill", "basic"].includes(row.type)).length, 0);
  near(engine.units[1].speed(), 1150);
  near(engine.units[0].energy, 1 + 3); // 开局 12 + 1，开大留 1，变身结束 +3
});

test("白厄：火种溢出最多 3 点，E6 无上限；E1 速度 66%；秘技给队友 25", () => {
  const capped = battle({ team: [zero("1408", { baseSpd: 1 })], maxAV: 1 });
  capped.run();
  const unit = capped.units[0];
  unit.castingUltimate = true;
  capped.gainEnergy(unit, 100);
  near(unit.energy, 15);
  const e6 = battle({ team: [zero("1408", { baseSpd: 1, eidolon: 6 })], maxAV: 1 });
  e6.run();
  const e6Unit = e6.units[0];
  e6Unit.castingUltimate = true;
  e6.gainEnergy(e6Unit, 100);
  near(e6Unit.energy, 106);
  const e1 = battle({ team: [zero("1408", { baseSpd: 100, eidolon: 1, initialEnergy: 12 })], maxAV: 10000 / 66 + 0.01 });
  e1.run();
  near(named(e1, "卡厄斯兰那")[0].av, 10000 / 66);
  const opened = battle({ team: [zero("1408", { baseSpd: 1 }), zero("1218", { baseSpd: 1 })], maxAV: 1, useTechnique: true });
  opened.run();
  near(opened.units[1].energy, 15 + 25); // 椒丘开局 15 + 白厄秘技 25
});

test("昔涟：追忆 24 开大，之后只要 12；队友行动消耗【未来】+1，昔涟行动后才补", () => {
  const engine = battle({ team: [zero("1415", { baseSpd: 1 }), zero("1218")], maxAV: 2 * (10000 / 98) + 1 });
  engine.run();
  // 战斗开始给【未来】，椒丘第 1 动消耗 +1；第 2 动昔涟没行动过，没有【未来】。
  near(engine.units[0].energy, 1);
});

test("昔涟：普攻 +1、战技 +3；开大后强化普攻 +3，E6 首次开大全队提前 100%", () => {
  const t = 10000 / 101;
  const skill = battle({ team: [zero("1415")], maxAV: t + 1 });
  skill.run();
  near(skill.units[0].energy, 3);
  const basic = battle({ team: [zero("1415", { rotation: "basic" })], maxAV: t + 1 });
  basic.run();
  near(basic.units[0].energy, 1);
  const ult = battle({ team: [zero("1415", { initialEnergy: 24, eidolon: 6 }), zero("1218")], maxAV: 1 });
  ult.run();
  assert.equal(ult.units[0].ultimates, 1);
  near(ult.timeline.find((row) => row.slot === 1 && row.type === "skill")!.av, 0);
  const after = battle({ team: [zero("1415", { initialEnergy: 24 })], maxAV: t + 1 });
  after.run();
  near(after.units[0].energy, 3);
  assert.ok(after.timeline.some((row) => row.label.includes("向着爱与明天")));
});

test("昔涟：开局追忆按黄金裔和记忆命途人数 2/3/6；忆灵行动每次 +1，【未来】不消耗", () => {
  const count = (...ids: string[]) => {
    const engine = battle({ team: [zero("1415", { baseSpd: 1 }), ...ids.map((id) => zero(id, { baseSpd: 1 }))], maxAV: 1 });
    engine.run();
    return engine.units[0].energy;
  };
  near(count("1218"), 0);
  near(count("1404"), 2);
  near(count("1404", "1405"), 3);
  near(count("1404", "1405", "1406"), 6);
  near(count("8007"), 2); // 开拓者•记忆是记忆命途
});

test("昔涟：德谬歌的诗：万敌不在血仇提前 100%，阿格莱雅层数叠满，攻击后回能 70", () => {
  const mydei = battle({ team: [zero("1415", { baseSpd: 1, initialEnergy: 24, targetSlot: 1 }), zero("1404", { baseSpd: 100 })], maxAV: 1 });
  mydei.run();
  near(mydei.timeline.find((row) => row.slot === 1 && row.type === "skill")!.av, 0);
  const aglaea = battle({ team: [zero("1415", { baseSpd: 1, initialEnergy: 24, targetSlot: 1 }), zero("1402", { baseSpd: 100 })], maxAV: 1 });
  aglaea.run();
  assert.equal(kit<{ stacks: number }>(aglaea, "1402").stacks, 6);
  const before = aglaea.units[1].energy;
  aglaea.attack(aglaea.units[1], "basic");
  near(aglaea.units[1].energy, before + 70);
  aglaea.attack(aglaea.units[1], "basic");
  near(aglaea.units[1].energy, before + 70);
});

test("昔涟：【故事】3 点德谬歌行动，E1 +6 追忆，E6 第 2 次起全队提前 24%", () => {
  const engine = battle({ team: [zero("1415", { baseSpd: 1, eidolon: 1, initialEnergy: 24 })], maxAV: 1 });
  engine.run();
  // 首次开大 2 点故事。第二次开大 +1 = 3，触发舞曲，E1 +6。
  const unit = engine.units[0];
  assert.equal(labelled(engine, "花与箭的舞曲").length, 0);
  near(unit.energy, 0);
  engine.gainEnergy(unit, 12);
  assert.equal(labelled(engine, "花与箭的舞曲").length, 1);
  near(unit.energy, 6);
});

test("依赖敌方或生命值的部分都写清楚了", () => {
  for (const [id, keyword] of [["1404", "受到"], ["1409", "生命"], ["1413", "生命"], ["1408", "目标"], ["1402", "敌方"], ["1415", "待实测"], ["1510", "助战技"]] as const) {
    const { unsupported } = battle({ team: [{ id }] }).run();
    assert.ok(unsupported.some((item) => item.mechanic.includes(keyword)), `${id} 应提到 ${keyword}：${JSON.stringify(unsupported)}`);
  }
});
