/**
 * 欢愉队机制的手算预期：公式和机制钉在确定性排轴上，从时间轴、单位和提示的账面验证。
 * 从 tests/test_toolbox.py 的 TestAhaSpeedSimulation 迁来，只改了写法，预期一个没动。
 * 走 legacy.ts，因为这些预期写的是旧结果结构（详情文案、好活当赏记账）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { legacyCatalog, simulateLegacy, thresholdLegacy } from "../../axis-engine/src/legacy.ts";

type Ev = any;
type Result = any;
type Payload = Record<string, unknown>;

const sim = (payload: Payload): Result => simulateLegacy(payload);
const labels = (res: Result, key: string): Ev[] => res.timeline.filter((ev: Ev) => ev.label.includes(key));
/** 某站位的常规行动时间点；额外回合不算（它不重置行动条距离）。 */
const actionAvs = (res: Result, slot: number): number[] =>
  res.timeline.filter((ev: Ev) => ev.slot === slot && !ev.extra && ["basic", "skill", "enhanced_basic"].includes(ev.type)).map((ev: Ev) => ev.av);
/** 热意快照的正向增量（每次队友攻击给多少热意）。 */
const fervorSteps = (res: Result): number[] => {
  const vals: number[] = res.timeline.map((ev: Ev) => ev.res.fervor).filter((value: number | null) => value !== null);
  const steps: number[] = [];
  for (let i = 1; i < vals.length; i += 1) if (vals[i] > vals[i - 1]) steps.push(Math.round((vals[i] - vals[i - 1]) * 1e6) / 1e6);
  return steps;
};
const unit = (res: Result, id: string): Ev => res.units.find((item: Ev) => item.id === id);
const near = (actual: number, expected: number, message = "", digits = 7) =>
  assert.ok(Math.abs(actual - expected) < 0.5 * 10 ** -digits, `${message} 期望 ${expected}，实际 ${actual}`);
const has = (list: string[], text: string) => assert.ok(list.includes(text), `应包含「${text}」，实际 ${JSON.stringify(list)}`);
const someNote = (res: Result, check: (note: string) => boolean) => res.notes.some(check);
const anyDetail = (res: Result, check: (detail: string) => boolean) => res.timeline.some((ev: Ev) => ev.details.some(check));
const elationSkills = (res: Result): Ev[] => res.timeline.filter((ev: Ev) => ev.type === "elation_skill");
const QUIET = { useTech: false, useAeonAha: false };
const descending = (values: number[]) => [...values].sort((a, b) => b - a);

// ---- 目录 ---- //

test("目录列出核心欢愉阵容，砂金(存护)是对照组不算欢愉", () => {
  const catalog = legacyCatalog() as Result;
  const byId = new Map<string, Ev>(catalog.roster.map((row: Ev) => [row.id, row]));
  const expected: Record<string, string> = {
    1511: "星神★阿哈", 1503: "真珠", 1513: "砂金•戏浪", 1304: "砂金(存护)",
    1502: "爻光", 1501: "火花", 8009: "开拓者•欢愉", 1505: "绯英", 1506: "银狼LV.999",
  };
  for (const [id, name] of Object.entries(expected)) assert.equal(byId.get(id)?.name, name);
  for (const id of ["1511", "1503", "1513", "1502", "1501", "8009", "1505", "1506"]) assert.ok(byId.get(id).elation, id);
  assert.ok(!byId.get("1304").elation);
  // 加权系数 0.2/0.1/0.05/0.025（除数 5/10/20/40）
  assert.deepEqual(catalog.ahaWeights.map((w: Ev) => [w.weight, w.divisor]), [[0.2, 5], [0.1, 10], [0.05, 20], [0.025, 40]]);
});

// ---- 【阿哈时刻】速度公式 ---- //

test("【阿哈时刻】速度 = 底速 + 0.2V1 + 0.1V2 + 0.05V3 + 0.025V4", () => {
  const cfg = { useTech: false, maxAV: 1 };
  const noAeon = sim({ team: [{ id: "1503" }, { id: "1513" }, { id: "1502" }, { id: "1501" }], useAeonAha: false, ...cfg });
  let vs = descending(noAeon.units.filter((u: Ev) => u.elation).map((u: Ev) => u.initialSpd));
  assert.deepEqual(vs, [116, 110, 108, 107]); // 砂金戏浪/爻光/真珠/火花
  assert.equal(noAeon.aha.useAeonAha, false);
  near(noAeon.aha.base, 80);
  near(noAeon.aha.speed, 80 + 0.2 * vs[0] + 0.1 * vs[1] + 0.05 * vs[2] + 0.025 * vs[3]);
  near(noAeon.aha.speed, 122.275);

  const withAeon = sim({ team: [{ id: "1511" }, { id: "1513" }, { id: "1502" }, { id: "1503" }], useAeonAha: true, ...cfg });
  vs = descending(withAeon.units.filter((u: Ev) => u.elation).map((u: Ev) => u.initialSpd));
  assert.deepEqual(vs, [116, 111, 110, 108]); // 1511 带专武：94+12+5 行迹
  assert.equal(withAeon.aha.useAeonAha, true);
  near(withAeon.aha.baseSpd, 94);
  near(withAeon.aha.lcBaseSpd, 12);
  near(withAeon.aha.base, 106); // 94 + 12（专武）
  near(withAeon.aha.speed, 106 + 0.2 * vs[0] + 0.1 * vs[1] + 0.05 * vs[2] + 0.025 * vs[3]);
  near(withAeon.aha.speed, 148.5);
  [[0.2, 5], [0.1, 10], [0.05, 20], [0.025, 40]].forEach(([weight, divisor], i) => {
    near(withAeon.aha.ranks[i].weight, weight);
    assert.equal(withAeon.aha.ranks[i].divisor, divisor);
  });
});

// ---- 真珠 ---- //

