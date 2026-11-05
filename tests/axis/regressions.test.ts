/**
 * 角色机制的独立预期：资源转换和行动条时序。预期都是手算的，依据 4.6.53 版本资料和用户补充的实战规则。
 * 从 tests/test_toolbox.py 的 TestAhaEventRegressions 迁来，旧引擎下线后由这里负责。
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { FeiyingKit } from "../../axis-engine/src/characters/feiying.ts";
import { buildLegacyBattle, simulateLegacy } from "../../axis-engine/src/legacy.ts";

type Member = Record<string, unknown>;

const battle = (team: Member[], config: Record<string, unknown> = {}) =>
  buildLegacyBattle({ maxAV: 1, useTech: false, trace3Advance: false, team, ...config });

const near = (actual: number, expected: number, message = "") =>
  assert.ok(Math.abs(actual - expected) < 1e-7, `${message} 期望 ${expected}，实际 ${actual}`);

const feiyingKit = (engine: ReturnType<typeof battle>["engine"]) => engine.kitOf<FeiyingKit>("1505")!;
const inExtraWindow = (engine: ReturnType<typeof battle>["engine"], work: () => void) => engine.inExtraWindow(work);

test("开局开大的拉条不会被开局结算覆盖", () => {
  const { engine } = battle([{ id: "1511", baseSpd: 1, traceSpd: 0, lcBaseSpd: 0, eidolon: 1 }], { e1Wishpower: 8, maxAV: 100, aeonAhaBaseSpd: 100 });
  const { timeline } = engine.run();
  near(timeline.find((row) => row.type === "aha")!.av, 8000 / 100.2);
});

test("E6 开局开大，【阿哈时刻】在 0 AV 接上", () => {
  const { engine } = battle([{ id: "1511", eidolon: 6 }], { e1Wishpower: 8 });
  assert.equal(engine.run().timeline.find((row) => row.type === "aha")!.av, 0);
});

test("风套在回合内开大：速度除不尽时拉条也不丢", () => {
  // 战技回能 30、上限 40：第 2 动满能开大。间隔依次 10000/速度、7500/速度。
  for (const speed of [81, 87.5, 92.5, 96, 136.9, 139, 144.4, 100]) {
    const { engine } = battle([{ id: "custom", name: "测试位", baseSpd: speed, lcBaseSpd: 0, traceSpd: 0, maxSp: 40, initialEnergy: 0, rotation: "skill", equipment: { windSet4: true } }], { maxAV: 400, useAeonAha: false });
    const acts = engine.run().timeline.filter((row) => row.type === "skill").map((row) => row.av);
    near(acts[1] - acts[0], 10000 / speed, `速度 ${speed}`);
    near(acts[2] - acts[1], 7500 / speed, `速度 ${speed}`);
  }
});

test("阿哈在【阿哈时刻】内开大：拉条挂起到回合结束", () => {
  // 底速 S，阿哈速度 S + 0.2 × 1；第 1、2 次间隔 8000/速度。
  for (let tenth = 1000; tenth < 2200; tenth += 5) {
    const base = tenth / 10;
    const { engine } = battle([{ id: "1511", baseSpd: 1, traceSpd: 0, lcBaseSpd: 0, initialEnergy: 7 }], { maxAV: 300, aeonAhaBaseSpd: base });
    const times = engine.run().timeline.filter((row) => row.type === "aha").map((row) => row.av);
    near(times[1] - times[0], 8000 / (base + 0.2), `底速 ${base}`);
  }
});

test("普通【阿哈时刻】嵌套额外回合后开大，拉条留给外层", () => {
  // 阿哈速度 100.3。爻光欢愉技满能开大给嵌套额外回合，回到外层阿哈满 8 愿力开大。
  const { engine } = battle([
    { id: "1511", baseSpd: 1, traceSpd: 0, lcBaseSpd: 0, initialEnergy: 6 },
    { id: "1502", baseSpd: 1, traceSpd: 0, initialEnergy: 175 },
  ], { maxAV: 300, aeonAhaBaseSpd: 100 });
  const { timeline } = engine.run();
  assert.equal(timeline.filter((row) => row.type === "aha_extra").length, 1);
  const times = timeline.filter((row) => row.type === "aha").map((row) => row.av);
  near(times[0], 10000 / 100.3);
  near(times[1] - times[0], 8000 / 100.3);
});

test("嵌套的额外回合不动外层的回合状态", () => {
  const { el } = battle([{ id: "1511" }]);
  Object.assign(el.aha, { inTurn: true, remDist: 0, pendingAdvance: 20 });
  el.doAha(true, 20);
  assert.equal(el.aha.inTurn, true);
  assert.equal(el.aha.pendingAdvance, 20);
  assert.equal(el.aha.remDist, 0);
});

test("额外回合时距离大于 0：拉条立即扣减", () => {
  const { el, engine } = battle([{ id: "1511" }]);
  const unit = engine.units[0];
  unit.energy = 7;
  el.aha.remDist = 6000;
  el.doAha(true, 20);
  assert.equal(unit.ultimates, 1);
  assert.equal(el.aha.remDist, 4000);
  assert.equal(el.aha.pendingAdvance, 0);
});

test("满能开局：第一动前连开两次大", () => {
  const result = simulateLegacy({ maxAV: 1, useTech: false, trace3Advance: false, team: [{ id: "1505", initialEnergy: 480 }] });
  const ults = result.timeline.filter((row) => row.type === "ultimate");
  assert.deepEqual(ults.map((row) => row.av), [0, 0]);
  assert.deepEqual(ults.map((row) => row.res.energyBefore), [480, 245]);
  assert.equal(result.units[0].initialEnergy, 480);
  assert.equal(result.units[0].finalEnergy, 10);
  assert.ok(!result.timeline.some((row) => row.type === "skill"));
});

test("【阿哈时刻】不会开启升格", () => {
  for (const extra of [false, true]) {
    const { el, engine } = battle([{ id: "1505", initialEnergy: 470 }, { id: "1511" }]);
    el.doAha(extra, extra ? 20 : 0);
    assert.equal(el.huanyuActive(), false);
    assert.equal(engine.units[1].ultimates, 0);
    const gains = engine.timeline.filter((row) => row.type === "energy_gain");
    assert.ok(gains.length > 0);
    assert.ok(gains.every((row) => row.res.energyCap === 480));
  }
});

test("升格从阿哈开大开始，到【欢愉万相】结束", () => {
  const { el, engine } = battle([{ id: "1511", initialEnergy: 8 }, { id: "1505", initialEnergy: 0 }]);
  const [aha, fei] = engine.units;
  assert.equal(el.huanyuActive(), false);
  engine.maybeUltimate(aha);
  assert.equal(el.huanyuActive(), true);
  engine.gainEnergy(fei, 1, { fixed: true });
  assert.equal(engine.timeline.at(-1)!.res.energyCap, 540);
  for (let turn = 0; turn < 3; turn += 1) engine.takeTurn(aha);
  assert.equal(el.huanyuActive(), false);
  engine.gainEnergy(fei, 1, { fixed: true });
  assert.equal(engine.timeline.at(-1)!.res.energyCap, 480);
});

test("绯英跨过门槛的那次回能当场开大", () => {
  for (const ascended of [false, true]) {
    const { engine } = battle([{ id: "1511", initialEnergy: 8 }, { id: "1505", initialEnergy: 230 }]);
    if (ascended) engine.maybeUltimate(engine.units[0]);
    engine.av = 12.5;
    const start = engine.timeline.length;
    engine.gainEnergy(engine.units[1], 30, { fixed: true, reason: "test" });
    const rows = engine.timeline.slice(start);
    assert.deepEqual(rows.slice(0, 2).map((row) => row.type), ["energy_gain", "ultimate"]);
    assert.equal(rows[1].av, 12.5);
    assert.equal(rows[1].res.energyBefore, 260);
    assert.equal(rows[1].res.energyCost, 240);
    assert.equal(engine.units[1].ultimates, 1);
  }
});

test("开局的额外【阿哈时刻】全部结算完才开大", () => {
  const teams: Member[][] = [
    [{ id: "1505", initialEnergy: 480 }, { id: "1511" }],
    [{ id: "1511" }, { id: "1505", initialEnergy: 480 }],
    [{ id: "1502", initialEnergy: 180 }, { id: "1505", initialEnergy: 480 }, { id: "1511" }],
  ];
  for (const team of teams) {
    const { engine } = battle(team, { useTech: true });
    const { timeline } = engine.run();
    const extra = timeline.findIndex((row) => row.type === "aha_extra");
    const firstUlt = timeline.findIndex((row) => row.type === "ultimate");
    assert.ok(extra >= 0 && firstUlt > extra);
    const skills = timeline.map((row, index) => ({ row, index })).filter(({ row, index }) => index > extra && row.type === "elation_skill").slice(0, team.length);
    assert.equal(skills.length, team.length);
    assert.ok(skills.at(-1)!.index < firstUlt);
    const settlement = timeline.findIndex((row) => row.label === "绯英回能·好活当赏·阿哈时刻额外回合");
    assert.ok(settlement >= 0 && settlement < firstUlt);
    assert.equal(timeline[firstUlt].av, 0);
  }
});

test("满能时回能不累计虚假的量", () => {
  const { el, engine } = battle([{ id: "1505", initialEnergy: 480 }]);
  const unit = engine.units[0];
  inExtraWindow(engine, () => engine.gainEnergy(unit, 30));
  assert.equal(unit.energy, 480);
  assert.equal(unit.energyTotal, 0);
  assert.equal(feiyingKit(engine).total, 0);
  assert.equal(el.haohuoSum(unit), 0);
});

test("部分溢出时只计入实际获得的能量", () => {
  const { el, engine } = battle([{ id: "1505", initialEnergy: 470 }]);
  const unit = engine.units[0];
  inExtraWindow(engine, () => engine.gainEnergy(unit, 30));
  assert.equal(unit.energy, 480);
  assert.equal(unit.energyTotal, 10);
  assert.equal(feiyingKit(engine).total, 10);
  assert.equal(el.haohuoSum(unit), 10);
});

test("绯英开大时点跟随真实回能", () => {
  // 100 速：每 100 AV 战技 +30，欢愉技 +5、附加好活当赏 +5、笑点结算 +10，共 50。240 即可开大。
  const cases: [number, number[]][] = [[240, [0, 500, 1000]], [480, [0, 0, 500, 1000]], [0, [500, 1000]]];
  for (const [initial, expected] of cases) {
    const result = simulateLegacy({ maxAV: 1000, useTech: false, trace3Advance: false, useAeonAha: false, team: [{ id: "1505", initialEnergy: initial, baseSpd: 100, traceSpd: 0 }] });
    const ults = result.timeline.filter((row) => row.type === "ultimate");
    assert.equal(ults.length, expected.length, `开局 ${initial}`);
    ults.forEach((row, index) => near(row.av, expected[index]));
    let meter = initial;
    for (const row of result.timeline) {
      if (row.type === "energy_gain") {
        near(row.res.energyBefore as number, meter);
        meter += row.res.energyGain as number;
        near(row.res.energy as number, meter);
      } else if (row.type === "ultimate") {
        assert.ok((row.res.energyBefore as number) >= 240);
        assert.equal(row.res.energyCost, 240);
        near(row.res.energyBefore as number, meter);
        meter -= 240;
      }
    }
    near(result.units[0].finalEnergy, meter);
  }
});

test("开局能量超出范围时报错", () => {
  for (const value of [-1, 481, "invalid"]) {
    assert.throws(() => battle([{ id: "1505", initialEnergy: value }]), /initialEnergy/);
  }
});

test("绯英：能量转好活当赏不会再转回能量", () => {
  const { el, engine } = battle([{ id: "1505", initialEnergy: 0 }]);
  const unit = engine.units[0];
  engine.gainEnergy(unit, 30);
  assert.equal(unit.energy, 30);
  assert.equal(el.haohuoSum(unit), 30);
  assert.equal(feiyingKit(engine).total, 30);
  assert.equal(unit.followUps, 0);
});

test("绯英：好活当赏转能量不会再生成好活当赏", () => {
  const { el, engine } = battle([{ id: "1505", initialEnergy: 0 }]);
  const unit = engine.units[0];
  el.grantHaohuo([unit], 20, "test");
  assert.equal(unit.energy, 20);
  assert.equal(el.haohuoSum(unit), 20);
  assert.equal(feiyingKit(engine).total, 20);
});

test("绯英：单次回能最多计入一次狐狸老师", () => {
  const { engine } = battle([{ id: "1505", initialEnergy: 0 }]);
  const unit = engine.units[0];
  engine.gainEnergy(unit, 1000, { fixed: true });
  assert.equal(unit.followUps, 1);
  near(feiyingKit(engine).total, 10); // 满能狐狸回能截掉，两次大招各返还 +5
});

test("绯英按参演编号转移，不看站位", () => {
  for (const [eidolon, copied] of [[0, 10], [2, 15]]) {
    const { el, engine } = battle([{ id: "1503" }, { id: "1505", eidolon, initialEnergy: 0 }]);
    const [pearl, fei] = engine.units;
    el.grantHaohuo([pearl], 20, "test");
    assert.equal(el.haohuoSum(fei), copied);
    assert.equal(fei.energy, copied);
  }
  const reversed = battle([{ id: "1505", initialEnergy: 0 }, { id: "1503" }]);
  reversed.el.grantHaohuo([reversed.engine.units[1]], 20, "test");
  assert.equal(reversed.el.haohuoSum(reversed.engine.units[0]), 10);
  // 砂金•戏浪编号 156 大于绯英 146，不转移。
  const larger = battle([{ id: "1513" }, { id: "1505" }]);
  larger.el.grantHaohuo([larger.engine.units[0]], 20, "test");
  assert.equal(larger.el.haohuoSum(larger.engine.units[1]), 0);
});

test("欢愉技按参演编号施放，阿哈最后", () => {
  const { el } = battle([{ id: "1505" }, { id: "1511" }, { id: "1502" }, { id: "1503" }]);
  assert.deepEqual(el.elationCasters().map((unit) => unit.id), ["1503", "1502", "1505", "1511"]);
});

test("升格后绯英的溢出上限跟随阿哈星魂", () => {
  for (const [eidolon, cap] of [[0, 540], [2, 720]]) {
    const { engine } = battle([{ id: "1511", eidolon }, { id: "1505", initialEnergy: 470 }]);
    engine.kitOf<{ id: string; huanyu: number }>("1511")!.huanyu = 3;
    inExtraWindow(engine, () => engine.gainEnergy(engine.units[1], 1000, { fixed: true }));
    assert.equal(engine.units[1].energy, cap);
  }
});

test("溢出恢复计入狐狸老师，但不转好活当赏", () => {
  const { el, engine } = battle([{ id: "1511", eidolon: 2 }, { id: "1505" }]);
  const [, fei] = engine.units;
  engine.kitOf<{ id: string; huanyu: number }>("1511")!.huanyu = 3;
  const kit = feiyingKit(engine);
  fei.energy = 600;
  kit.total = 120;
  kit.ultBonus = 1;
  engine.castUltimate(fei);
  assert.equal(fei.followUps, 1); // 120 累计 + 120 溢出恢复
  assert.equal(fei.energy, 375); // 保留 240 + 恢复 120 + 狐狸 10 + 返还 5
  assert.equal(kit.total, 15);
  assert.equal(el.haohuoSum(fei), 15); // 恢复的 120 不转好活当赏
  const notes = engine.timeline.filter((row) => row.label === "欢愉万相★书中折花").flatMap((row) => row.details);
  assert.ok(notes.some((text) => text.includes("150%")));
  assert.ok(notes.some((text) => text.includes("24%")));
});

test("绯英：队友的好活当赏到期时转移", () => {
  for (const [eidolon, copied] of [[0, 10], [2, 20]]) {
    const { el, engine } = battle([{ id: "1505", eidolon, initialEnergy: 0 }, { id: "1503" }]);
    const [fei, pearl] = engine.units;
    el.haohuoOf(pearl).push({ count: 20, turns: 1, label: "test" });
    el.onTurnEnd(pearl, false);
    assert.equal(el.haohuoSum(fei), copied);
    assert.deepEqual(el.haohuoOf(pearl), []);
  }
});

test("绯英：秘技和欢愉技附加好活当赏", () => {
  const { el, engine } = battle([{ id: "1505", initialEnergy: 0 }], { useTech: true });
  engine.battleStart();
  const unit = engine.units[0];
  assert.equal(unit.energy, 20);
  assert.equal(el.haohuoSum(unit), 20);
  el.castElationSkill(unit);
  assert.equal(unit.energy, 30); // 5 基础能量 + 5 好活当赏转能量
  assert.equal(el.haohuoSum(unit), 30);
});

test("绯英 E1：追击后施放一次欢愉技", () => {
  const { engine } = battle([{ id: "1505", eidolon: 1, initialEnergy: 0 }]);
  const unit = engine.units[0];
  engine.gainEnergy(unit, 240, { fixed: true });
  assert.equal(unit.followUps, 1);
  assert.equal(engine.timeline.filter((row) => row.type === "elation_skill").length, 1);
  assert.equal(unit.energy, 35); // 240 + 10 + 5 + 15 - 240 + 5
  assert.equal(feiyingKit(engine).total, 35);
});

test("绯英开大要等狐狸老师和 E1 欢愉技结算完", () => {
  const { engine } = battle([{ id: "1505", eidolon: 1, initialEnergy: 230 }]);
  engine.gainEnergy(engine.units[0], 250, { fixed: true });
  const { timeline } = engine;
  const ult = timeline.findIndex((row) => row.type === "ultimate");
  const elation = timeline.findIndex((row) => row.type === "elation_skill");
  const settlement = timeline.findIndex((row) => row.label === "绯英回能·好活当赏·绯英欢愉技");
  assert.ok(elation < settlement);
  assert.ok(settlement < ult);
  assert.equal(engine.units[0].energy, 10);
});

test("攻击型终结技走统一攻击钩子", () => {
  for (const id of ["1511", "1505"]) {
    const { engine } = battle([{ id }, { id: "1309" }]);
    const [actor, robin] = engine.units;
    engine.castUltimate(actor);
    assert.equal(robin.energy, robin.maxEnergy * 0.5 + 2);
  }
});

test("额外回合结算完才开大", () => {
  const { el, engine } = battle([{ id: "1505", maxSp: 30, initialEnergy: 0 }]);
  el.extraTurnWithGrants(engine.units[0], "test", { punchline: 60 });
  const labels = engine.timeline.map((row) => row.label);
  assert.ok(labels.indexOf("额外回合笑点结算") < labels.indexOf("绯英 的终结技"));
});

test("自定义高能量恢复效率的连锁有上限，并给出提示", () => {
  const { engine } = battle([{ id: "1505", err: 2400, initialEnergy: 0, maxSp: 100000 }]);
  engine.gainEnergy(engine.units[0], 240, { fixed: true });
  assert.equal(engine.truncated, true);
  assert.ok(engine.warnings.some((text) => text.includes("狐狸老师")));
});

test("攻击结算顺序不随站位变化", () => {
  // 知更鸟天赋排在砂金•戏浪天赋之前，换站位后两人的结果要一致。
  // 窗口停在知更鸟第一次开大（167.24）之前：开大把两名队友同时拉到 0，同时到点谁先动按站位，那是另一回事。
  const team = (ids: string[]) => ids.map((id) => ({ id, baseSpd: id === "1309" ? 120 : 110 }));
  const run = (ids: string[]) => simulateLegacy({ maxAV: 160, useTech: false, team: team(ids) });
  const a = run(["1309", "1513", "1304"]);
  const b = run(["1304", "1513", "1309"]);
  const pick = (result: ReturnType<typeof run>) =>
    result.units.map((unit) => [unit.id, unit.finalEnergy] as const).sort(([x], [y]) => x.localeCompare(y));
  const left = pick(a), right = pick(b);
  left.forEach(([id, energy], index) => {
    assert.equal(id, right[index][0]);
    near(energy, right[index][1], id);
  });
});

/** 只取会影响后续结算的那些事件，看它们的先后。 */
const settlementOrder = (engine: ReturnType<typeof battle>["engine"]) => engine.timeline
  .filter((row) => row.type === "ultimate" || row.type === "fua" || (row.type === "elation_skill" && row.extra))
  .map((row) => `${row.name}:${row.type}`);

