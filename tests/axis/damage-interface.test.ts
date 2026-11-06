/** 伤害接口：账本怎么记攻击、怎么把状态交给模型、怎么报缺资料。这里的倍率都是假数，只验接口，不验游戏数值。 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { createBattle, type BattleInput, type GameData } from "../../axis-engine/src/battle.ts";
import { checkDamageData, zoneProduct } from "../../axis-engine/src/damage/data.ts";
import type { DamageLedger } from "../../axis-engine/src/damage/ledger.ts";
import type { DamageModel, ZoneBuff } from "../../axis-engine/src/damage/types.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const dataDir = join(HERE, "..", "..", "modules", "honkai-star-rail", "data");
const json = (name: string) => JSON.parse(readFileSync(join(dataDir, name), "utf-8"));
const data: GameData = { axis: json("axis_data.json"), characters: json("characters.json") };

const HIMEKO = "1003";
const LYNX = "1110";
const team = [{ id: HIMEKO, baseSpd: 100, traceSpd: 0, initialEnergy: 0 }, { id: LYNX, baseSpd: 50, traceSpd: 0, initialEnergy: 0 }];
const input = (extra: Partial<BattleInput> = {}): BattleInput => ({ team, maxAV: 300, useTechnique: false, ...extra });
const buff = (extra: Partial<ZoneBuff> = {}): ZoneBuff => ({ id: "b", zone: "boost", value: 0.2, holder: 0, clock: 0, turns: 2, label: "测试", ...extra });

test("不开账本时结果里没有 damage，开了时间轴也一模一样", () => {
  const off = createBattle(input(), data).run();
  const on = createBattle(input({ damage: {} }), data).run();
  assert.equal("damage" in off, false);
  assert.ok(on.damage);
  assert.deepEqual(on.timeline, off.timeline);
  assert.deepEqual(on.units, off.units);
});

test("每次攻击记一行，指回同一个人的时间轴记录", () => {
  const { damage, timeline } = createBattle(input({ damage: {} }), data).run();
  assert.ok(damage!.rows.length > 0);
  damage!.rows.forEach((row, index) => {
    assert.equal(row.index, index);
    assert.ok(row.event !== null);
    assert.equal(timeline[row.event!].slot, row.slot);
  });
  assert.equal(damage!.byUnit.reduce((sum, unit) => sum + unit.hits, 0), damage!.rows.length);
});

test("每个角色每次开大都正好记一行：不算攻击事件的不漏，自己结算的不重复", () => {
  for (const id of Object.keys(data.axis.characters)) {
    const partner = id === HIMEKO ? LYNX : HIMEKO;
    const members = [{ id, baseSpd: 160, traceSpd: 0, initialEnergy: 9999 }, { id: partner, baseSpd: 90, traceSpd: 0 }];
    const { damage, timeline } = createBattle(input({ team: members, maxAV: 600, damage: {} }), data).run();
    const casts = timeline.filter((event) => event.slot === 0 && event.type === "ultimate").length;
    assert.equal(damage!.rows.filter((row) => row.slot === 0 && row.kind === "ultimate").length, casts, `角色 ${id}`);
  }
});

test("不算攻击事件的终结技标成 ultimate，模块能自己记持续伤害这类", () => {
  const engine = createBattle(input({ team: [{ id: LYNX, baseSpd: 100, traceSpd: 0, initialEnergy: 9999 }], damage: {} }), data);
  const ledger = engine.module<DamageLedger>("damage")!;
  ledger.recordHit(engine.units[0], "dot");
  const { damage } = engine.run();
  assert.equal(damage!.rows[0].kind, "dot");
  assert.equal(damage!.rows[0].source, "other");
  assert.ok(damage!.rows.some((row) => row.kind === "ultimate" && row.source === "ultimate"));
});

test("没给模型时不算数，也不报缺资料", () => {
  const { damage } = createBattle(input({ damage: {} }), data).run();
  assert.equal(damage!.total, null);
  assert.deepEqual(damage!.missing, []);
});

test("模型算不出的攻击进 missing，不当成 0；能算的加起来", () => {
  const model: DamageModel = { evaluate: (hit) => (hit.unitId === HIMEKO && hit.kind === "skill" ? { zones: [], expected: 100 } : null) };
  const { damage } = createBattle(input({ damage: { model } }), data).run();
  const skills = damage!.rows.filter((row) => row.unitId === HIMEKO && row.kind === "skill").length;
  assert.ok(skills > 0);
  assert.equal(damage!.total, skills * 100);
  assert.equal(damage!.byUnit[0].total, skills * 100);
  assert.equal(damage!.byUnit[1].total, 0);
  assert.ok(damage!.missing.some((item) => item.unitId === LYNX && item.count > 0));
  assert.ok(!damage!.missing.some((item) => item.unitId === HIMEKO && item.kind === "skill"));
});

test("模型拿到面板和敌人，没传的是 null", () => {
  const seen: unknown[] = [];
  const model: DamageModel = { evaluate: (hit, context) => { seen.push([hit.unitId, context.attacker, context.enemy]); return null; } };
  const enemy = { level: 95, weakness: [], resistance: {} };
  createBattle(input({ damage: { model, enemy, stats: { [HIMEKO]: { atk: 3000 } } } }), data).run();
  assert.ok(seen.some((item) => JSON.stringify(item) === JSON.stringify([HIMEKO, { atk: 3000 }, enemy])));
  assert.ok(seen.some((item) => (item as unknown[])[0] === LYNX && (item as unknown[])[1] === null));
});

test("这一下算的是打出去那一刻的状态：攻击之后才上的加成算下一下", () => {
  const values: number[] = [];
  const model: DamageModel = { evaluate: (_hit, { buffs }) => { values.push(buffs.length); return null; } };
  const engine = createBattle(input({ team: [team[0]], damage: { model } }), data);
  const ledger = engine.module<DamageLedger>("damage")!;
  engine.on("attack", () => ledger.addBuff(buff({ turns: null, clock: null })));
  engine.run();
  assert.ok(values.length >= 2);
  assert.equal(values[0], 0);
  assert.equal(values[1], 1);
});

test("加成按持有者的回合数过期，回合内才上的当回合不减；重新上一次覆盖旧的", () => {
  const engine = createBattle(input({ team: [team[0]], damage: {} }), data);
  const ledger = engine.module<DamageLedger>("damage")!;
  const counts: number[] = [];
  let added = false;
  engine.on("turnStart", () => {
    if (added) return;
    added = true;
    ledger.addBuff(buff());
    ledger.addBuff(buff());
  });
  engine.on("turnEnd", () => counts.push(ledger.buffsFor(0).length), 1000);
  engine.run();
  assert.deepEqual(counts.slice(0, 3), [1, 1, 0]);
});

test("加成只对吃到的人生效：别人的不算，全队和敌人身上的都算", () => {
  const engine = createBattle(input({ damage: {} }), data);
  const ledger = engine.module<DamageLedger>("damage")!;
  ledger.addBuff(buff({ id: "self", holder: 1 }));
  ledger.addBuff(buff({ id: "team", holder: "team" }));
  ledger.addBuff(buff({ id: "enemy", holder: "enemy" }));
  assert.deepEqual(ledger.buffsFor(0).map((item) => item.id), ["team", "enemy"]);
  ledger.removeBuff("team");
  assert.deepEqual(ledger.buffsFor(1).map((item) => item.id), ["self", "enemy"]);
});

test("各乘区相乘", () => {
  assert.equal(zoneProduct(100, []), 100);
  assert.equal(zoneProduct(100, [{ zone: "a", factor: 1.5 }, { zone: "b", factor: 0.5 }]), 75);
});

const good = {
  version: 1,
  zones: [{ id: "boost", name: "增伤" }],
  skills: { [HIMEKO]: { skill: { parts: [{ stat: "atk", ratio: [1, 1.1], target: "main", hits: [0.4, 0.6] }] } } },
  modifiers: [{ source: "测试", zone: "boost", value: [0.1, 0.2] }],
};

test("资料检查：格式对时没有问题", () => {
  assert.deepEqual(checkDamageData(good), []);
  assert.deepEqual(checkDamageData({ ...good, skills: { [LYNX]: { ultimate: { parts: [] } } } }), [], "空 parts 表示确认没有伤害");
});

test("资料检查：把每一处问题都列出来，写清楚位置", () => {
  const bad = {
    version: 2,
    zones: [{ id: "boost", name: "增伤" }, { id: "boost", name: "重复" }],
    skills: { [HIMEKO]: { skill: { parts: [{ ratio: [], target: "front", hits: [0.5] }] }, ultimate: {} } },
    modifiers: [{ zone: "unknown", value: "x" }],
  };
  const problems = checkDamageData(bad).join("\n");
  for (const text of ["version", "boost 重复", `skills.${HIMEKO}.skill.parts[0] 缺 stat`, "target 不对：front", "ratio", "hits 加起来", `skills.${HIMEKO}.ultimate 没有 parts`, "modifiers[0] 缺 source", "unknown", "value"]) {
    assert.ok(problems.includes(text), `应该提到「${text}」：\n${problems}`);
  }
  assert.deepEqual(checkDamageData("x"), ["伤害资料不是 JSON 对象"]);
});