test("真珠终结技按欢愉人数拉【美学底本】10/15/30%，4 欢愉再给额外回合", () => {
  // 开局拉满让真珠在 0 AV 开大，目标第一动 = (10000 − 100×拉条%) ÷ 目标速度。
  // err 500：战技 30×6 = 180 = 上限，第一动必定开大，之后强化普攻压不满上限，窗口内没有第二个大。
  const pearl = { id: "1503", initAdv: 100, err: 500 };
  const quiet = { useTech: false, maxAV: 150 };

  let res = sim({ team: [{ ...pearl, targetSlot: 1 }, { id: "1304" }], ...quiet });
  has(labels(res, "鉴映灵魂的底色")[0].details, "欢愉 1 人 → 【美学底本】拉条 10%");
  near(actionAvs(res, 1)[0], (10000 - 1000) / 106);

  res = sim({ team: [{ ...pearl, targetSlot: 2 }, { id: "1501" }, { id: "1304" }], ...quiet });
  has(labels(res, "鉴映灵魂的底色")[0].details, "欢愉 2 人 → 【美学底本】拉条 15%");
  near(actionAvs(res, 2)[0], (10000 - 1500) / 106);

  // 3 欢愉拉 30%；E2 时其他欢愉队友一起拉
  const three = [{ ...pearl, targetSlot: 3 }, { id: "1501" }, { id: "1502" }, { id: "1304" }];
  res = sim({ team: three, ...quiet });
  has(labels(res, "鉴映灵魂的底色")[0].details, "欢愉 3 人 → 【美学底本】拉条 30%");
  near(actionAvs(res, 3)[0], (10000 - 3000) / 106, "砂金(存护)");
  near(actionAvs(res, 2)[0], 10000 / 110, "爻光没被拉");

  res = sim({ team: [{ ...three[0], eidolon: 2 }, ...three.slice(1)], ...quiet });
  has(labels(res, "鉴映灵魂的底色")[0].details, "E2：火花、爻光 也拉条 30%");
  near(actionAvs(res, 3)[0], (10000 - 3000) / 106, "美学底本照旧");
  near(actionAvs(res, 2)[0], (10000 - 3000) / 110, "E2：爻光也拉");
  near(actionAvs(res, 1)[0], (10000 - 3000) / 107, "E2：火花也拉");

  // 4 欢愉：拉 30% + 【美学底本】1 个额外回合（+60 笑点）
  res = sim({ team: [{ ...pearl, targetSlot: 1 }, { id: "1501" }, { id: "1502" }, { id: "8009" }], useTech: false, maxAV: 80 });
  const details = labels(res, "鉴映灵魂的底色")[0].details;
  has(details, "欢愉 4 人 → 【美学底本】拉条 30%");
  has(details, "4 欢愉：【美学底本】额外回合（+60 笑点，E2 +120）");
  assert.ok(!details.some((d: string) => d.startsWith("E2")), "E0 不提 E2 拉条");
  const extra = labels(res, "真珠终结技·【美学底本】额外回合");
  assert.equal(extra.length, 1);
  assert.ok(extra[0].extra);
  has(extra[0].details, "笑点 +60（额外回合结束时结算）");
  has(extra[0].details, "好活当赏 +30");
  has(labels(res, "额外回合笑点结算")[0].details, "回收 60 笑点");
  assert.equal(unit(res, "1501").extraTurnCount, 1);
  // 额外回合不重置行动条：常规第一动照样按 30% 拉条后的距离跑
  near(actionAvs(res, 1)[0], (10000 - 3000) / 107);

  // 行迹3【艺术壁垒】：【美学底本】（欢愉）开大 → 真珠 +90 固定能量
  res = sim({ team: [{ ...pearl, targetSlot: 1 }, { id: "1501", err: 500 }], useTech: false, maxAV: 90 });
  const barrier = labels(res, "艺术壁垒触发");
  assert.equal(barrier.length, 1);
  assert.deepEqual(barrier[0].details, ["真珠 +90 固定能量（不吃 ERR）"]);
  // err 500：90 要是吃 ERR 就变 540。最终停在 150（强化普攻 30×6=180 封顶后的溢出）。
  near(unit(res, "1503").finalEnergy, 150);
  assert.equal(unit(res, "1503").mechanics.barrierArmed, false, "触发后解除武装");
});

// ---- 星神★阿哈 ---- //

test("愿力来源、8 愿力开大、终结技拉条【阿哈时刻】、欢愉万相返还与 E6 首大", () => {
  // 开局给 7 差 1 点：第一动战技正好满 8，开大发生在行动中，拉条才不会被开局重置冲掉。
  const team = [{ id: "1511", eidolon: 1, initAdv: 30, targetSlot: 1 }, { id: "1503", targetSlot: 2 }, { id: "1513" }, { id: "1501" }];
  const cfg = { team, useTech: false, e1Wishpower: 7, maxAV: 200 };
  const res = sim(cfg);

  assert.deepEqual(labels(res, "E1 开局回能")[0].details, ["愿力 +7"]);
  const own = res.timeline.filter((ev: Ev) => ev.type === "skill" && ev.name === "星神★阿哈");
  assert.ok(own.some((ev: Ev) => ev.details.includes("愿力 +1")));
  assert.ok(labels(res, "自身动作回能").some((ev: Ev) => ev.details.includes("愿力 +1")));
  assert.deepEqual(labels(res, "【「欢愉」令使】回合开始")[0].details, ["星神★阿哈愿力 +1"]);
  // 【艺术壁垒】进入战斗就武装，真珠会更早开大，好活当赏和笑点让笑点池冲过 40。
  assert.ok(someNote(res, (note) => note.includes("笑点首达 40")));
  // 时间轴上也有一行，次数和提示一致，用户能逐条对愿力。
  assert.equal(labels(res, "天赋：笑点首达 40").length, res.notes.filter((note: string) => note.startsWith("笑点首达 40")).length);
  assert.equal(labels(res, "天赋：笑点首达 40")[0].details[0], "愿力 +1");
  assert.deepEqual(labels(res, "戏中人的异想国")[0].details, ["真珠战技群疗 → 愿力 +1"]);
  assert.ok(unit(res, "1511").mechanics.wishpowerTotal >= 12);

  // 8 愿力开大：消耗 8 愿力、拉条【阿哈时刻】20%、进【欢愉万相】3 回合
  const ults = res.timeline.filter((ev: Ev) => ev.type === "ultimate" && ev.name === "星神★阿哈");
  assert.ok(ults.some((ev: Ev) => ev.details.includes("消耗 8 愿力")));
  has(labels(res, "啊哈！宇宙笑点大爆炸")[0].details, "【阿哈时刻】拉条 20%");
  assert.ok(someNote(res, (note) => note.includes("星神★阿哈进入【欢愉万相】3 回合")));
  assert.ok(labels(res, "【阿哈时刻】笑点结算")[0].details.some((d: string) => d.startsWith("欢愉万相返还 10%")));

  // 拉条 20% = 距离减 2000：下一次【阿哈时刻】正好提前 2000/速度 的行动值
  const firstAha = (r: Result): number => r.timeline.find((ev: Ev) => ev.type === "aha").av;
  const pulled = sim({ ...cfg, ultAdvanceAha: 20 });
  const plain = sim({ ...cfg, ultAdvanceAha: 0 });
  near(firstAha(plain) - firstAha(pulled), 2000 / pulled.aha.speed, "", 6);

  // E6 首次终结技：拉条 100% → 【阿哈时刻】在同一行动值接上，并 +100 笑点进池。旧参数 extra40 不再改行为。
  const adv = sim({ team: [{ ...team[0], eidolon: 6 }, ...team.slice(1)], useTech: false, e1Wishpower: 7, maxAV: 200, e6FirstUltMode: "extra40" });
  const boom = labels(adv, "啊哈！宇宙笑点大爆炸")[0].details;
  has(boom, "E6 首次终结技：【阿哈时刻】拉条 100% + 笑点 +100");
  assert.ok(!boom.join(" ").includes("计入 40 笑点的额外回合"));
  const ultAv = adv.timeline.find((ev: Ev) => ev.type === "ultimate" && ev.name === "星神★阿哈").av;
  near(firstAha(adv), ultAv);
  assert.ok(adv.summary.punchlineGranted >= 100);
});