test("同一次攻击：知更鸟天赋先于砂金【盲注】，再到戏浪天赋", () => {
  // 队友一次攻击同时让三人的机制到点。无论站位如何，先后都是：知更鸟满能开大、盲注满层追击、热意过阈值举杯。
  for (const ids of [["custom", "1309", "1304", "1513"], ["custom", "1513", "1304", "1309"]]) {
    const { engine } = battle(ids.map((id) => (id === "custom" ? { id, name: "队友" } : { id, baseSpd: 1, ...(id === "1309" ? { initialEnergy: 158 } : {}) })));
    engine.kitOf<{ id: string; blind: number }>("1304")!.blind = 6;
    engine.kitOf<{ id: string; fervor: number }>("1513")!.fervor = 9;
    engine.attack(engine.units[0], "skill");
    assert.deepEqual(settlementOrder(engine).slice(0, 3), ["知更鸟:ultimate", "砂金(存护):fua", "砂金•戏浪:elation_skill"], ids.join());
  }
});

test("同一次攻击：开拓者天赋先于知更鸟天赋", () => {
  // 开拓者自己的攻击：天赋 +10 能量满 160 先开大，然后才轮到知更鸟 +2 满能开大。
  for (const ids of [["8009", "1309"], ["1309", "8009"]]) {
    const { engine } = battle(ids.map((id) => (id === "8009" ? { id, initialEnergy: 150, targetSlot: ids.indexOf("1309") } : { id, initialEnergy: 158 })));
    engine.attack(engine.unit("8009"), "skill");
    assert.deepEqual(settlementOrder(engine).slice(0, 2), ["开拓者•欢愉:ultimate", "知更鸟:ultimate"], ids.join());
  }
});

test("只选角色不填任何参数就能算，默认值合理", () => {
  for (const id of ["1511", "1503", "1513", "1304", "1502", "1501", "8009", "1505", "1506", "1313", "1309"]) {
    const result = simulateLegacy({ team: [{ id }] });
    assert.equal(result.units[0].id, id);
    assert.ok(result.units[0].initialSpd > 0, id);
    assert.ok(result.timeline.length > 1, id);
    assert.deepEqual(result.warnings, [], id);
  }
});

test("角色别名可用", () => {
  assert.equal(simulateLegacy({ team: [{ id: "feiying" }] }).units[0].id, "1505");
  assert.equal(simulateLegacy({ team: [{ id: "AEON_AHA" }] }).units[0].id, "1511");
});
