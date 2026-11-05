/**
 * FreeSR 格式导入（1.2「角色与遗器」，2026-11-05 用户要求）：只导入游戏里可能存在的遗器。
 * 合法性的规则按游戏规则手推：+15 五星遗器 4 条副词条、一共出现 8～9 次，单条 1～6 次，档位 0～2×次数。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { fromEnka } from "../../ui-shared/src/import/enka.ts";
import { fromFreeSr, isFreeSr } from "../../ui-shared/src/import/freesr.ts";
import { buildStatData } from "../../ui-shared/src/stats/data.ts";
import { relicProblem } from "../../ui-shared/src/stats/relic.ts";
import type { RelicPiece } from "../../ui-shared/src/stats/types.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const DATA = join(ROOT, "modules", "honkai-star-rail", "data");
const json = (path: string): any => JSON.parse(readFileSync(path, "utf-8"));
const data = buildStatData(json(join(DATA, "characters.json")), json(join(DATA, "lightcones.json")), json(join(DATA, "relic_sets.json")), json(join(DATA, "relic_pieces.json")));

// 绯英的头（铁骑的索敌战盔 +15，五星）：生命主词条，副词条 4/5/7/12 共 8 次。
const helmet: RelicPiece = {
  id: "r1", pieceId: "61191", level: 15, mainAffix: "1", equippedBy: "1505",
  subAffixes: [{ affix: "4", count: 1, step: 1 }, { affix: "5", count: 2, step: 2 }, { affix: "7", count: 1, step: 2 }, { affix: "12", count: 4, step: 5 }],
};
const withSubs = (subs: RelicPiece["subAffixes"], level = 15): RelicPiece => ({ ...helmet, level, subAffixes: subs });

test("Enka 拉下来的真实遗器全部合法", () => {
  const imported = fromEnka(json(join(ROOT, "tests", "fixtures", "roster", "enka-1505-1510.json")), data);
  assert.ok(imported.relics.length >= 10);
  for (const relic of imported.relics) assert.equal(relicProblem(relic, data), null, `${relic.pieceId} 被误判`);
  assert.equal(relicProblem(helmet, data), null);
});

test("游戏里不可能出现的遗器会被判出来", () => {
  assert.match(relicProblem(withSubs([{ affix: "4", count: 1, step: 0 }, { affix: "5", count: 2, step: 0 }, { affix: "7", count: 21, step: 2 }, { affix: "12", count: 3, step: 0 }]), data)!, /次数/);
  assert.match(relicProblem(withSubs([]), data)!, /一共 0 次/);
  assert.match(relicProblem(withSubs([{ affix: "4", count: 3, step: 0 }, { affix: "4", count: 3, step: 0 }, { affix: "7", count: 1, step: 0 }, { affix: "12", count: 1, step: 0 }]), data)!, /重复/);
  assert.match(relicProblem(withSubs([{ affix: "1", count: 2, step: 0 }, { affix: "5", count: 2, step: 0 }, { affix: "7", count: 2, step: 0 }, { affix: "12", count: 2, step: 0 }]), data)!, /主词条/, "头的主词条是生命固定值，副词条不能再有");
  assert.match(relicProblem(withSubs([{ affix: "4", count: 1, step: 3 }, { affix: "5", count: 2, step: 0 }, { affix: "7", count: 2, step: 0 }, { affix: "12", count: 3, step: 0 }]), data)!, /档位/);
  assert.match(relicProblem({ ...helmet, level: 18 }, data)!, /等级/);
  // 3 条副词条只在 +0~+2 出现（+3 起第 4 条就有了）
  assert.equal(relicProblem(withSubs([{ affix: "4", count: 1, step: 0 }, { affix: "5", count: 1, step: 0 }, { affix: "7", count: 1, step: 0 }], 0), data), null);
  assert.match(relicProblem(withSubs([{ affix: "4", count: 2, step: 0 }, { affix: "5", count: 1, step: 0 }, { affix: "7", count: 1, step: 0 }], 3), data)!, /条数/);
});

/** 一份最小的 FreeSR 文件：绯英（2 魂、行迹点了两个属性节点）、她的专武，一件合法一件捏造的头，一件没穿的。 */
const sample = {
  lightcones: [{ level: 80, item_id: 23058, rank: 3, promotion: 6, internal_uid: 1, equip_avatar: 1505 }, { level: 50, item_id: 23000, rank: 1, promotion: 3, internal_uid: 2, equip_avatar: 0 }],
  relics: [
    { level: 15, relic_id: 61191, relic_set_id: 119, main_affix_id: 1, sub_affixes: [{ sub_affix_id: 4, count: 1, step: 1 }, { sub_affix_id: 5, count: 2, step: 2 }, { sub_affix_id: 7, count: 1, step: 2 }, { sub_affix_id: 12, count: 4, step: 5 }], internal_uid: 10, equip_avatar: 1505 },
    { level: 15, relic_id: 61191, relic_set_id: 119, main_affix_id: 1, sub_affixes: [{ sub_affix_id: 7, count: 21, step: 2 }, { sub_affix_id: 4, count: 0, step: 0 }, { sub_affix_id: 5, count: 0, step: 0 }, { sub_affix_id: 12, count: 0, step: 0 }], internal_uid: 11, equip_avatar: 1505 },
    { level: 15, relic_id: 61191, relic_set_id: 119, main_affix_id: 1, sub_affixes: [{ sub_affix_id: 4, count: 0, step: 0 }, { sub_affix_id: 5, count: 0, step: 0 }, { sub_affix_id: 7, count: 0, step: 0 }, { sub_affix_id: 12, count: 0, step: 0 }], internal_uid: 0, equip_avatar: 0 },
  ],
  avatars: {
    1505: { owner_uid: 0, avatar_id: 1505, data: { rank: 2, skills: { 1505001: 6, 1505201: 1, 1505202: 1 } }, level: 80, promotion: 6, techniques: [], sp_value: 0, sp_max: 480 },
    9999: { owner_uid: 0, avatar_id: 9999, data: { rank: 0, skills: {} }, level: 80, promotion: 6 },
  },
  battle_config: {},
};