// ---- 砂金•戏浪 ---- //

test("砂金•戏浪终结技自提速 4 回合，【阿哈时刻】加权跟着变", () => {
  const res = sim({ team: [{ id: "1513", err: 500 }, { id: "1503", targetSlot: 3 }, { id: "1502" }, { id: "1501" }], useTech: false, maxAV: 120 });
  assert.deepEqual(labels(res, "胜局，凌越飓浪之上")[0].details, ["笑点 +6", "热意 +8", "自身速度 +30%（4 回合）", "基础回能返还 +5 × (1+ERR)"]);
  near(unit(res, "1513").finalSpd, 107 * 1.3 + 9); // 148.1
  near(res.aha.speed, 122.275, "开大前的加权");
  near(res.aha.finalSpeed, 80 + 0.2 * 148.1 + 0.1 * 110 + 0.05 * 108 + 0.025 * 107, "提速后他是最快的欢愉");

  // 开局 50% 能量让第一动就能开大，开大后各行动间隔按 148.1 跑
  const long = sim({ team: [{ id: "1513" }, { id: "1503", targetSlot: 3 }, { id: "1502" }, { id: "1501" }], useTech: false, maxAV: 750 });
  const avs = actionAvs(long, 0);
  assert.ok(avs.length >= 4);
  near(avs[1] - avs[0], 10000 / 116, "开大前", 6);
  near(avs[2] - avs[1], 10000 / 148.1, "提速生效", 6);
  assert.ok(anyDetail(long, (d) => d === "自身速度 +30%（4 回合）"));
});

test("热意：天赋 +1、行迹 +2，满 10 回合外放《举杯！敬炽烈一夏》，都不进笑点池", () => {
  // 1513 压到 10 速：只有队友在打人，热意增量干净（1 / 2 / 一次攻击 3）
  const res = sim({ team: [{ id: "1513", baseSpd: 1 }, { id: "1309", rotation: "basic" }, { id: "1313", rotation: "basic" }], useTech: false, maxAV: 350 });
  const steps = fervorSteps(res);
  for (const step of [1, 2, 3]) assert.ok(steps.includes(step), `热意增量应有 ${step}`);
  const juban = labels(res, "举杯！敬炽烈一夏（回合外欢愉技）");
  assert.equal(juban.length, 1);
  assert.ok(juban[0].extra);
  assert.deepEqual(juban[0].details, ["好活当赏计入 20（不进笑点池）", "下一次【阿哈时刻】欢愉技升级为《All in！》", "基础回能 5 × (1+ERR)"]);
  near(juban[0].res.fervor, 10, "过 10 阈值立刻触发");
  near(juban[0].res.punchline, res.timeline[res.timeline.indexOf(juban[0]) - 1].res.punchline, "举杯不往笑点池加 20");
  assert.ok(unit(res, "1513").mechanics.haohuo.some((item: Ev) => item.label === "举杯！敬炽烈一夏" && item.count === 20));
  const allin = labels(res, "All in！敬炽烈一夏（欢愉技）");
  assert.equal(allin.length, 1);
  has(allin[0].details, "消耗全部热意");
  has(allin[0].details, "好活当赏计入 20（不进笑点池）");
  near(allin[0].res.punchline, res.timeline[res.timeline.indexOf(allin[0]) - 1].res.punchline, "All in 不允许再 +20");
});

test("单欢愉只有【纵享惊涛】固定 +25，三赌牌局再给全队 15%", () => {
  let res = sim({ team: [{ id: "1513", baseSpd: 1 }, { id: "1304", rotation: "basic" }], useTech: false, maxAV: 110 });
  assert.ok(someNote(res, (note) => note.includes("【纵享惊涛】触发")));
  near(res.aha.flatBonus, 25);
  near(res.aha.speed, 82, "80 + 0.2×10");
  near(res.aha.finalSpeed, 107, "就是 +25");
  assert.equal(res.resources.sanduActive, false);
  near(unit(res, "1304").finalSpd, 106);

  res = sim({ team: [{ id: "1511", eidolon: 1, e1Wishpower: 8, targetSlot: 2 }, { id: "1513" }, { id: "1304", rotation: "basic" }], useTech: false, maxAV: 120 });
  assert.equal(res.resources.sanduActive, true);
  assert.ok(someNote(res, (note) => note.includes("三赌牌局生效：全队速度 +15%")));
  near(unit(res, "1513").initialSpd, 116, "开局记账还没生效");
  near(unit(res, "1513").finalSpd, 107 * 1.15 + 9); // 132.05
  near(unit(res, "1511").finalSpd, (94 + 12) * 1.15 + 5); // 126.9
  near(unit(res, "1304").finalSpd, 106 * 1.15); // 121.9
  near(res.aha.flatBonus, 25);
  near(res.aha.finalSpeed, 106 + 0.2 * unit(res, "1513").finalSpd + 0.1 * unit(res, "1511").finalSpd + 25);
});

