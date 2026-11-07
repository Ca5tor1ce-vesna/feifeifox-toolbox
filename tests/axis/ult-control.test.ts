/**
 * 留大、开大顺序和进场角色。数字手算：自定义角色只有填写的数值，没有别的机制。
 * 真珠、刻律德菈的秘技口径来自 4.6.54 版本资料：秘技效果跟着当前操控的角色走，进战斗时在进场角色身上。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { createBattle, type BattleInput, type CustomCharacter, type GameData, type MemberInput } from "../../axis-engine/src/battle.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const dataDir = join(HERE, "..", "..", "modules", "honkai-star-rail", "data");
const json = (name: string) => JSON.parse(readFileSync(join(dataDir, name), "utf-8"));
const data: GameData = { axis: json("axis_data.json"), characters: json("characters.json") };

const battle = (input: BattleInput) => createBattle({ useTechnique: false, ...input }, data);
const near = (actual: number, expected: number, message = "") =>
  assert.ok(Math.abs(actual - expected) < 1e-7, `${message} 期望 ${expected}，实际 ${actual}`);

/** 能量上限 60、战技回 30、开大返还 5，没有任何效果。 */
const plain = (name: string, baseSpd: number, extra: Partial<MemberInput> = {}): MemberInput => {
  const custom: CustomCharacter = {
    name, baseSpd, maxEnergy: 60, energy: { basic: 20, skill: 30, ultimate: 5 },
    skillAllyAdvance: 0, skillAllyEnergy: 0, ultSelfAdvance: 0, ultTeamAdvance: 0, ultExtraTurn: false, ultSpeedPct: 0, ultSpeedTurns: 1,
  };
  return { id: `custom-${name}`, custom, initialEnergy: 0, err: 0, rotation: "skill", ...extra };
};
const ultimates = (engine: ReturnType<typeof battle>) =>
  engine.timeline.filter((row) => row.type === "ultimate").map((row) => ({ name: row.name, av: row.av }));

// 甲 100 速：100、200、300 AV 行动，第 2 动后能量 30+30=60 满。乙 80 速：125、250 AV 行动，能量上限 60 但每动只回 30，第 2 动才满。

test("有大就开：甲第 2 动（200 AV）能量满了当场开", () => {
  const engine = battle({ team: [plain("甲", 100), plain("乙", 80)], maxAV: 260 });
  engine.run();
  const first = ultimates(engine).filter((row) => row.name === "甲");
  assert.equal(first.length, 1);
  near(first[0].av, 200);
});

test("留大：开大点在乙第 2 动后，甲 200 AV 满能也不开，等到 250 AV 才开", () => {
  const engine = battle({
    team: [plain("甲", 100, { ultMode: "hold", ultAfter: [{ slot: 1, action: 2 }] }), plain("乙", 80)],
    maxAV: 260,
  });
  engine.run();
  const jia = ultimates(engine).filter((row) => row.name === "甲");
  assert.equal(jia.length, 1);
  near(jia[0].av, 250);
  // 开大 60 → 0，返还 5。
  near(engine.units[0].energy, 5);
});

test("留大：到了开大点能量不够，记一笔，攒够了马上开", () => {
  // 开大点在乙第 1 动（125 AV），甲那时只有 30；200 AV 第 2 动满 60 当场开。
  const engine = battle({
    team: [plain("甲", 100, { ultMode: "hold", ultAfter: [{ slot: 1, action: 1 }] }), plain("乙", 80)],
    maxAV: 260,
  });
  engine.run();
  const note = engine.timeline.find((row) => row.label === "留大：到了开大点");
  assert.ok(note, "到点时记下能量不够");
  near(note.av, 125);
  assert.ok(note.details[0].includes("能量 30/60 不够"), note.details[0]);
  const jia = ultimates(engine).filter((row) => row.name === "甲");
  assert.equal(jia.length, 1);
  near(jia[0].av, 200);
});

test("留大：没设开大点就一直不开", () => {
  const engine = battle({ team: [plain("甲", 100, { ultMode: "hold", ultAfter: [] })], maxAV: 400 });
  engine.run();
  assert.equal(ultimates(engine).length, 0);
  near(engine.units[0].energy, 60);
});

test("留大：开大点可以是自己的那一动", () => {
  // 第 3 动（300 AV）后开：200 AV 已满 60，第 3 动的战技回能溢出，300 AV 开大。
  const engine = battle({ team: [plain("甲", 100, { ultMode: "hold", ultAfter: [{ slot: 0, action: 3 }] })], maxAV: 310 });
  engine.run();
  assert.deepEqual(ultimates(engine).map((row) => row.av), [300]);
});