test("认得出 FreeSR 文件，v4 扫描文件不算", () => {
  assert.equal(isFreeSr(sample), true);
  assert.equal(isFreeSr(json(join(ROOT, "tests", "fixtures", "roster", "scanner-v4-sample.json"))), false);
  assert.equal(isFreeSr(null), false);
});

test("FreeSR：角色、星魂、行迹、光锥照常导入，只留合法遗器，跳过的合成一句", () => {
  const out = fromFreeSr(sample, data);
  assert.deepEqual(out.characters.map((c) => c.id), ["1505"]);
  const [feiying] = out.characters;
  assert.equal(feiying.eidolon, 2);
  assert.equal(feiying.level, 80);
  assert.equal(feiying.promotion, 6);
  assert.deepEqual(feiying.traces.sort(), ["1505201", "1505202"], "只记属性行迹节点，技能等级不算");
  assert.deepEqual(feiying.lightcone, { id: "23058", level: 80, promotion: 6, superimpose: 3 });
  assert.equal(out.relics.length, 1);
  assert.equal(out.relics[0].equippedBy, "1505");
  assert.deepEqual(out.relics[0].subAffixes, helmet.subAffixes);
  assert.ok(out.skipped.some((line) => line.includes("9999")), "数据里没有的角色要说一声");
  const impossible = out.skipped.filter((line) => line.includes("不可能"));
  assert.equal(impossible.length, 1, "两件捏造的遗器合成一句");
  assert.match(impossible[0], /2 件/);
});

test("不是 FreeSR 文件时给出能看懂的错误", () => {
  assert.throws(() => fromFreeSr({ relics: [] }, data), /FreeSR/);
});

test("女主开拓者（双数编号）统一成数据里的单数编号；男女主都有时只留第一个", async () => {
  const { canonicalCharacter } = await import("../../ui-shared/src/import/enka.ts");
  assert.equal(canonicalCharacter(8002, data), "8001");
  assert.equal(canonicalCharacter("8010", data), "8009");
  assert.equal(canonicalCharacter("1505", data), "1505");
  assert.equal(canonicalCharacter("9998", data), "9998");

  const relic = (owner: number) => ({ ...sample.relics[0], equip_avatar: owner });
  const only = fromFreeSr({ lightcones: [], relics: [relic(8002)], avatars: { 8002: { avatar_id: 8002, data: { rank: 6, skills: {} }, level: 80, promotion: 6 } } }, data);
  assert.deepEqual(only.characters.map((c) => [c.id, c.eidolon]), [["8001", 6]]);
  assert.equal(only.relics[0].equippedBy, "8001");

  const both = fromFreeSr({
    lightcones: [], relics: [relic(8002)],
    avatars: { 8001: { avatar_id: 8001, data: { rank: 0, skills: {} }, level: 80, promotion: 6 }, 8002: { avatar_id: 8002, data: { rank: 6, skills: {} }, level: 80, promotion: 6 } },
  }, data);
  assert.deepEqual(both.characters.map((c) => c.id), ["8001"]);
  assert.equal(both.relics[0].equippedBy, null, "穿在被跳过的那个开拓者身上的遗器按没穿算");
  assert.equal(both.skipped.filter((line) => line.includes("男女主")).length, 1);
});