// ---- 速度阈值反推 ---- //

test("需求速度 = 10000 × (动数 − 拉条%/100) ÷ 目标行动值", () => {
  const zero = thresholdLegacy({ targetAV: 150, actions: 2, advancePct: 0 }) as Result;
  near(zero.requiredSpeed, 10000 * 2 / 150, "", 9);
  near(zero.requiredSpeed, 133.33, "", 2);
  const pulled = thresholdLegacy({ targetAV: 150, actions: 2, advancePct: 40 }) as Result;
  near(pulled.requiredSpeed, 10000 * 1.6 / 150, "", 9);
  near(pulled.requiredSpeed, 106.67, "", 2);
  // t 写法与 targetAV 写法同一条口径（150 AV 就是 0T）
  const byT = thresholdLegacy({ t: 0, actions: 2, advancePct: 40 }) as Result;
  near(byT.requiredSpeed, pulled.requiredSpeed, "", 9);
  assert.equal(byT.t, 0);
});

// ---- 笑点口径 ---- //

test("单火花没人出招：第一次【阿哈时刻】消耗 0，欢愉技不灌池", () => {
  const res = sim({ maxAV: 130, ...QUIET, team: [{ id: "1501", baseSpd: 1, traceSpd: 0, elation: true }] });
  const spark = res.units[0];
  assert.equal(res.summary.punchlineGranted, 0);
  assert.equal(res.summary.punchlineConsumed, 0);
  assert.equal(res.resources.punchline, 0);
  assert.equal(spark.actionCount, 0);
  assert.deepEqual(spark.mechanics.haohuo, []);
  const skills = elationSkills(res);
  assert.deepEqual(skills.map((ev: Ev) => ev.label), ["火花 的欢愉技"]);
  assert.deepEqual(skills[0].details, ["不产生笑点", "基础回能 5 × (1+ERR)"]);
  assert.deepEqual(labels(res, "【阿哈时刻】笑点结算")[0].details, ["消耗笑点 0"]);
  assert.ok(!JSON.stringify(res.timeline).includes("固定 +20 笑点"));
  near(skills[0].av, 10000 / 80.2, "", 4);
});

test("秘技额外回合按 20 记账不进池；E6 首大是进池的 100 笑点", () => {
  const tech = sim({ maxAV: 1, useTech: true, useAeonAha: true, team: [{ id: "1511" }, { id: "1501" }, { id: "8009" }, { id: "1503", targetSlot: 1 }] });
  assert.equal(tech.summary.punchlineGranted, 0);
  assert.equal(tech.summary.punchlineConsumed, 0);
  assert.equal(tech.resources.punchline, 0);
  assert.equal(tech.aha.extraTriggerCount, 1);
  assert.equal(tech.aha.triggerCount, 0);
  assert.ok(!someNote(tech, (note) => note.includes("笑点首达 40")));
  assert.deepEqual(elationSkills(tech).map((ev: Ev) => ev.name), ["真珠", "开拓者•欢愉", "火花", "星神★阿哈"]);
  assert.equal(unit(tech, "1511").mechanics.wishpower, 1);
  for (const item of tech.units) {
    const haohuo = item.mechanics.haohuo;
    assert.ok(haohuo.some((row: Ev) => row.label === "真珠秘技" && row.count === 20), item.id);
    assert.ok(haohuo.some((row: Ev) => row.label === "阿哈时刻额外回合" && row.count === 20), item.id);
  }

  const extra = sim({
    maxAV: 30, useTech: false, trace3Advance: false, e1Wishpower: 8, e6FirstUltMode: "extra40",
    team: [{ id: "1511", eidolon: 6, baseSpd: 1, traceSpd: 0, initAdv: 0, rotation: "basic", lcBaseSpd: 0, equipment: { hasSigLc: false } }],
  });
  assert.ok(extra.summary.punchlineGranted >= 100);
  assert.equal(extra.aha.extraTriggerCount, 0);
  has(labels(extra, "啊哈！宇宙笑点大爆炸")[0].details, "E6 首次终结技：【阿哈时刻】拉条 100% + 笑点 +100");
  assert.ok(!JSON.stringify(extra.timeline).includes("计入 40"));
  const hits = extra.notes.filter((note: string) => note.startsWith("笑点首达 40"));
  assert.equal(hits.length, 1);
  assert.ok(hits[0].includes("全队暴伤 +40%"));
});

test("欢愉技和绯英转移不凭空生成笑点，也不连触发两次首达 40", () => {
  const res = sim({ maxAV: 1, useTech: true, team: [{ id: "1511" }, { id: "1506" }, { id: "1505" }, { id: "1501" }] });
  assert.equal(res.summary.punchlineGranted, 0);
  assert.equal(res.summary.punchlineConsumed, 0);
  assert.ok(!someNote(res, (note) => note.includes("笑点首达 40")));
  const wolf = unit(res, "1506");
  const fei = unit(res, "1505");
  assert.equal(wolf.ultCount, 0);
  assert.equal(wolf.finalEnergy, 15, "只有银狼自己的欢愉技 +15");
  // 240 开局 + 20 秘技 + 5 欢愉技回能 + 5 附加好活当赏 + 20 阿哈额外回合好活当赏
  // + 阿哈/火花编号更小，各转移 10；银狼编号 999 不转移。310 - 240 + 5 = 75。
  assert.equal(fei.finalEnergy, 75);
  assert.equal(unit(res, "1511").mechanics.wishpower, 1);
  assert.ok(fei.mechanics.haohuo.some((item: Ev) => item.label === "阿哈时刻额外回合" && item.count === 20));
  assert.ok(!JSON.stringify(res.timeline).includes("固定 +20 笑点"));
});