test("开大顺序：两人开局都满能，默认按站位，指定后按指定的先后", () => {
  const full = { initialEnergy: 60 };
  const team = [plain("甲", 100, full), plain("乙", 80, full)];
  const byDefault = battle({ team, maxAV: 1 });
  byDefault.run();
  assert.deepEqual(ultimates(byDefault).map((row) => row.name), ["甲", "乙"]);
  const ordered = battle({ team, maxAV: 1, ultOrder: [1, 0] });
  ordered.run();
  assert.deepEqual(ultimates(ordered).map((row) => row.name), ["乙", "甲"]);
});

test("开大顺序：两人的开大点在同一动后，按开大顺序开", () => {
  const point = { ultMode: "hold" as const, ultAfter: [{ slot: 0, action: 1 }], initialEnergy: 60 };
  const team = [plain("甲", 100, point), plain("乙", 80, point)];
  const ordered = battle({ team, maxAV: 110, ultOrder: [1] });
  ordered.run();
  assert.deepEqual(ultimates(ordered).map((row) => row.name), ["乙", "甲"]);
});

test("参数不对时报看得懂的错", () => {
  assert.throws(() => battle({ team: [plain("甲", 100)], leadSlot: 3 }), /进场角色的站位不对/);
  assert.throws(() => battle({ team: [plain("甲", 100)], ultOrder: [2] }), /开大顺序里的站位不对/);
  assert.throws(() => battle({ team: [plain("甲", 100, { ultMode: "hold", ultAfter: [{ slot: 0, action: 0 }] })] }), /开大点不对/);
});

test("刻律德菈：指定进场角色时，秘技那次战技把【军功】给进场角色，不是战技目标", () => {
  const team: MemberInput[] = [{ id: "1412", targetSlot: 1, traceSpd: 0 }, { id: "1408", traceSpd: 0 }, { id: "1218", traceSpd: 0 }];
  const mark = (input: Partial<BattleInput>) => {
    const engine = battle({ team, maxAV: 1, useTechnique: true, ...input });
    engine.run();
    return engine.timeline.find((row) => row.label === "战技：施加【军功】")?.name;
  };
  assert.equal(mark({}), "白厄", "不指定时和以前一样给战技目标");
  assert.equal(mark({ leadSlot: 2 }), "椒丘");
  assert.equal(mark({ leadSlot: 2, useTechnique: false }), undefined, "不用秘技时没有这次战技，进场角色不起作用");
});

test("真珠：秘技的【美学底本】是进场角色，开大后换成大招目标", () => {
  const team = (initialEnergy: number): MemberInput[] => [
    { id: "1503", targetSlot: 2, initialEnergy, traceSpd: 0 },
    { id: "1501", traceSpd: 0 },
    { id: "1218", traceSpd: 0 },
  ];
  const aeste = (engine: ReturnType<typeof battle>) => (engine.units[0].kit as unknown as { aesteSlot: number }).aesteSlot;
  // 不开大：开局【美学底本】在进场角色（1 号位，欢愉），【艺术壁垒】按他武装。
  const opening = battle({ team: team(0), maxAV: 1, useTechnique: true, leadSlot: 1 });
  opening.run();
  assert.equal(aeste(opening), 1);
  assert.equal(opening.timeline.filter((row) => row.label === "艺术壁垒武装").length, 1, "进场角色是欢愉，开局武装");
  assert.ok(opening.timeline.some((row) => row.label === "真珠秘技" && row.details[0].includes("成为【美学底本】")));
  // 不指定进场角色：和以前一样用【美学底本】目标（2 号位，不是欢愉，不武装）。
  const old = battle({ team: team(0), maxAV: 1, useTechnique: true });
  old.run();
  assert.equal(aeste(old), 2);
  assert.equal(old.timeline.filter((row) => row.label === "艺术壁垒武装").length, 0);
  // 开局满能开大：大招目标是 2 号位。
  const ult = battle({ team: team(180), maxAV: 1, useTechnique: true, leadSlot: 1 });
  ult.run();
  assert.equal(ultimates(ult).length, 1);
  assert.equal(aeste(ult), 2);
});

test("真珠：进场角色是真珠自己时，【美学底本】按选的目标", () => {
  const engine = battle({ team: [{ id: "1503", targetSlot: 1 }, { id: "1501" }], maxAV: 1, useTechnique: true, leadSlot: 0 });
  engine.run();
  assert.equal((engine.units[0].kit as unknown as { aesteSlot: number }).aesteSlot, 1);
  assert.ok(engine.timeline.some((row) => row.label === "真珠秘技" && row.details[0].startsWith("进场角色是真珠自己")));
});
