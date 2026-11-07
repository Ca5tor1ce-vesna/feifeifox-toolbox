/** 排轴页的逻辑层：页面状态怎么变成引擎输入，结果怎么整理成轴和列表。不碰 DOM。 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import type { GameData } from "../../axis-engine/src/battle.ts";
import { createBattle } from "../../axis-engine/src/battle.ts";
import { memberFromBuild } from "../../axis-ui/src/build.ts";
import { memberFromLegacyUnit, stateFromLegacy, stateFromRecord } from "../../axis-ui/src/legacy-team.ts";
import { buildCards, cardMatches, cardOverflows, overflowText, cardSlots, castsOf, computeAxis, droppedMembers, droppedNotice, groupMoments, newCustomMember, newElationSettings, newMember, newState, pageCharacters, restoreState, speedThreshold, toMemberInput, windowAV, type PageData, type PageState } from "../../axis-ui/src/model.ts";
import { TEAM_PRESETS } from "../../axis-ui/src/presets.ts";
import { claimClipPlayback, releaseClipPlayback, ULT_CLIP_FRAMING, ultClipOf } from "../../axis-ui/src/ult-clips.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const dataDir = join(HERE, "..", "..", "modules", "honkai-star-rail", "data");
const json = (name: string) => JSON.parse(readFileSync(join(dataDir, name), "utf-8"));
const game: GameData = { axis: json("axis_data.json"), characters: json("characters.json") };
const data: PageData = {
  game,
  characters: json("characters.json"),
  lightcones: json("lightcones.json"),
  relicSets: json("relic_sets.json"),
  modes: json("modes.json").modes,
};
const near = (actual: number, expected: number, message = "") =>
  assert.ok(Math.abs(actual - expected) < 1e-7, `${message} 期望 ${expected}，实际 ${actual}`);

const stateOf = (...ids: string[]): PageState => ({ ...newState(), useTechnique: false, team: ids.map(newMember) });

test("模式和轮数决定窗口和轮次分界", () => {
  const mode = (id: string) => data.modes.find((item) => item.id === id)!;
  assert.equal(windowAV({ ...newState(), t: 2 }, mode("moc")), 350);
  assert.equal(windowAV({ ...newState(), t: 0 }, mode("yixiang")), 300);
  assert.equal(windowAV({ ...newState(), t: 5 }, mode("yixiang")), 800);
  const view = computeAxis({ ...stateOf("1110"), modeId: "yixiang", t: 1 }, data);
  assert.equal(view.maxAV, 400);
  assert.equal(view.firstCycleAV, 300);
  // 玲可 100 速，第 2 动在 200 AV：异相仲裁首轮 300 还在 0T，混沌首轮 150 已经是 1T。
  assert.equal(view.rows.find((row) => row.av > 150 && row.mark)!.t, 0);
  assert.equal(computeAxis(stateOf("1110"), data).rows.find((row) => row.av > 150 && row.mark)!.t, 1);
});

test("选了角色不填别的也能出轴", () => {
  const view = computeAxis({ ...newState(), team: [newMember("1408")] }, data);
  assert.equal(view.units[0].name, "白厄");
  assert.ok(view.units[0].actions > 0);
  assert.ok(view.rows.length > 0);
});

test("角色的数值走成员输入：额外速度、能量恢复效率、遗器和光锥", () => {
  const member = newMember("1110");
  member.flatSpd = 10;
  member.err = 19.4;
  member.lightconeId = "21000";
  member.superimpose = 5;
  member.cavernId = "102";
  member.ornamentId = "121";
  const input = toMemberInput(member);
  assert.deepEqual(input.lightcone, { id: "21000", superimpose: 5 });
  assert.deepEqual(input.relics, [{ id: "102", pieces: 4 }, { id: "121", pieces: 2 }]);
  const view = computeAxis({ ...newState(), team: [member] }, data);
  // 玲可基础 100、行迹 0：快枪手 4 件 6% + 司铎 2 件 6%，额外 10。
  const trace = data.characters.find((item) => item.id === "1110")!.traceSpeed ?? 0;
  near(view.units[0].openingSpeed, 100 * 1.12 + 10 + trace);
});

test("开局拉条：玲可 100 速提前 50%，第一动在 50 AV", () => {
  const member = newMember("1110");
  member.initAdv = 50;
  const trace = data.characters.find((item) => item.id === "1110")!.traceSpeed ?? 0;
  const view = computeAxis({ ...newState(), useTechnique: false, team: [member] }, data);
  near(view.rows.find((row) => row.mark && row.slot === 0)!.av, 5000 / (100 + trace));
});

test("逐动覆盖：只改指定的那一动，其余仍是自动", () => {
  const member = newMember("1110");
  member.overrides = { 2: "basic" };
  const input = toMemberInput(member);
  assert.equal(input.script?.[0], undefined);
  assert.equal(input.script?.[1], "basic");
  const view = computeAxis({ ...newState(), useTechnique: false, team: [member] }, data);
  assert.deepEqual(castsOf(view, 0, 1), ["skill"]);
  assert.deepEqual(castsOf(view, 0, 2), ["basic"]);
  assert.deepEqual(castsOf(view, 0, 3), ["skill"]);
});

test("由机制决定的动改不了：吉尔伽美什开局只会普攻", () => {
  const before = computeAxis(stateOf("1509"), data);
  const member = newMember("1509");
  member.overrides = { 1: "skill" };
  const after = computeAxis({ ...newState(), useTechnique: false, team: [member] }, data);
  assert.deepEqual(castsOf(before, 0, 1), castsOf(after, 0, 1));
});

test("手动开大：遐蝶默认第 2 动，改了就听用户的", () => {
  const auto = computeAxis(stateOf("1407"), data);
  assert.equal(auto.units[0].ultimates, 1);
  assert.ok(auto.warnings.some((text) => text.includes("新蕊")));
  const member = newMember("1407");
  member.manualUltimates = [];
  assert.equal(computeAxis({ ...newState(), useTechnique: false, team: [member] }, data).units[0].ultimates, 0);
});

test("召唤物的行归到主人名下；未计入和其他提醒分开", () => {
  const view = computeAxis(stateOf("1204", "1110"), data);
  const lord = view.rows.filter((row) => row.mark && row.name === "【神君】");
  assert.ok(lord.length > 0);
  assert.ok(lord.every((row) => row.slot === 0));
  const rin = computeAxis(stateOf("1508"), data);
  // 战技点相关的条目统一由战技点系统登记（默认不开），这里只核对「未计入」和提醒确实分开。
  assert.ok(rin.unsupported.some((item) => item.mechanic.includes("连携")));
  assert.ok(!rin.warnings.some((text) => text.startsWith("未计入")));
});

test("星神★阿哈的行显示愿力，不是空着；别人照常显示能量", () => {
  const view = computeAxis(stateFromLegacy(TEAM_PRESETS.feiying_aha, pageData), pageData);
  const aha = view.rows.filter((row) => row.slot === 1 && row.type === "skill");
  assert.ok(aha.length > 0);
  assert.ok(aha.every((row) => row.energyName === "愿力" && row.energy !== null && row.energy >= 0 && row.energy <= 10));
  const pearl = view.rows.find((row) => row.slot === 2 && row.type !== "note")!;
  assert.equal(pearl.energyName, "能量");
  assert.ok(pearl.energy !== null && pearl.energy > 10);
});

test("拉条溢出挂到触发它的那张卡上，详情一行写清楚", () => {
  // 预设开着行迹3 开局提前：阿哈第一次开大时【阿哈时刻】快到了，20% 拉条溢出（数值由 engine / elation-mechanics 的手算测试钉住）。
  const cards = buildCards(computeAxis(stateFromLegacy(TEAM_PRESETS.aha_quad, pageData), pageData).rows);
  const ahaUlt = cards.find((card) => card.kind === "ult" && card.main?.name === "星神★阿哈" && cardOverflows(card).length > 0);
  assert.ok(ahaUlt, "阿哈有一次开大拉条溢出");
  const [item] = cardOverflows(ahaUlt!).filter((entry) => entry.target === "【阿哈时刻】");
  assert.equal(item.pct, 20);
  assert.ok(item.wastedAv > 0 && item.leftAv > 0);
  assert.equal(overflowText(item), `【阿哈时刻】 拉条 20%：本来只差 ${item.leftAv.toFixed(1)} AV，溢出 ${item.wastedAv.toFixed(1)} AV 作废`);
  // 没有溢出的卡不带这个字段
  assert.ok(cards.some((card) => cardOverflows(card).length === 0));
  assert.ok(cards.flatMap((card) => [...card.follows, ...card.notes]).every((row) => row.overflows === undefined || row.overflows.length > 0));
  // 被拉的人同一时刻本来就要行动：整口作废，换个说法，不写「只差 0.0 AV」
  assert.equal(overflowText({ target: "银狼LV.999", pct: 30, leftAv: 0, wastedAv: 15.94 }), "银狼LV.999 拉条 30%：已经轮到行动，15.9 AV 全部作废");
});

test("开大里插了额外回合，回来再结算的拉条仍挂在这次开大上", () => {
  // 绯英预设：真珠开大先给绯英【美学底本】额外回合，E2 拉阿哈在额外回合之后才结算，溢出要算真珠开大的。
  const cards = buildCards(computeAxis(stateFromLegacy(TEAM_PRESETS.feiying_aha, pageData), pageData).rows);
  const flagged = cards.filter((card) => cardOverflows(card).some((item) => item.target === "星神★阿哈"));
  assert.ok(flagged.length > 0);
  assert.ok(flagged.every((card) => card.kind === "ult" && card.main?.name === "真珠"), flagged.map((card) => card.main?.name).join("、"));
});

test("终结技靠特殊资源的角色，这一列写资源名", () => {
  const names: Record<string, string> = { 1220: "飞黄", 1308: "残梦", 1408: "火种", 1415: "追忆", 1506: "隐藏分", 1511: "愿力" };
  // 遐蝶的【新蕊】靠掉血累积，引擎不模拟：不显示，免得一直是 0。
  assert.ok(computeAxis(stateOf("1407"), pageData).rows.filter((item) => item.slot === 0).every((item) => item.energy === null));
  for (const [id, name] of Object.entries(names)) {
    const row = computeAxis(stateOf(id), pageData).rows.find((item) => item.slot === 0 && item.energy !== null)!;
    assert.equal(row.energyName, name, id);
    // 资源的数值来自引擎的同一个字段：不超过它自己的上限。
    assert.ok(row.energy! >= 0 && row.energy! <= 999, id);
  }
  assert.equal(computeAxis(stateOf("1110"), pageData).rows.find((item) => item.slot === 0 && item.energy !== null)!.energyName, "能量");
});

test("银狼LV.999 的隐藏分按含溢出的合计显示", () => {
  // 开局 140（60 + 溢出 80），开战 1 个人头笑点同步 → 141，当场开大：消耗 60 剩 81（溢出的保留，2026-11-05 用户确认），
  // 再 +20（隐藏关卡），之后每次强化普攻 +5。能开大的那部分封顶 60，合计要超过 60 才对；第一次强化普攻时合计 = 81 + 20 = 101。
  const state = stateOf("1506");
  state.team[0].initialEnergy = 140;
  const rows = computeAxis(state, pageData).rows.filter((item) => item.slot === 0 && item.energy !== null);
  const first = rows.find((item) => item.type === "enhanced_basic")!;
  assert.equal(first.energyName, "隐藏分");
  assert.equal(first.energy, 101);
  assert.ok(rows.some((item) => item.energy! > 101));
});

test("机制按队伍出现：有欢愉角色才有【阿哈时刻】，它不属于任何角色", () => {
  const elation = computeAxis(stateOf("1501", "1110"), data);
  const aha = elation.rows.filter((row) => row.mark && row.name === "【阿哈时刻】");
  assert.ok(aha.length > 0);
  assert.ok(aha.every((row) => row.slot === null));
  const plain = computeAxis(stateOf("1110", "1203"), data);
  assert.ok(!plain.rows.some((row) => row.name === "【阿哈时刻】"));
});

test("同 AV 事件保持引擎顺序：列表和原始时间轴一致", () => {
  const team = stateOf("1309", "1110", "1203");
  team.team[0].initialEnergy = 160;
  const view = computeAxis(team, data);
  const engine = createBattle({
    team: team.team.map(toMemberInput), maxAV: view.maxAV, useTechnique: false, cycle: { firstCycleAV: 150, cycleAV: 100 }, enemyCount: 1,
  }, game);
  const result = engine.run();
  assert.deepEqual(view.rows.map((row) => [row.av, row.label]), result.timeline.map((row) => [row.av, row.label]));
});

test("事件的键稳定：改速度后同一个事件还是同一个键，列表才能原地更新", () => {
  const slow = computeAxis(stateOf("1110"), data);
  const member = newMember("1110");
  member.flatSpd = 30;
  const fast = computeAxis({ ...newState(), useTechnique: false, team: [member] }, data);
  const marks = (view: typeof slow) => view.rows.filter((row) => row.mark && row.slot === 0);
  const keys = (view: typeof slow) => marks(view).map((row) => row.key);
  assert.deepEqual(keys(fast).slice(0, keys(slow).length), keys(slow));
  assert.ok(marks(fast)[0].av < marks(slow)[0].av);
  const all = fast.rows.map((row) => row.key);
  assert.equal(new Set(all).size, all.length, "键不能重复");
});

test("非法输入抛可读的错误，不返回半截结果", () => {
  const member = newMember("1110");
  member.lightconeId = "99999";
  assert.throws(() => computeAxis({ ...newState(), team: [member] }, data), /没有找到光锥/);
});

test("从存档恢复：坏数据不把页面弄坏", () => {
  assert.deepEqual(restoreState(null, data), newState());
  assert.deepEqual(restoreState("乱码", data), newState());
  const restored = restoreState({
    modeId: "不存在",
    t: -3,
    enemyCount: 0,
    useTechnique: false,
    team: [{ id: "1110", eidolon: 2 }, { id: "不存在" }, { id: "1110" }, { id: "1203" }, { id: "1204" }, { id: "1205" }, { id: "1206" }],
  }, data);
  assert.equal(restored.modeId, "moc");
  assert.equal(restored.t, 2);
  assert.equal(restored.enemyCount, 1);
  assert.equal(restored.useTechnique, false);
  assert.deepEqual(restored.team.map((member) => member.id), ["1110", "1203", "1204", "1205"]);
  assert.equal(restored.team[0].eidolon, 2);
  assert.deepEqual(restored.team[1].overrides, {}, "缺的字段用默认值补上");
});

// ---------------------------- 读取配装 ---------------------------- //

const catalog = { lightcones: data.lightcones, relicSets: data.relicSets };

test("读取配装：面板速度和存档一致，光锥和套装不算两遍", () => {
  // 存档：玲可基础 100，叠 1《春水初生》不是她的命途不会带，这里用司铎 2 件 6% + 副词条 20。
  const trace = data.characters.find((item) => item.id === "1110")!.traceSpeed ?? 0;
  const final = 100 * 1.06 + trace + 20;
  const member = memberFromBuild("1110", {
    entry: { name: "测试配装", config: { eidolon: 2, relic: { ornamentIds: ["121"] }, aha: { err: 19.4 }, advance: { custom: 12 } } },
    result: { speed: { final } },
  }, game, catalog);
  near(member.flatSpd, 20);
  assert.equal(member.ornamentId, "121");
  assert.equal(member.eidolon, 2);
  assert.equal(member.err, 19.4);
  assert.equal(member.initAdv, 12);
  assert.equal(member.buildName, "测试配装");
  const speed = createBattle({ team: [toMemberInput(member)], maxAV: 1 }, game).units[0].speed();
  near(speed, final);
});

test("读取配装：光锥和 4 件套进入对应的栏；不认识的 id 丢掉", () => {
  const member = memberFromBuild("1110", {
    entry: { name: "x", config: { lightconeId: 21000, superimpose: 3, relic: { fourPieceId: 102, ornamentIds: [] } } },
    result: { speed: { final: 106 } },
  }, game, catalog);
  assert.equal(member.lightconeId, "21000");
  assert.equal(member.superimpose, 3);
  assert.equal(member.cavernId, "102");
  const unknown = memberFromBuild("1110", {
    entry: { name: "x", config: { lightconeId: "99999", relic: { fourPieceId: "999" } } },
    result: { speed: { final: 100 } },
  }, game, catalog);
  assert.equal(unknown.lightconeId, "");
  assert.equal(unknown.cavernId, "");
});

// ---------------------------- 阿哈页融合 ---------------------------- //

const pageData: PageData = { ...data, characters: pageCharacters(game) };

test("星神★阿哈可以选，只出现一次", () => {
  const ids = pageData.characters.map((item) => String(item.id));
  assert.ok(ids.includes("1511"));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(pageData.characters.find((item) => String(item.id) === "1511")!.path, "Elation");
});

test("旧存档读进来面板速度不变，光锥和套装不算两遍", () => {
  // 手算：(94 + 12) × (1 + 12% + 6%) + 35 + 5 = 165.08，6% 是旧开关「神的瞬息欢愉」，现在直接穿上这套位面饰品。
  const aha = TEAM_PRESETS.aha_quad.team[0];
  const ahaMember = memberFromLegacyUnit(aha, game);
  assert.equal(ahaMember.ornamentId, "329");
  near(createBattle({ team: [toMemberInput(ahaMember)], maxAV: 1 }, game).units[0].speed(), 165.08);
  // 手算：107 × 1.06 + 28 + 9。旧开关 hasSummerLc 换成对应的光锥，它给的速度已经含在 permPct 里。
  const sand = TEAM_PRESETS.aha_quad.team[1];
  const member = memberFromLegacyUnit(sand, game);
  assert.equal(member.lightconeId, "23064");
  near(createBattle({ team: [toMemberInput(member)], maxAV: 1 }, game).units[0].speed(), 107 * 1.06 + 28 + 9);
  // vonwacq 进位面饰品栏，速度同样不算两遍。
  const yao = memberFromLegacyUnit(TEAM_PRESETS.aha_quad.team[3], game);
  assert.equal(yao.ornamentId, "308");
  near(createBattle({ team: [toMemberInput(yao)], maxAV: 1 }, game).units[0].speed(), 101 * 1.18 + 45 + 9);
});

test("旧存档的欢愉设置和窗口带过来，缺的用默认值", () => {
  const state = stateFromLegacy({ team: [{ id: "1502" }], config: { maxAV: 480, useTech: false, ahaSpdPct: 12, ahaAdvancePct: 30, useAeonAha: true } }, pageData);
  assert.equal(state.customAV, 480);
  assert.equal(state.useTechnique, false);
  assert.equal(state.elation.ahaSpdPct, 12);
  assert.equal(state.elation.ahaAdvancePct, 30);
  assert.equal(state.elation.useAeonAha, true);
  assert.equal(state.elation.ultSpdPct, newElationSettings().ultSpdPct);
  assert.equal(computeAxis(state, pageData).maxAV, 480);
});

test("队伍存档：新格式原样读回，旧格式走转换，坏数据不把页面弄坏", () => {
  const saved = { ...stateOf("1110"), customAV: 200 };
  const { team, ...settings } = saved;
  const back = stateFromRecord({ name: "x", format: "axis", team, state: settings }, pageData);
  assert.equal(back.customAV, 200);
  assert.equal(back.team[0].id, "1110");
  assert.equal(stateFromRecord({ name: "旧", team: [{ id: "1502", permFlat: 10 }], config: {} }, pageData).team[0].id, "1502");
  assert.deepEqual(stateFromRecord({ name: "坏", team: [{ id: "不存在" }], config: {} }, pageData).team, []);
});

// 改过的条目：2026-11-06 aha_quad、feiying_aha、wolf_sparkle 三个预设——【阿哈时刻】里不再中途插终结技，
// 首个分歧都是旧基准在阿哈时刻那一刻先放了某人的终结技，新的先把其余人的欢愉技放完。
// 2026-11-06 sandu_duel：星期日带舞！舞！舞！在自己回合里开大，自己那口拉条以前跳过、现在回合结束后结算（和风套一样），首个分歧是星期日下一动提前。
// 2026-11-07 四个预设：【阿哈时刻】结束时按欢愉角色数加人头笑点、爻光秘技的自动战技不加笑点也不再记成一张战技卡、银狼秘技 +3 笑点（4.6 版本游戏配置）。
// aha_quad、feiying_aha、wolf_sparkle 首个分歧是 0 AV 那张爻光秘技的「战技」卡没了；sandu_duel 首个分歧是星神★阿哈第三次终结技从 231.0 提前到 199.3：
// 人头笑点让笑点在 124.1 AV 首达 40，天赋多给 1 愿力。
// 2026-11-07 开战每名欢愉角色 20 好活当赏、人头笑点（4.6 版本游戏配置，用户按游戏实际确认）：feiying_aha 首个分歧是绯英【狐狸老师】
// 追击提前到 68.3 AV（开战好活当赏转了能量）；wolf_sparkle 首个分歧是银狼 100.9 AV 的终结技提前到额外【阿哈时刻】之前（隐藏分多了开战人头）。
test("预设和旧引擎逐事件一致（基准来自下线前的旧页面，不证明机制正确）", () => {
  const baseline = JSON.parse(readFileSync(join(HERE, "..", "fixtures", "axis_preset_timelines.json"), "utf-8")) as Record<string, [number, string, number | null][]>;
  assert.deepEqual(Object.keys(baseline).sort(), Object.keys(TEAM_PRESETS).sort());
  for (const [key, preset] of Object.entries(TEAM_PRESETS)) {
    const rows = computeAxis(stateFromLegacy(preset, pageData), pageData).rows.filter((row) => row.mark);
    assert.equal(rows.length, baseline[key].length, `${key} 事件数`);
    rows.forEach((row, i) => {
      const [av, type, slot] = baseline[key][i];
      assert.ok(Math.abs(row.av - av) < 0.001 && row.type === type && row.slot === slot, `${key} 第 ${i} 条：${row.av} ${row.type} ${row.slot}，基准 ${av} ${type} ${slot}`);
    });
  }
});

test("机制按队伍出现：没有欢愉角色就没有阿哈面板", () => {
  assert.equal(computeAxis(stateOf("1110"), pageData).elation, null);
  // 队伍没有星神★阿哈，【阿哈时刻】底速 80。
  const view = computeAxis(stateOf("1505"), pageData).elation!;
  assert.ok(view.triggers > 0);
  assert.ok(view.formula.includes("80"));
  near(view.singleAV, 10000 / view.speed);
});

test("欢愉设置生效：提高【阿哈时刻】速度后间隔变短", () => {
  const base = stateOf("1505");
  const faster = { ...stateOf("1505"), elation: { ...newElationSettings(), ahaSpdPct: 50 } };
  near(computeAxis(faster, pageData).elation!.speed, computeAxis(base, pageData).elation!.speed * 1.5);
});

test("助战技设置：传给引擎、存档读回来还在，默认不存字段", () => {
  const state = stateOf("1510", "1313", "1004");
  state.team[2].assist = "never";
  assert.equal(toMemberInput(state.team[2]).assist, "never");
  assert.equal(toMemberInput(state.team[1]).assist, undefined, "默认不填，引擎按默认规则");
  const restored = restoreState(JSON.parse(JSON.stringify(state)), pageData);
  assert.equal(restored.team[2].assist, "never");
  // 瓦尔特设了「不用」，助战技轮到星期日
  const names = computeAxis(state, pageData).rows.filter((row) => row.label === "助战技【开拓，与你同行】").map((row) => row.name);
  assert.ok(names.length > 0 && names.every((name) => name === "星期日"), names.join("、"));
});

test("卡片：姬子•启行的助战技、协议切换、补次数说明挂在对的卡上", () => {
  // 2026-11-06 页面实测：协议切换记在姬子身上，却在瓦尔特行动前，被挂到了前一张（希儿）的卡上；
  // 战技补满次数的说明在开大之前没挂到战技卡上。应该：助战技和协议跟着使用者那一动，补次数跟着姬子的战技。
  const cards = buildCards(computeAxis(stateOf("1510", "1313", "1004", "1102"), pageData).rows);
  const cardWith = (label: string) => cards.find((card) => card.notes.some((row) => row.label === label));
  const walt = cardWith("同行协议：歼破")!;
  assert.equal(walt.main!.name, "瓦尔特", "协议切换跟着瓦尔特那一动");
  assert.ok(walt.notes.some((row) => row.label === "助战技【开拓，与你同行】"));
  // 默认只有先动的瓦尔特用；把瓦尔特设成「不用」再看星期日那边的【裁决】。
  const sundayOnly = stateOf("1510", "1313", "1004", "1102");
  sundayOnly.team[2].assist = "never";
  sundayOnly.useTechnique = true; // 页面默认开秘技：姬子秘技 +30，星期日那次助战技正好让她满能
  const sundayCards = buildCards(computeAxis(sundayOnly, pageData).rows);
  assert.equal(sundayCards.find((card) => card.notes.some((row) => row.label === "同行协议：裁决"))!.main!.name, "星期日");
  // 星期日用助战技给姬子 +18 正好让她满能当场开大：助战技这条也要跟着星期日那一动，不能被插进来的终结技挤到前一张卡（2026-11-06 页面实测）。
  const sundayAssist = sundayCards.find((card) => card.notes.some((row) => row.label === "助战技【开拓，与你同行】" && row.name === "星期日"))!;
  assert.equal(sundayAssist.main!.name, "星期日", "助战技跟着星期日那一动");
  const refill = cardWith("战技【升起领航的烽火】")!;
  assert.equal(refill.main!.name, "姬子•启行");
  assert.equal(refill.main!.type, "skill", "补次数跟着她的战技卡，不在终结技卡上");
});

test("卡片：每条事件都归进一张卡，同一时刻的追击、欢愉技并到主动作上", () => {
  const view = computeAxis(stateFromLegacy(TEAM_PRESETS.aha_quad, pageData), pageData);
  const cards = buildCards(view.rows);
  // 一条不丢、一条不重
  const keys = cards.flatMap((card) => [...(card.main ? [card.main.key] : []), ...card.follows.map((row) => row.key), ...card.notes.map((row) => row.key)]);
  assert.equal(keys.length, view.rows.length);
  assert.deepEqual(new Set(keys), new Set(view.rows.map((row) => row.key)));
  // 主动作都是标记行，顺带的动作和主动作同一时刻
  assert.ok(cards.every((card) => card.kind === "start" || card.main!.mark));
  assert.ok(cards.every((card) => card.follows.every((row) => Math.abs(row.av - card.av) < 1e-6 && ["fua", "elation_skill", "memosprite"].includes(row.type))));
  // 秘技和进战效果在开战卡里
  assert.equal(cards[0].kind, "start");
  assert.ok(cards[0].notes.some((row) => row.type === "battle"));
  // 【阿哈时刻】卡带出欢愉技；星神★阿哈战技的追击挂在战技卡上
  assert.ok(cards.some((card) => card.kind === "aha" && card.follows.filter((row) => row.type === "elation_skill").length >= 2));
  assert.ok(cards.some((card) => card.kind === "unit" && card.main!.type === "skill" && card.follows.some((row) => row.type === "fua" && row.slot === card.main!.slot)));
  // 额外回合的说明跟着拿到额外回合的那一动
  const extra = cards.find((card) => card.notes.some((row) => row.type === "extra_turn"))!;
  assert.equal(extra.main!.slot, extra.notes.find((row) => row.type === "extra_turn")!.slot);
  // 同一 AV 的卡排在一个时刻里，时刻按时间排
  const moments = groupMoments(cards);
  assert.ok(moments.some((moment) => moment.cards.length > 2));
  assert.ok(moments.every((moment, index) => index === 0 || moment.av >= moments[index - 1].av - 1e-6));
});

test("筛选：卡片里有一条符合就留下，按角色看时只留有这名角色的卡", () => {
  const view = computeAxis(stateFromLegacy(TEAM_PRESETS.feiying_aha, pageData), pageData);
  const cards = buildCards(view.rows);
  const pick = (filter: Parameters<typeof cardMatches>[1], slot: number | null = null) => cards.filter((card) => cardMatches(card, filter, slot));
  assert.ok(pick("ultimate").length > 0 && pick("ultimate").every((card) => card.kind === "ult"));
  assert.ok(pick("aha").length > 0 && pick("aha").every((card) => card.kind === "aha"));
  assert.ok(pick("elation").length > 0 && pick("elation").every((card) => [card.main!, ...card.follows].some((row) => row.type === "elation_skill")));
  assert.equal(pick("all").length, cards.length);
  assert.ok(!pick("turn").some((card) => card.kind === "start"));
  // 绯英的逐次回能：选绯英，点开她的卡就能核对。
  const feiying = pick("all", 0);
  assert.ok(feiying.length > 0 && feiying.every((card) => cardSlots(card).includes(0)));
  assert.ok(feiying.some((card) => card.notes.some((row) => row.type === "energy_gain" && row.slot === 0)));
});

test("资源变化写进行里：笑点", () => {
  const rows = computeAxis(stateFromLegacy(TEAM_PRESETS.aha_quad, pageData), pageData).rows;
  assert.ok(rows.some((row) => row.resources.includes("笑点")));
});

test("速度阈值反推：10000 × (动数 − 拉条%) ÷ 目标行动值", () => {
  near(speedThreshold(150, 2, 0).required, 10000 * 2 / 150, "0T 两动");
  near(speedThreshold(150, 2, 40).required, 10000 * 1.6 / 150, "拉条 40%");
  assert.throws(() => speedThreshold(0, 2, 0), /行动值/);
  assert.throws(() => speedThreshold(150, 0, 0), /动数/);
  assert.throws(() => speedThreshold(150, 2, -1), /拉条/);
});

test("自定义窗口优先于轮数，且有上限", () => {
  const state = { ...stateOf("1110"), customAV: 777 };
  assert.equal(computeAxis(state, pageData).maxAV, 777);
  assert.equal(restoreState({ customAV: 99999 }, pageData).customAV, null, "超范围的存档按轮数算");
});

test("自定义角色：只算填的数值和效果，存档能原样读回", () => {
  // 120 速、能量上限 100、战技回能 50：第 2 动满能开大，开大后全队提前 30%、自己拿额外回合。
  const custom = newCustomMember();
  Object.assign(custom.custom!, { name: "测试服角色", baseSpd: 120, maxEnergy: 100, ultTeamAdvance: 30, ultExtraTurn: true });
  custom.custom!.energy.skill = 50;
  custom.initialEnergy = 0;
  const lynx = newMember("1110");
  const state = { ...newState(), useTechnique: false, team: [custom, lynx] };
  const view = computeAxis(state, data);
  assert.equal(view.units[0].name, "测试服角色");
  const acts = view.rows.filter((row) => row.slot === 0 && row.type === "skill").map((row) => row.av);
  near(acts[0], 10000 / 120);
  near(acts[1], 20000 / 120);
  const ult = view.rows.find((row) => row.slot === 0 && row.type === "ultimate")!;
  near(ult.av, 20000 / 120, "第 2 动后能量 100，开大");
  assert.ok(view.rows.some((row) => row.slot === 0 && row.label === "终结技：额外回合"));
  assert.ok(view.rows.some((row) => row.details.includes("我方全体行动提前 30%")));
  // 存档：id 不在图鉴里，靠自定义数据认人；坏字段用默认值补。
  const saved = JSON.parse(JSON.stringify({ ...state, team: [{ ...custom, custom: { ...custom.custom, baseSpd: "坏" } }, lynx] }));
  const back = restoreState(saved, data);
  assert.equal(back.team[0].id, custom.id);
  assert.equal(back.team[0].custom?.name, "测试服角色");
  assert.equal(back.team[0].custom?.baseSpd, 100, "坏字段回到默认值");
  // 不是 custom- 开头的未知 id 照旧丢掉。
  assert.equal(restoreState({ team: [{ id: "不存在", custom: custom.custom }] }, data).team.length, 0);
});

test("自定义角色数值超出范围时报可读的错误", () => {
  const custom = newCustomMember();
  custom.custom!.baseSpd = 0;
  assert.throws(() => computeAxis({ ...newState(), team: [custom] }, data), /自定义角色「自定义角色」的数值不对：baseSpd/);
});

test("存档里读不进来的角色要告诉用户", () => {
  // 比如测试服包里的角色，存进存档后拿到正服打开。名字查不到就用 id。
  const saved = { ...newState(), useTechnique: false, team: [{ id: "9999" }, { id: "1110" }] };
  const state = restoreState(saved, pageData);
  assert.deepEqual(state.team.map((member) => member.id), ["1110"]);
  const names = droppedMembers(saved.team, state.team, pageData);
  assert.deepEqual(names, ["9999"]);
  assert.match(droppedNotice(names), /「9999」不在当前版本的资料里/);
  assert.equal(droppedNotice([]), "");
});

test("大招动画片段：表里每个角色都有文件，每个文件都在表里，正服角色都有", () => {
  const dir = join(HERE, "..", "..", "modules", "honkai-star-rail", "assets", "ult");
  const files = readdirSync(dir).filter((name) => name.endsWith(".webm")).map((name) => name.replace(".webm", "")).sort();
  assert.deepEqual(Object.keys(ULT_CLIP_FRAMING).sort(), files);
  const characters = (json("characters.json") as { id: string | number }[]).map((item) => String(item.id));
  assert.ok(Object.keys(ULT_CLIP_FRAMING).every((id) => characters.includes(id)), "表里有不存在的角色");
  // 星神★阿哈 2026-11-06 创作体验服开放后补上了
  assert.deepEqual(characters.filter((id) => ULT_CLIP_FRAMING[id] === undefined), []);
  assert.ok(Object.values(ULT_CLIP_FRAMING).every((y) => y >= 0 && y <= 100));
  assert.equal(ultClipOf("1502")?.src, "/modules/honkai-star-rail/assets/ult/1502.webm");
  assert.equal(ultClipOf("1511")?.src, "/modules/honkai-star-rail/assets/ult/1511.webm");
  assert.equal(ultClipOf("9999"), undefined);
});

test("大招片段同一时间只放一个；选中（循环）的不会被别的卡出场时只放一遍的抢走", () => {
  const stopped: string[] = [];
  const stopOf = (name: string) => () => { stopped.push(name); };
  const [a, b, c] = [stopOf("a"), stopOf("b"), stopOf("c")];
  // 出场时只放一遍的：后来的停掉前一个
  assert.equal(claimClipPlayback(a), true);
  assert.equal(claimClipPlayback(b), true);
  assert.deepEqual(stopped, ["a"]);
  // 点开 c（循环）：停掉 b；之后 a 出场想放一遍，不给放，c 照常
  assert.equal(claimClipPlayback(c, true), true);
  assert.equal(claimClipPlayback(a), false);
  assert.deepEqual(stopped, ["a", "b"]);
  // 另一张卡被选中或鼠标停上去（也是循环）可以换过去
  assert.equal(claimClipPlayback(b, true), true);
  assert.deepEqual(stopped, ["a", "b", "c"]);
  // b 放完让出来，只放一遍的又能放了
  releaseClipPlayback(b);
  assert.equal(claimClipPlayback(a), true);
  releaseClipPlayback(a);
});

test("每张【阿哈时刻】卡都挂着全部欢愉角色的欢愉技（2026-11-06：以前中途插大，卡上只剩真珠）", () => {
  const state = { ...newState(), customAV: 300, team: ["1511", "1503", "1502", "1505"].map(newMember) };
  const cards = buildCards(computeAxis(state, pageData).rows).filter((card) => card.kind === "aha");
  assert.ok(cards.length >= 5);
  for (const card of cards) {
    const casters = card.follows.filter((row) => row.type === "elation_skill").map((row) => row.slot);
    assert.deepEqual([...casters].sort(), [0, 1, 2, 3], `${card.av.toFixed(2)} 的阿哈时刻`);
  }
});

test("留大：开大点按角色 id 记，换站位不乱；读档认不出的丢掉", () => {
  // 玲可 100 速（100、200 AV）、星期日 … 只看留大的人什么时候开。玲可开局满能，留到 1 号位第 1 动后。
  const state = stateOf("1110", "1313");
  state.team[0].initialEnergy = 1000;
  const auto = computeAxis(state, data);
  const firstAuto = auto.rows.find((row) => row.type === "ultimate" && row.slot === 0)!;
  near(firstAuto.av, 0, "有大就开：开局就开");
  state.team[0].ultMode = "hold";
  state.team[0].ultAfter = [{ id: "1313", action: 1 }];
  const held = computeAxis(state, data);
  const firstHeld = held.rows.find((row) => row.type === "ultimate" && row.slot === 0)!;
  const mateFirst = held.rows.find((row) => row.slot === 1 && row.action === 1)!;
  near(firstHeld.av, mateFirst.av, "留到队友第 1 动后");
  // 换站位：开大点跟着角色走。
  const swapped = { ...state, team: [state.team[1], state.team[0]] };
  const again = computeAxis(swapped, data);
  near(again.rows.find((row) => row.type === "ultimate" && row.slot === 1)!.av, firstHeld.av);
  // 存档往返；坏数据丢掉。
  const saved = JSON.parse(JSON.stringify({ ...state, leadId: "1313", ultOrder: ["1313", 3] }));
  saved.team[0].ultAfter.push({ id: "1313", action: 0 }, { action: 2 });
  saved.team[1].ultMode = "weird";
  const restored = restoreState(saved, data);
  assert.equal(restored.team[0].ultMode, "hold");
  assert.deepEqual(restored.team[0].ultAfter, [{ id: "1313", action: 1 }]);
  assert.equal(restored.team[1].ultMode, undefined);
  assert.equal(restored.leadId, "1313");
  assert.deepEqual(restored.ultOrder, ["1313"]);
  assert.equal(restoreState({ team: [] }, data).leadId, null, "旧存档没有进场角色");
});

test("进场角色和开大顺序：只在需要时生效，人不在队里就不算", () => {
  const state = { ...stateOf("1412", "1408", "1218"), useTechnique: true, leadId: "1218" };
  state.team[0].targetSlot = 1;
  const markOf = (next: PageState) => computeAxis(next, data).rows.find((row) => row.label === "战技：施加【军功】" && row.av === 0)?.name;
  assert.equal(markOf(state), "椒丘");
  assert.equal(markOf({ ...state, leadId: "9999" }), "白厄", "进场角色不在队里，按技能目标");
  assert.equal(markOf({ ...state, useTechnique: false }), undefined);
  // 开大顺序：开局都满能，排过的先开。
  const both = stateOf("1110", "1218");
  for (const member of both.team) member.initialEnergy = 1000;
  const order = (next: PageState) => computeAxis(next, data).rows.filter((row) => row.type === "ultimate" && row.av === 0).map((row) => row.slot).filter((slot, index, list) => list.indexOf(slot) === index);
  assert.deepEqual(order(both).slice(0, 2), [0, 1]);
  assert.deepEqual(order({ ...both, ultOrder: ["1218"] }).slice(0, 2), [1, 0]);
});

// 2026-11-07 群里提的可优化项：令使这类以队友为目标的技能，像改普攻一样在卡片上逐动改目标。
test("逐动改目标：星神★阿哈第 1 动令使改给真珠，下一动回到平时的目标并换回令使", () => {
  const state = { ...stateOf("1511", "1502", "1503", "1506"), customAV: 300 };
  const skills = (view: ReturnType<typeof computeAxis>) => view.rows.filter((row) => row.slot === 0 && row.type === "skill" && row.action !== undefined);
  const plain = skills(computeAxis(state, pageData));
  assert.ok(plain.length >= 2, "300 AV 里阿哈至少放两次战技");
  assert.equal(plain[0].target, 1, "平时给站位里第一个队友（爻光）");
  state.team[0].targetOverrides = { [String(plain[0].action)]: "1503" };
  const changed = skills(computeAxis(state, pageData));
  assert.equal(changed[0].target, 2);
  assert.ok(changed[0].details.includes("指定 真珠 为【「欢愉」令使】（欢愉度 +20%）"), changed[0].details.join("|"));
  // 只改这一动：下一次战技按平时的目标，令使从真珠换回爻光。
  assert.equal(changed[1].target, 1);
  assert.ok(changed[1].details.includes("【「欢愉」令使】从 真珠 换到 爻光（欢愉度 +20%）"), changed[1].details.join("|"));
});

test("逐动改目标：星期日战技也能改；目标不在队里了当没改；存档读回只留认得出的", () => {
  const state = stateOf("1313", "1110", "1003");
  const first = () => computeAxis(state, pageData).rows.find((row) => row.slot === 0 && row.type === "skill" && row.action === 1)!;
  assert.equal(first().target, 1);
  state.team[0].targetOverrides = { 1: "1003" };
  assert.equal(first().target, 2);
  state.team[0].targetOverrides = { 1: "1001" };
  assert.equal(first().target, 1, "目标不在队里就按平时的");
  const saved = JSON.parse(JSON.stringify({ ...state, team: state.team.map((member, i) => (i === 0 ? { ...member, targetOverrides: { 1: "1003", x: "1110", 2: 5 } } : member)) }));
  assert.deepEqual(restoreState(saved, pageData).team[0].targetOverrides, { 1: "1003" });
  assert.equal(restoreState({ ...saved, team: [{ ...saved.team[0], targetOverrides: "坏" }] }, pageData).team[0].targetOverrides, undefined);
});

test("逐动改目标只管这一动的普攻、战技，不改同一动后面开大的目标", () => {
  // 星期日第 1 动战技改给姬子（站位 2），第 1 动后手动开大：终结技仍按平时的目标给玲可（站位 1）。
  const engine = createBattle({
    team: [{ id: "1313", targetScript: [2], manualUltimates: [1], rotation: "skill" }, { id: "1110", baseSpd: 1 }, { id: "1003", baseSpd: 1 }],
    maxAV: 300,
    useTechnique: false,
  }, game);
  const hits: string[] = [];
  engine.on("allyTargeted", ({ ability, target }) => hits.push(`${ability}:${target.slot}`));
  engine.run();
  assert.deepEqual(hits.slice(0, 3), ["战技:2", "终结技:1", "战技:1"]);
  assert.equal(engine.actionTargetOf(0, 1), 2);
  assert.equal(engine.actionTargetOf(0, 2), 1);
});