test("首达 40 的暴伤是 40%；额外回合也清标志，但池子仍 ≥40 时继续加笑点不再触发", () => {
  const frozen = sim({
    maxAV: 120, useTech: false, trace3Advance: false, e1Wishpower: 0, ahaSpdPct: -99, sigLcPunchline: 100,
    team: [
      { id: "1511", baseSpd: 200, traceSpd: 0, initAdv: 100, rotation: "skill", equipment: { hasSigLc: true } },
      { id: "1502", baseSpd: 180, traceSpd: 0, initAdv: 100, err: 500, rotation: "skill" },
    ],
  });
  let hits = frozen.notes.filter((note: string) => note.startsWith("笑点首达 40"));
  assert.equal(hits.length, 1);
  assert.ok(hits[0].includes("全队暴伤 +40%"));
  assert.ok(!hits[0].includes("24%"));
  assert.equal(frozen.summary.punchlineConsumed, 0);
  assert.ok(frozen.aha.extraTriggerCount >= 1);
  assert.ok(frozen.resources.punchline >= 40);
  assert.ok(!JSON.stringify(frozen.timeline).includes("固定 +20 笑点"));

  const reset = sim({
    maxAV: 160, useTech: false, trace3Advance: false, e1Wishpower: 0, sigLcPunchline: 100,
    team: [{ id: "1511", baseSpd: 200, traceSpd: 0, rotation: "skill", equipment: { hasSigLc: true } }],
  });
  hits = reset.notes.filter((note: string) => note.startsWith("笑点首达 40"));
  assert.equal(hits.length, 2);
  assert.ok(hits.every((note: string) => note.includes("全队暴伤 +40%")));
  assert.ok(reset.summary.punchlineConsumed >= 100);
  assert.ok(reset.aha.triggerCount >= 1);
});

// ---- 升格（欢愉万相）---- //

const SLOW_AHA = { id: "1511", eidolon: 1, baseSpd: 1, traceSpd: 0, lcBaseSpd: 0, rotation: "basic", equipment: { hasSigLc: false } };
const ASCENDED = { useTech: false, trace3Advance: false, e1Wishpower: 8 };

test("爻光心灵感应：升格期间【大吉大利】按 24%，终结技带 +12 能量 +10 笑点", () => {
  const res = sim({
    maxAV: 90, ...ASCENDED, ahaAdvancePct: 100,
    team: [SLOW_AHA, { id: "1502", baseSpd: 200, traceSpd: 0, err: 500, initAdv: 100, rotation: "skill" }],
  });
  const ults = labels(res, "爻光终结技");
  assert.ok(ults.length > 0);
  assert.ok(ults.some((ev: Ev) => ev.details.some((d: string) => d.includes("【大吉大利】倍率提高原倍率的 20%"))));
  assert.ok(ults.some((ev: Ev) => ev.details.some((d: string) => d.includes("+12 固定能量 +10 笑点"))));
  assert.deepEqual(labels(res, "大吉大利")[0].details, ["【大吉大利】欢愉伤害 24%（原倍率 20% × 1.20）", "固有行迹【欢愉万相★心灵感应】：倍率提高原倍率的 20%", "不视为 1 次攻击"]);
  const plain = sim({ maxAV: 40, ...QUIET, team: [{ id: "1502", baseSpd: 200, traceSpd: 0, err: 500, initAdv: 100, rotation: "skill" }] });
  assert.ok(!anyDetail(plain, (d) => d.includes("心灵感应")));
  assert.equal(labels(plain, "大吉大利").length, 0);
});

test("升格跟着【欢愉万相】：开大置 3，阿哈自己每回合开始 -1，第三次行动开始时结束", () => {
  const slow = { ...SLOW_AHA, baseSpd: 100 };
  const res = sim({ maxAV: 350, ...ASCENDED, team: [slow] });
  assert.ok(someNote(res, (n) => n.includes("星神★阿哈进入【欢愉万相】3 回合")));
  assert.ok(someNote(res, (n) => n.includes("固有行迹【欢愉万相★无中生有】1级") && n.includes("暴击率 +12%") && n.includes("无视防御 30%")));
  assert.ok(someNote(res, (n) => n.includes("不另做强化")));
  const end = labels(res, "【欢愉万相】结束");
  assert.equal(end.length, 1);
  near(end[0].av, actionAvs(res, 0)[2]);
  const e2 = sim({ maxAV: 5, ...ASCENDED, team: [{ ...slow, eidolon: 2, baseSpd: 1 }] });
  assert.ok(someNote(e2, (n) => n.includes("固有行迹【欢愉万相★无中生有】2级") && n.includes("暴击率 +20%") && n.includes("无视防御 60%") && n.includes("返还消耗笑点的 10%")));
});

test("兔子戏法只在升格后写在欢愉技上，不额外加笑点", () => {
  const plain = sim({ maxAV: 130, ...QUIET, team: [{ id: "1501", baseSpd: 1, traceSpd: 0 }] });
  assert.deepEqual(elationSkills(plain)[0].details, ["不产生笑点", "基础回能 5 × (1+ERR)"]);
  const res = sim({ maxAV: 80, ...ASCENDED, aeonAhaBaseSpd: 200, aeonAhaLcBaseSpd: 0, team: [SLOW_AHA, { id: "1501", baseSpd: 1, traceSpd: 0 }] });
  const skills = elationSkills(res).filter((ev: Ev) => ev.name === "火花");
  assert.ok(skills.length > 0);
  assert.equal(skills[0].details[0], "不产生笑点");
  assert.ok(skills[0].details.some((d: string) => d.includes("兔子戏法") && d.includes("50%")));
  assert.ok(someNote(res, (n) => n.includes("不加这份笑点")));
  assert.equal(res.summary.punchlineGranted, 0);
});

test("升格后，开拓者终结技打中阿哈时先放自己的欢愉技", () => {
  const res = sim({ maxAV: 20, ...ASCENDED, team: [SLOW_AHA, { id: "8009", err: 500, initAdv: 100, baseSpd: 200, traceSpd: 0, targetSlot: 0 }] });
  const skills = elationSkills(res);
  assert.ok(skills.length >= 2);
  assert.deepEqual(skills.slice(0, 2).map((ev: Ev) => ev.name), ["开拓者•欢愉", "星神★阿哈"]);
  assert.ok(anyDetail(res, (d) => d.includes("主角光环")));
  assert.equal(res.summary.punchlineGranted, 8);
});

test("跃然纸上：升格后额外回合结束，该次好活当赏收到 10%，笑点 10% 不重复加", () => {
  const res = sim({
    maxAV: 20, ...ASCENDED,
    team: [SLOW_AHA, { id: "1503", initAdv: 100, err: 500, targetSlot: 2 }, { id: "1501", baseSpd: 1, traceSpd: 0 }, { id: "1502", baseSpd: 1, traceSpd: 0 }],
  });
  const haohuo = unit(res, "1501").mechanics.haohuo;
  assert.deepEqual(haohuo.filter((item: Ev) => item.label === "真珠终结技·【美学底本】额外回合").map((item: Ev) => item.count), [3]);
  assert.ok(haohuo.some((item: Ev) => item.label === "真珠终结技" && item.count === 20));
  has(labels(res, "欢愉万相★跃然纸上")[0].details, "额外回合结束保留该次好活当赏的 10%（3.00）");
  has(labels(res, "额外回合笑点结算")[0].details, "回收 60 笑点（欢愉万相返还 10%）");
});

