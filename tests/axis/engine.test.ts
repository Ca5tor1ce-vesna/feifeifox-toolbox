/** 行动条与事件核心。预期都是手算的（见每条用例的注释），不来自引擎或旧实现。 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { AxisEngine, type AxisConfig, type AxisEvent, type CharacterKit, type UnitSpec } from "../../axis-engine/src/index.ts";

const unit = (id: string, baseSpd: number, extra: Partial<UnitSpec> = {}): UnitSpec => ({
  id,
  name: id,
  baseSpd,
  maxEnergy: 100,
  ...extra,
});

function simulate(config: Partial<AxisConfig> & { units: UnitSpec[] }) {
  return new AxisEngine({ maxAV: 300, ...config }).run();
}

const near = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `期望 ${expected}，实际 ${actual}`);

const turns = (timeline: AxisEvent[]) =>
  timeline.filter((row) => row.type === "basic" || row.type === "skill");

const avOf = (timeline: AxisEvent[], name: string) =>
  turns(timeline).filter((row) => row.name === name).map((row) => row.av);

function assertAvs(actual: number[], expected: number[]) {
  assert.equal(actual.length, expected.length, `期望 ${expected}，实际 ${actual}`);
  actual.forEach((value, index) => near(value, expected[index]));
}

test("速度 100 每 100 AV 行动一次，窗口上限当次仍行动", () => {
  const { timeline } = simulate({ units: [unit("a", 100)] });
  assertAvs(avOf(timeline, "a"), [100, 200, 300]);
});

test("光锥白值进百分比乘区，行迹和固定速度不进", () => {
  // (100 + 12) × 1.1 + 5 + 5 = 133.2；首动 10000 / 133.2
  const { timeline, units } = simulate({
    maxAV: 80,
    units: [unit("a", 100, { lcBaseSpd: 12, traceSpd: 5, pctSpd: 10, flatSpd: 5 })],
  });
  near(units[0].speed, 133.2);
  assertAvs(avOf(timeline, "a"), [10000 / 133.2]);
});

test("时间推进时所有单位同步消耗距离", () => {
  // a 速度 160：62.5 / 125 / 187.5；b 速度 100：100 / 200
  const { timeline } = simulate({ maxAV: 200, units: [unit("a", 160), unit("b", 100)] });
  assert.deepEqual(turns(timeline).map((row) => row.name), ["a", "b", "a", "a", "b"]);
  assertAvs(avOf(timeline, "a"), [62.5, 125, 187.5]);
  assertAvs(avOf(timeline, "b"), [100, 200]);
});

test("同 AV 时按入队顺序行动", () => {
  const { timeline } = simulate({ maxAV: 100, units: [unit("后手", 100), unit("先手", 100)] });
  assert.deepEqual(turns(timeline).map((row) => row.name), ["后手", "先手"]);
});

test("开局拉条从 7500 起跑", () => {
  const { timeline } = simulate({ maxAV: 200, units: [unit("a", 100, { initAdv: 25 })] });
  assertAvs(avOf(timeline, "a"), [75, 175]);
});

const onAct = (effect: NonNullable<CharacterKit["afterAct"]>): CharacterKit => ({
  id: "kit",
  afterAct: effect,
});

test("自己回合内的自身拉条挂起，回合结束后再扣", () => {
  // 每动自身拉条 25%：100，然后每次只跑 7500 → 175、250
  const { timeline } = simulate({
    maxAV: 250,
    units: [unit("a", 100, { kit: onAct(({ engine, self }) => engine.advance(self, 25, { selfSource: true })) })],
  });
  assertAvs(avOf(timeline, "a"), [100, 175, 250]);
});

test("速度除不尽时自身拉条也不会因浮点残差丢失", () => {
  // 速度 81、每动自身拉条 25%：10000/81 之后，每次只跑 7500/81。
  // 到达时距离可能残留约 1e-12。旧引擎曾因此把这口拉条吞掉，这里防止迁移时带回来。
  for (const speed of [81, 87.5, 92.5, 136.9, 139, 144.4]) {
    const { timeline } = simulate({
      maxAV: 400,
      units: [unit("a", speed, { kit: onAct(({ engine, self }) => engine.advance(self, 25, { selfSource: true })) })],
    });
    const avs = avOf(timeline, "a");
    assert.ok(avs.length >= 3, `速度 ${speed}`);
    near(avs[0], 10000 / speed);
    for (let index = 1; index < avs.length; index += 1) near(avs[index] - avs[index - 1], 7500 / speed);
  }
});

test("外部拉条打在正在行动的单位上不生效", () => {
  const { timeline } = simulate({
    maxAV: 200,
    units: [unit("a", 100, { kit: onAct(({ engine, self }) => engine.advance(self, 25)) })],
  });
  assertAvs(avOf(timeline, "a"), [100, 200]);
});

test("拉条打在等待中的单位上立即扣减，且不低于 0", () => {
  // a 在 50 行动时拉 b 30%：b 此时还差 5000（速度 100），扣到 2000 → 70 行动
  const kit = onAct(({ engine }) => engine.advance(engine.unit("b"), 30));
  const once = simulate({ maxAV: 70, units: [unit("a", 200, { kit }), unit("b", 100)] });
  assertAvs(avOf(once.timeline, "b"), [70]);
  // 拉条 100% 时距离封底为 0：b 在 a 同一时刻（50）紧接着行动
  const full = simulate({
    maxAV: 50,
    units: [unit("a", 200, { kit: onAct(({ engine }) => engine.advance(engine.unit("b"), 100)) }), unit("b", 100)],
  });
  assertAvs(avOf(full.timeline, "b"), [50]);
});

test("行动延后增加剩余距离", () => {
  // 开局 b 延后 20%：12000 / 100 = 120
  const kit: CharacterKit = {
    id: "kit",
    onBattleStart: ({ engine }) => engine.delay(engine.unit("b"), 20),
  };
  const { timeline } = simulate({ maxAV: 120, units: [unit("a", 50, { kit }), unit("b", 100)] });
  assertAvs(avOf(timeline, "b"), [120]);
});

test("变速保留已跑进度", () => {
  // a 在 50 给 b 速度 +100%：b 还差 5000，新速度 200 → 75；之后 10000/200 → 125
  const kit = onAct(({ engine }) =>
    engine.addSpeedBuff(engine.unit("b"), { kind: "pct", value: 100, turns: null, label: "加速" }));
  const { timeline } = simulate({ maxAV: 125, units: [unit("a", 200, { kit }), unit("b", 100)] });
  assertAvs(avOf(timeline, "b"), [75, 125]);
});

test("自己回合内获得的增益，当回合结束不减回合数", () => {
  // 第一动时获得 +100%，持续 2 回合。回合开始时不存在，所以当回合不减。
  // 100（不减，剩 2，速度 200）→ 150（减到 1）→ 200（减到 0）→ 300
  let granted = false;
  const kit = onAct(({ engine, self }) => {
    if (granted) return;
    granted = true;
    engine.addSpeedBuff(self, { kind: "pct", value: 100, turns: 2, label: "加速" });
  });
  const { timeline } = simulate({ maxAV: 300, units: [unit("a", 100, { kit })] });
  assertAvs(avOf(timeline, "a"), [100, 150, 200, 300]);
});

test("别人回合内给的增益，下个回合结束就减", () => {
  // b 在 50 给 a +100%，持续 1 回合：a 还差 5000，新速度 200 → 75；回合开始时已存在，结束减到 0 → 再跑 100 → 175
  let granted = false;
  const kit = onAct(({ engine }) => {
    if (granted) return;
    granted = true;
    engine.addSpeedBuff(engine.unit("a"), { kind: "pct", value: 100, turns: 1, label: "加速" });
  });
  const { timeline } = simulate({ maxAV: 175, units: [unit("a", 100), unit("b", 200, { kit })] });
  assertAvs(avOf(timeline, "a"), [75, 175]);
});

test("同名增益在回合内刷新后，当回合同样不减", () => {
  // 每动都刷新 1 回合：刷新后回合开始时不算存在，所以一直保持。
  const kit = onAct(({ engine, self }) => engine.addSpeedBuff(self, { kind: "pct", value: 100, turns: 1, label: "加速" }));
  const { timeline } = simulate({ maxAV: 200, units: [unit("a", 100, { kit })] });
  assertAvs(avOf(timeline, "a"), [100, 150, 200]);
});

test("同名增益刷新而不是叠加", () => {
  const kit = onAct(({ engine, self }) =>
    engine.addSpeedBuff(self, { kind: "flat", value: 100, turns: null, label: "加速" }));
  const { units } = simulate({ maxAV: 300, units: [unit("a", 100, { kit })] });
  near(units[0].speed, 200);
});

test("额外回合不重置距离、不递减增益，只在当前时刻多动一次", () => {
  // 100 第一动获得 +100%（2 回合）和额外回合：额外回合不消耗增益，主回合结束剩 1，速度 200 → 150
  let used = false;
  const kit = onAct(({ engine, self, extra }) => {
    if (used || extra) return;
    used = true;
    engine.addSpeedBuff(self, { kind: "pct", value: 100, turns: 2, label: "加速" });
    engine.extraTurn(self, "额外回合");
  });
  const { timeline, units } = simulate({ maxAV: 150, units: [unit("a", 100, { kit })] });
  assertAvs(avOf(timeline, "a"), [100, 100, 150]);
  assert.deepEqual(turns(timeline).map((row) => row.extra), [false, true, false]);
  assert.equal(units[0].extraTurns, 1);
});

test("回能吃能量恢复效率，满能即开大并返还", () => {
  // 初始 50，ERR 20%，普攻 20 × 1.2 = 24：74、98、122 封顶 100 → 开大清零，返还 5 × 1.2 = 6
  const { timeline, units } = simulate({
    maxAV: 300,
    units: [unit("a", 100, { err: 20, energyGains: { basic: 20, skill: 30, ultimate: 5 }, rotation: "basic" })],
  });
  const rows = timeline.filter((row) => row.type === "basic" || row.type === "ultimate");
  assert.deepEqual(rows.map((row) => row.type), ["basic", "basic", "basic", "ultimate"]);
  near(rows[3].av, 300);
  near(units[0].energy, 6);
  assert.equal(units[0].ultimates, 1);
});

test("固定回能不吃能量恢复效率，且能在别人的回合里插大", () => {
  // b 在 50 给 a 固定 50 能量：a 从 50 到 100，当场开大；a 的第一动仍在 100
  const kit = onAct(({ engine }) => engine.gainEnergy(engine.unit("a"), 50, { fixed: true, reason: "充能" }));
  const { timeline } = simulate({
    maxAV: 100,
    units: [unit("a", 100, { err: 50 }), unit("b", 200, { kit })],
  });
  const ult = timeline.find((row) => row.type === "ultimate");
  assert.ok(ult);
  near(ult.av, 50);
  assert.equal(ult.name, "a");
  assertAvs(avOf(timeline, "a"), [100]);
});

test("开局结算期间不插大，结束后按消耗连续施放", () => {
  // 上限 480、每次消耗 240、开局 480：AV 0 连放两次，保留剩余能量 0
  const { timeline, units } = simulate({
    maxAV: 1,
    units: [unit("a", 100, { maxEnergy: 480, ultCost: 240, initialEnergy: 480, energyGains: { ultimate: 0 } })],
  });
  const ults = timeline.filter((row) => row.type === "ultimate");
  assert.equal(ults.length, 2);
  ults.forEach((row) => near(row.av, 0));
  near(units[0].energy, 0);
  const battle = timeline.findIndex((row) => row.type === "battle");
  assert.ok(battle < timeline.indexOf(ults[0]));
});

test("额外回合期间不插大，结束后再放", () => {
  const kit = onAct(({ engine, self, extra }) => {
    if (extra) {
      engine.gainEnergy(self, 100, { fixed: true, reason: "充能" });
      assert.equal(self.ultimates, 0);
      return;
    }
    engine.extraTurn(self, "额外回合");
  });
  const { timeline, units } = simulate({
    maxAV: 100,
    units: [unit("a", 100, { kit, initialEnergy: 0, energyGains: { basic: 0, skill: 0, ultimate: 0 } })],
  });
  assert.equal(units[0].ultimates, 1);
  const types = timeline.map((row) => row.type);
  assert.ok(types.indexOf("ultimate") > types.indexOf("extra_turn"));
});

test("召唤物按自己的速度行动，暂停的单位不消耗距离", () => {
  // a 在 50 被暂停（还差 5000），90 速召唤物 10000/90 ≈ 111.11 AV 后解除，立即接着跑：
  // 再过 50 AV，即 50 + 111.11… + 50
  const countdown = 10000 / 90;
  let summoned = false;
  const kit = onAct(({ engine }) => {
    if (summoned) return;
    summoned = true;
    const a = engine.unit("a");
    a.paused = true;
    engine.addActor({
      name: "倒计时",
      speed: () => 90,
      onTurn: (actor) => {
        engine.record("summon", null, "倒计时归零", { kind: "summon", name: "倒计时" });
        engine.removeActor(actor);
        a.paused = false;
      },
    });
  });
  const { timeline } = simulate({
    maxAV: 220,
    units: [unit("a", 100), unit("b", 200, { kit })],
  });
  const summon = timeline.find((row) => row.type === "summon");
  assert.ok(summon);
  near(summon.av, 50 + countdown);
  assertAvs(avOf(timeline, "a"), [50 + countdown + 50]);
});

test("逐动覆盖优先于默认出招，用完后回到默认", () => {
  const { timeline } = simulate({
    units: [unit("a", 100, { rotation: "skill", script: ["basic"] })],
  });
  assert.deepEqual(turns(timeline).map((row) => row.type), ["basic", "skill", "skill"]);
});

test("轮次按模式结构计算", () => {
  const moc = new AxisEngine({ maxAV: 1, units: [unit("a", 100)] });
  assert.deepEqual([0, 150, 150.001, 250, 250.001, 350].map((av) => moc.cycleOf(av)), [0, 0, 1, 1, 2, 2]);
  const arbitration = new AxisEngine({
    maxAV: 1,
    cycle: { firstCycleAV: 300, cycleAV: 100 },
    units: [unit("a", 100)],
  });
  assert.deepEqual([150, 300, 300.001, 400, 400.001].map((av) => arbitration.cycleOf(av)), [0, 0, 1, 1, 2]);
});

test("时间轴超过上限时截断并给出警告", () => {
  const { timeline, warnings, truncated } = simulate({
    maxAV: 1000,
    maxTimeline: 5,
    units: [unit("a", 1000)],
  });
  assert.equal(timeline.length, 5);
  assert.equal(truncated, true);
  assert.ok(warnings.some((text) => text.includes("截断")));
});

test("依赖敌方的机制不触发，并在结果里逐条列出", () => {
  let fired = 0;
  const kit: CharacterKit = {
    id: "clara",
    enemyDependent: ["反击（受到攻击后）", "受击回能"],
    install: (engine) => {
      engine.on("unitHit", () => { fired += 1; });
      engine.on("enemyKilled", () => { fired += 1; });
      engine.on("weaknessBreak", () => { fired += 1; });
      engine.on("enemyAction", () => { fired += 1; });
    },
  };
  const { unsupported, warnings } = simulate({ units: [unit("克拉拉", 90, { kit })] });
  assert.equal(fired, 0);
  assert.deepEqual(unsupported, [
    { unit: "克拉拉", mechanic: "反击（受到攻击后）" },
    { unit: "克拉拉", mechanic: "受击回能" },
  ]);
  assert.ok(warnings.some((text) => text.includes("未计入") && text.includes("克拉拉：反击（受到攻击后）")));
});

test("资料来自测试版的角色，结果里明确提示", () => {
  const kit: CharacterKit = { id: "beta", dataNotice: "这名角色的资料来自测试版，实装时可能变化。" };
  const { warnings } = simulate({ units: [unit("某角色", 100, { kit })] });
  assert.ok(warnings.some((text) => text.includes("某角色") && text.includes("测试版")));
});

test("没有依赖敌方的角色时不产生未计入提示", () => {
  const { unsupported, warnings } = simulate({ units: [unit("a", 100)] });
  assert.deepEqual(unsupported, []);
  assert.deepEqual(warnings, []);
});

test("非法输入给出可读错误", () => {
  assert.throws(() => new AxisEngine({ maxAV: 300, units: [] }), /team 需要是 1~4 个成员/);
  const five = Array.from({ length: 5 }, (_, index) => unit(`u${index}`, 100));
  assert.throws(() => new AxisEngine({ maxAV: 300, units: five }), /team 最多 4 人/);
  assert.throws(() => new AxisEngine({ maxAV: 0, units: [unit("a", 100)] }), /maxAV 需要在 1~1000 之间/);
  assert.throws(() => new AxisEngine({ maxAV: 300, units: [unit("a", 0)] }), /a 的基础速度需要大于 0/);
  assert.throws(() => new AxisEngine({ maxAV: 300, units: [unit("a", 100), unit("a", 100)] }), /不能重复选择角色：a/);
});

test("模块钩子按注册顺序执行，且能读到事件参数", () => {
  const seen: string[] = [];
  const module = {
    id: "observer",
    install(engine: AxisEngine) {
      engine.on("battleStart", () => seen.push("battleStart"));
      engine.on("turnStart", ({ unit: actor }) => seen.push(`turnStart:${actor.id}`));
      engine.on("attack", ({ unit: actor, kind }) => seen.push(`attack:${actor.id}:${kind}`));
      engine.on("turnEnd", ({ unit: actor }) => seen.push(`turnEnd:${actor.id}`));
    },
  };
  simulate({ maxAV: 100, modules: [module], units: [unit("a", 100, { rotation: "basic" })] });
  assert.deepEqual(seen, ["battleStart", "turnStart:a", "attack:a:basic", "turnEnd:a"]);
});
