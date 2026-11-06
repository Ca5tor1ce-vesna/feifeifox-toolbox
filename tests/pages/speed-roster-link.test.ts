/**
 * 配速查询按「角色与遗器」的实际装配算（2026-11-05）：有实际装配就自动用、遗器那几项只填面板相关的、
 * 手动改 / 改回 / 套用别的配装时的切换。后端用假的 call，预期按规则手写。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { createApi } from "../../speed-ui/src/calc.ts";
import { createPlanState } from "../../speed-ui/src/plan-state.ts";
import { useRosterLink } from "../../speed-ui/src/use-roster-link.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const DATA = join(ROOT, "modules", "honkai-star-rail", "data");
const json = (name: string): any => JSON.parse(readFileSync(join(DATA, `${name}.json`), "utf-8"));

const FILLED = {
  config: {
    lightconeId: "23058", superimpose: 5, eidolon: 6,
    relic: { speedBoots: true, fourPieceId: "126", fourPieceUlts: 0, ultTargetsAlly: false, ornamentIds: ["318", ""], substatSpeed: 4.6, customPct: 0, customFlat: 0.03 },
  },
  panelSpeed: 138.6,
  notes: ["说明"],
};

function setup(reply: unknown) {
  const s = createPlanState({ characters: [{ id: "1505", name: "绯英", path: "Elation" }, { id: "1001", name: "三月七", path: "Preservation" }] });
  const calls: unknown[] = [];
  let runs = 0;
  const link = useRosterLink(s, {
    call: async (action, payload) => {
      calls.push([action, payload]);
      if (reply instanceof Error) throw reply;
      return reply;
    },
    updateSplash: () => {},
    run: async () => { runs += 1; },
  });
  return { s, link, calls, runs: () => runs };
}

test("有实际装配：光锥、叠影、星魂和面板相关的遗器项照填，开大次数和「其它速度 %」保留用户填的", async () => {
  const { s, link, calls } = setup(FILLED);
  s.state.characterId = "1505";
  s.state.relic.fourPieceUlts = 2;
  s.state.relic.customPct = 10;
  s.state.enabled = ["x"];
  assert.equal(await link.linkRoster(), true);
  assert.deepEqual(calls, [["roster_speed_config", { characterId: "1505", optional: true }]]);
  assert.equal(s.state.lightconeId, "23058");
  assert.equal(s.state.superimpose, 5);
  assert.equal(s.state.eidolon, 6);
  assert.equal(s.state.enabled, null, "光锥换了，效果勾选恢复默认");
  assert.deepEqual(
    { ...s.state.relic },
    { speedBoots: true, fourPieceId: "126", fourPieceUlts: 2, ultTargetsAlly: false, ornamentIds: ["318", ""], substatSpeed: 4.6, customPct: 10, customFlat: 0.03 },
  );
  assert.equal(s.form.substat, "4.6", "输入框跟着刷新");
  assert.deepEqual(link.rosterLinked.value, { panelSpeed: 138.6, notes: ["说明"] });
  assert.equal(link.rosterHas.value, true);

  // 光锥没变时（回到页面）不动效果勾选
  s.state.enabled = ["y"];
  await link.linkRoster();
  assert.deepEqual(s.state.enabled, ["y"]);
});

test("没有实际装配（后端返回 null）：不改任何东西，也不给「改回」", async () => {
  const { s, link } = setup(null);
  s.state.characterId = "1001";
  s.state.relic.substatSpeed = 12;
  assert.equal(await link.linkRoster(), false);
  assert.equal(link.rosterLinked.value, null);
  assert.equal(link.rosterHas.value, false);
  assert.equal(s.state.relic.substatSpeed, 12);
});

test("用不上实际装配时说明原因：还没导入 / 没这个角色 / 没穿遗器；能用时清掉", async () => {
  for (const missing of ["empty", "character", "relics"] as const) {
    const { s, link } = setup({ missing });
    s.state.characterId = "1001";
    s.state.relic.substatSpeed = 12;
    assert.equal(await link.linkRoster(), false);
    assert.equal(link.rosterMissing.value, missing);
    assert.equal(link.rosterLinked.value, null);
    assert.equal(link.rosterHas.value, false, "没有可改回的实际装配");
    assert.equal(s.state.relic.substatSpeed, 12, "手填的不动");
  }
  const { s, link } = setup(FILLED);
  s.state.characterId = "1505";
  await link.linkRoster();
  assert.equal(link.rosterMissing.value, "");
});

test("手动改后不再套；套用别的配装也算手动；「改回」重新套上并重算", async () => {
  const { s, link, runs } = setup(FILLED);
  s.state.characterId = "1505";
  await link.linkRoster();
  link.rosterManual();
  assert.equal(s.state.rosterMode, "manual");
  assert.equal(link.rosterLinked.value, null);
  s.state.relic.substatSpeed = 20;
  assert.equal(await link.linkRoster(), false, "手动模式下不覆盖用户填的");
  assert.equal(s.state.relic.substatSpeed, 20);
  assert.equal(link.rosterHas.value, true, "手动模式下给「改回」");

  await link.rosterBack();
  assert.equal(s.state.rosterMode, "auto");
  assert.equal(s.state.relic.substatSpeed, 4.6);
  assert.equal(runs(), 1);

  link.leaveRoster();
  assert.equal(s.state.rosterMode, "manual", "套用我的配速、自动推荐后切到手动");
});

test("读存档出错：说清楚原因，不按实际装配", async () => {
  const { s, link } = setup(new Error("光锥 99999 不在数据里"));
  s.state.characterId = "1505";
  assert.equal(await link.linkRoster(), false);
  assert.equal(link.rosterLinked.value, null);
  assert.match(link.rosterError.value, /99999/);
});

test("cone_art：给出光锥原画（角色卡上显示光锥用），lightcones 的输出不变", () => {
  const api = createApi({ characters: json("characters"), lightcones: json("lightcones"), relic_sets: json("relic_sets"), modes: json("modes"), dataInfo: {} });
  const cone = json("lightcones").find((item: any) => item.id === "23058");
  assert.equal(api.call("cone_art", {}).art["23058"], cone.portrait);
  assert.equal("portrait" in api.call("lightcones", {}).lightcones[0], false);
});