test("升格后新获得的好活当赏把真珠自己夹到 75，队友不夹", () => {
  const res = sim({
    maxAV: 80, ...ASCENDED, aeonAhaBaseSpd: 200, aeonAhaLcBaseSpd: 0,
    team: [{ ...SLOW_AHA, eidolon: 6 }, { id: "1503", baseSpd: 1, traceSpd: 0, targetSlot: 2 }, { id: "1501", baseSpd: 1, traceSpd: 0 }],
  });
  const total = (id: string) => unit(res, id).mechanics.haohuo.reduce((sum: number, item: Ev) => sum + item.count, 0);
  near(total("1503"), 75);
  // E6 首次拉条保留：0 AV 消耗 100，后续自然阿哈再消耗返还的 10。
  near(total("1501"), 110);
});

const PEARL_PULL = { id: "1503", initAdv: 100, err: 0, baseSpd: 200, traceSpd: 0, targetSlot: 0 };

test("全息幻象：升格后好活当赏的 20% 进隐藏分，没升格不加", () => {
  const team = [SLOW_AHA, PEARL_PULL, { id: "1506", baseSpd: 1, traceSpd: 0 }];
  const res = sim({ maxAV: 5, ...ASCENDED, team });
  const wolf = unit(res, "1506");
  // 真珠在 0 AV 开大，全队好活当赏 20，银狼按升格规则拿 20% = 4。
  near(wolf.finalEnergy, 4);
  near(wolf.mechanics.hiddenOverflow, 0);
  assert.equal(wolf.ultCount, 0);
  assert.ok(anyDetail(res, (d) => d.includes("好活当赏 20 的 20% → 隐藏分 +4.00")));
  const plain = sim({ maxAV: 5, ...QUIET, team: team.slice(1) });
  assert.equal(unit(plain, "1506").finalEnergy, 0);
  assert.ok(!plain.timeline.some((ev: Ev) => ev.label.includes("全息幻象")));
});

test("书中折花：升格后能量可溢出最多 60，开大后写回来，不走好活当赏回能", () => {
  const res = sim({
    maxAV: 5, ...ASCENDED, feiyingHaohuoEnergyMode: "flat", feiyingHaohuoEnergy: 500,
    team: [SLOW_AHA, PEARL_PULL, { id: "1505", baseSpd: 1, traceSpd: 0 }],
  });
  const note = labels(res, "欢愉万相★书中折花");
  assert.ok(note.length > 0);
  assert.ok(note.some((ev: Ev) => ev.details.some((d: string) => d.includes("溢出能量 60.00"))));
  assert.ok(note.some((ev: Ev) => ev.details.some((d: string) => d.includes("不触发天赋好活当赏"))));
  near(unit(res, "1505").finalEnergy, 70); // 540 - 2×240 + 2×5
  assert.ok(unit(res, "1505").ultCount >= 1);
});

// ---- 其他机制 ---- //

test("星神★阿哈普攻是 +1 愿力，不是把标准能量 +20 灌进愿力", () => {
  const res = sim({
    maxAV: 5, useTech: false, trace3Advance: false, e1Wishpower: 0,
    team: [{ id: "1511", baseSpd: 1, traceSpd: 0, initAdv: 100, rotation: "basic", lcBaseSpd: 0, equipment: { hasSigLc: false } }],
  });
  const basic = res.timeline.filter((ev: Ev) => ev.type === "basic");
  assert.equal(basic.length, 1);
  assert.deepEqual(basic[0].details, ["愿力 +1"]);
  assert.equal(res.units[0].mechanics.wishpower, 1);
  assert.equal(res.units[0].mechanics.wishpowerTotal, 1);
  assert.equal(res.units[0].ultCount, 0);
  assert.ok(!JSON.stringify(basic).includes("基础回能 20"));
});

test("队里没有可施放欢愉技的角色时走保底，不伪造欢愉技、不加笑点", () => {
  const res = sim({ maxAV: 130, ...QUIET, team: [{ id: "1304", baseSpd: 1, traceSpd: 0 }] });
  const laugh = labels(res, "Let There Be Laughter");
  assert.equal(laugh.length, 1);
  assert.deepEqual(laugh[0].details, ["场上没有可施放欢愉技的角色", "保底效果（文档未给数值，不产笑点、不改笑点池）"]);
  assert.equal(elationSkills(res).length, 0);
  assert.equal(res.summary.punchlineGranted, 0);
  assert.equal(res.summary.punchlineConsumed, 0);
  assert.deepEqual(res.units[0].mechanics.haohuo, []);
  assert.ok(!JSON.stringify(res.timeline).includes("固定 +20 笑点"));
});

test("星神★阿哈无视站位，欢愉技始终最后放", () => {
  const res = sim({
    maxAV: 60, useTech: false, trace3Advance: false, e1Wishpower: 0, aeonAhaBaseSpd: 200, aeonAhaLcBaseSpd: 0,
    team: [{ id: "1511", baseSpd: 1, traceSpd: 0, lcBaseSpd: 0, equipment: { hasSigLc: false } }, { id: "1501", baseSpd: 1, traceSpd: 0 }, { id: "1503", baseSpd: 1, traceSpd: 0, targetSlot: 1 }],
  });
  assert.deepEqual(elationSkills(res).map((ev: Ev) => ev.name), ["真珠", "火花", "星神★阿哈"]);
});

// 旧格式的 godJoy 开关只在这条冻结路径上（旧引擎基准用）。页面把它换成 329 套装，开局拉条见 gear.test.ts。
test("神的瞬息欢愉只记 +6% 速度；没模拟欢愉度，不开局 40% 拉条", () => {
  const res = sim({ maxAV: 100, ...QUIET, team: [{ id: "1304", equipment: { godJoy: true } }] });
  assert.deepEqual(labels(res, "神的瞬息欢愉")[0].details, ["速度 +6% 已计入", "开局 40% 拉条需要欢愉度 ≥ 40%（本工具不模拟欢愉度，因此不拉条）"]);
  near(res.units[0].initialSpd, 106 * 1.06);
  near(actionAvs(res, 0)[0], 10000 / (106 * 1.06));
});

test("开拓者终结技：目标有欢愉技则计入 20 且不进池；没有则只拉条 50%", () => {
  const trailblazer = { id: "8009", err: 500, initAdv: 100, baseSpd: 200, traceSpd: 0, targetSlot: 1 };
  const forced = sim({ maxAV: 20, ...QUIET, team: [trailblazer, { id: "1501", baseSpd: 1, traceSpd: 0 }] });
  const note = labels(forced, "开拓者•欢愉终结技")[0];
  const skill = elationSkills(forced);
  assert.equal(skill.length, 1);
  assert.deepEqual(skill[0].details, ["不产生笑点", "基础回能 5 × (1+ERR)"]);
  // 终结技自己的 +5 发生在备注快照之后、欢愉技之前
  near(skill[0].res.punchline, note.res.punchline + 5);
  assert.equal(forced.summary.punchlineGranted, 8);
  assert.equal(forced.summary.punchlineConsumed, 0);
  assert.ok(unit(forced, "1501").mechanics.haohuo.some((item: Ev) => item.label === "开拓者终结技·计入笑点" && item.count === 20));
  assert.ok(!JSON.stringify(forced.timeline).includes("固定 +20 笑点"));

  const pulled = sim({ maxAV: 40, ...QUIET, team: [trailblazer, { id: "1304", baseSpd: 100, traceSpd: 0 }] });
  has(labels(pulled, "开拓者•欢愉终结技")[0].details, "砂金(存护) 拉条 50%");
  assert.equal(elationSkills(pulled).length, 0);
  assert.ok(pulled.units.every((u: Ev) => u.mechanics.haohuo.every((item: Ev) => item.label !== "开拓者终结技·计入笑点")));
  assert.equal(pulled.summary.punchlineGranted, 8);
});

// ---- 能量 ---- //

test("标准能量角色进战 = 上限 50%；愿力、隐藏分从 0 开始", () => {
  let res = sim({ maxAV: 1, useTech: false, team: [{ id: "1503" }, { id: "1513" }, { id: "1505" }, { id: "1511" }] });
  near(unit(res, "1503").finalEnergy, 90);
  near(unit(res, "1513").finalEnergy, 65);
  near(unit(res, "1505").initialEnergy, 240);
  near(unit(res, "1505").finalEnergy, 5, "进战即可开大");
  near(unit(res, "1511").finalEnergy, 0, "愿力");
  res = sim({ maxAV: 1, useTech: false, team: [{ id: "1506" }] });
  near(res.units[0].finalEnergy, 0, "隐藏分");
});

test("欢愉技基础回能 5 × ERR", () => {
  const res = sim({ maxAV: 130, useTech: false, useAeonAha: true, aeonAhaBaseSpd: 200, aeonAhaLcBaseSpd: 0, team: [{ id: "1503", baseSpd: 1, traceSpd: 0, err: 100 }] });
  has(elationSkills(res)[0].details, "基础回能 5 × (1+ERR)");
  near(unit(res, "1503").finalEnergy, 110); // 开局 90 + 两次欢愉技各 10（5 × 2.0）
});

test("真珠强化普攻基础回能 30", () => {
  const res = sim({ maxAV: 1, useTech: true, useAeonAha: false, team: [{ id: "1503", baseSpd: 1, traceSpd: 0, initAdv: 100 }] });
  has(labels(res, "行笔，幻造星月")[0].details, "基础回能 30 × (1+ERR)");
});

test("火花战技回合：战技 0 能量、同回合强化普攻 40 × ERR", () => {
  const res = sim({ maxAV: 1, ...QUIET, team: [{ id: "1501", baseSpd: 1, traceSpd: 0, initAdv: 100, err: 100 }] });
  has(res.timeline.find((ev: Ev) => ev.type === "skill").details, "战技本身 0 能量");
  has(labels(res, "百花齐放，胜者独享！")[0].details, "基础回能 40 × (1+ERR)");
  near(res.units[0].finalEnergy, 10); // 开局 80 + 40×2 = 160 满能量立刻开大，返还 5×2
});

test("绯英按普通能量角色：战技 30 × ERR，终结技返还 5 × ERR", () => {
  const res = sim({ maxAV: 1, ...QUIET, team: [{ id: "1505", baseSpd: 1, traceSpd: 0, initAdv: 100, err: 100 }] });
  assert.equal(res.units[0].energyType, "standard");
  has(res.timeline.find((ev: Ev) => ev.type === "skill").details, "基础回能 30 × (1+ERR)");
  near(res.units[0].finalEnergy, 70); // 240 - 240 + 5×2 + 30×2
});

test("好活当赏转能量单次不超过 100", () => {
  const res = sim({ maxAV: 1, useTech: true, useAeonAha: false, team: [{ id: "1503", baseSpd: 1, traceSpd: 0, initAdv: 100 }, { id: "1505", baseSpd: 1, traceSpd: 0 }] });
  const notes = res.timeline.filter((ev: Ev) => ev.label.startsWith("绯英回能·好活当赏"));
  assert.ok(notes.length > 0);
  for (const ev of notes) assert.ok(ev.res.energyRequested <= 100);
});

test("银狼只吃自己的欢愉技 +15，队友欢愉技不给隐藏分", () => {
  const res = sim({ maxAV: 60, useTech: false, useAeonAha: true, aeonAhaBaseSpd: 200, aeonAhaLcBaseSpd: 0, team: [{ id: "1506", baseSpd: 1, traceSpd: 0 }, { id: "1503", baseSpd: 1, traceSpd: 0 }] });
  near(unit(res, "1506").finalEnergy, 15);
  assert.ok(!res.timeline.some((ev: Ev) => ev.res.energy === 30));
});

test("银狼基础天赋可溢出 240（合计 300）；【无敌玩家】期间不能再开大", () => {
  const res = sim({ maxAV: 1, useTech: true, useAeonAha: false, team: [{ id: "1503", baseSpd: 1, traceSpd: 0, initAdv: 100, targetSlot: 1 }, { id: "1506", baseSpd: 1, traceSpd: 0 }] });
  const wolf = unit(res, "1506");
  assert.ok(wolf.finalEnergy + wolf.mechanics.hiddenOverflow <= 300);
  const inv = sim({
    maxAV: 250, ...QUIET, sigLcPunchline: 100,
    team: [{ id: "1511", baseSpd: 200, traceSpd: 0, rotation: "skill", equipment: { hasSigLc: true } }, { id: "1506", baseSpd: 200, traceSpd: 0, initAdv: 100, eidolon: 1 }],
  });
  const firstExit = inv.timeline.find((ev: Ev) => ev.label.includes("退出【无敌玩家】")).av;
  const inWindow = (type: string) => inv.timeline.filter((ev: Ev) => ev.type === type && ev.name === "银狼LV.999" && ev.av <= firstExit + 1e-9);
  assert.equal(inWindow("ultimate").length, 1, "无敌期间只有开大那一次");
  assert.equal(inWindow("enhanced_basic").length, 3);
});

test("【协奏】期间知更鸟本体不行动，倒计时归零后立即行动", () => {
  const res = sim({ maxAV: 250, ...QUIET, team: [{ id: "1309", baseSpd: 200, traceSpd: 0, initAdv: 100, err: 500 }, { id: "1304", baseSpd: 1, traceSpd: 0 }] });
  const avs = actionAvs(res, 0);
  near(avs[0], 0, "开局立即行动开大");
  near(avs[1], 10000 / 90, "协奏倒计时归零后才再动");
  assert.ok(!avs.some((av) => av > 0 && av < 10000 / 90));
});

test("知更鸟战技 35（30 + 行迹 5），我方攻击给天赋回能", () => {
  const res = sim({ maxAV: 60, ...QUIET, team: [{ id: "1309", baseSpd: 1, traceSpd: 0, initAdv: 100 }, { id: "1304", baseSpd: 200, traceSpd: 0 }] });
  has(res.timeline.find((ev: Ev) => ev.type === "skill" && ev.name === "知更鸟").details, "基础回能 35（战技 30 + 行迹【模进乐段】5）× (1+ERR)");
  assert.ok(unit(res, "1309").finalEnergy > 0);
});

test("星期日行迹【崇高拂尘】开局 +25；E4 回合开始 +8", () => {
  let res = sim({ maxAV: 1, ...QUIET, team: [{ id: "1313", baseSpd: 1, traceSpd: 0, eidolon: 4 }] });
  assert.ok(res.timeline.some((ev: Ev) => ev.label === "行迹【崇高拂尘】"));
  near(res.units[0].finalEnergy, 65 + 25);
  res = sim({ maxAV: 130, ...QUIET, team: [{ id: "1313", baseSpd: 200, traceSpd: 0, eidolon: 4 }] });
  assert.ok(res.timeline.some((ev: Ev) => ev.label === "E4 雕塑的卷首语"));
});

test("存护砂金 E4：追击 7 段 → 10 段", () => {
  const fuaLabel = (eidolon: number): string => {
    const res = sim({
      maxAV: 200, ...QUIET,
      team: [{ id: "1304", baseSpd: 1, traceSpd: 0, eidolon }, { id: "1501", baseSpd: 200, traceSpd: 0, rotation: "basic" }, { id: "1502", baseSpd: 200, traceSpd: 0, rotation: "basic" }],
    });
    return res.timeline.find((ev: Ev) => ev.type === "fua" && ev.label.includes("砂金") && ev.label.includes("段追加"))?.label ?? "";
  };
  assert.ok(fuaLabel(0).includes("7 段"));
  assert.ok(fuaLabel(4).includes("10 段"));
});

test("真珠专武：施放欢愉技固定 +10 能量", () => {
  const energy = (equipment: Record<string, boolean>): number => unit(sim({
    maxAV: 130, useTech: false, useAeonAha: true, aeonAhaBaseSpd: 200, aeonAhaLcBaseSpd: 0,
    team: [{ id: "1503", baseSpd: 1, traceSpd: 0, equipment }],
  }), "1503").finalEnergy;
  near(energy({}), 100); // 开局 90 + 两次欢愉技各 +5
  near(energy({ hasPearlLc: true }), 120); // 每次再固定 +10
});

test("《当她决定看见》：ERR +12%、每波次固定 +15（这里等于战斗开始一次）", () => {
  const run = (equipment: Record<string, boolean>) => sim({ maxAV: 1, ...QUIET, team: [{ id: "1502", baseSpd: 1, traceSpd: 0, equipment }] }).units[0];
  near(run({}).err, 0);
  near(run({ hasYaoLc: true }).err, 12);
  near(run({ hasYaoLc: true }).finalEnergy, 90 + 15);
});

test("绯英专武：ERR +10% + 上限超 120 部分每 10 点 +0.3%（480 上限共 +20.8%）", () => {
  const res = sim({ maxAV: 1, ...QUIET, team: [{ id: "1505", baseSpd: 1, traceSpd: 0, equipment: { hasFeiyLc: true } }] });
  near(res.units[0].err, 20.8);
});

test("绯英 E6：首次终结技固定 +120 能量", () => {
  const res = sim({ maxAV: 1, ...QUIET, team: [{ id: "1505", baseSpd: 1, traceSpd: 0, initAdv: 100, err: 700, eidolon: 6 }] });
  assert.ok(res.timeline.some((ev: Ev) => ev.label === "E6 少女，见浮生入梦"));
});

test("砂金•戏浪【热意】E0 上限 30", () => {
  const res = sim({
    maxAV: 350, ...QUIET,
    team: [{ id: "1513", baseSpd: 1, traceSpd: 0 }, { id: "1304", baseSpd: 200, traceSpd: 0, rotation: "basic" }, { id: "1309", baseSpd: 200, traceSpd: 0, rotation: "basic" }],
  });
  const peaks: number[] = res.timeline.map((ev: Ev) => ev.res.fervor).filter((value: number | null) => value !== null);
  assert.ok(peaks.length > 0);
  assert.ok(Math.max(...peaks) <= 30);
});

test("存护砂金【热手】开局护盾触发阿哈行迹2（+1 愿力）", () => {
  const res = sim({ maxAV: 1, ...QUIET, team: [{ id: "1511" }, { id: "1304" }] });
  assert.ok(anyDetail(res, (d) => d.includes("砂金【热手】开局护盾 → 愿力 +1")));
});
