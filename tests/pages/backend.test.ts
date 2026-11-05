/** 浏览器里的后端：存档读写、坏文件不覆盖、导入导出、队伍存档（和以前 Python 后端一样的校验和报错）、功能列表。 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { buildRegistry, REGISTRY_FILE } from "../../tools/build_pages.mjs";
import { browserBackend, createStore, LEGACY_FILES, type Backend } from "../../shell/src/store.ts";
import { localStamp, TEAMS, teamActions } from "../../shell/src/teams.ts";

function memoryBackend(initial: Record<string, string> = {}, kind: Backend["kind"] = "tauri") {
  const files = new Map(Object.entries(initial));
  const backend: Backend = { kind, read: async (name) => files.get(name) ?? null, write: async (name, text) => { files.set(name, text); } };
  return { backend, files };
}
const member = { id: "1313" };
const fixedNow = () => new Date(2026, 10, 4, 18, 30, 5);

test("启动时把存档读进内存，改了写回同名文件（和以前 userdata 的文件一样）", async () => {
  const { backend, files } = memoryBackend({ "honkai-star-rail/speed-plan-presets": JSON.stringify({ 1502: { name: "爻光", config: {} } }) });
  const store = createStore(backend, null);
  await store.ready;
  assert.deepEqual(Object.keys(store.get("honkai-star-rail/speed-plan-presets") as object), ["1502"]);
  store.set("ui-state", { version: 1, entries: {} });
  await store.flush();
  assert.deepEqual(JSON.parse(files.get("ui-state")!), { version: 1, entries: {} });
});

test("存档文件坏了不当空的覆盖掉", async () => {
  const { backend, files } = memoryBackend({ [TEAMS]: "{坏了" });
  const store = createStore(backend, null);
  await store.ready;
  assert.throws(() => store.set(TEAMS, {}), /文件坏了/);
  assert.equal(files.get(TEAMS), "{坏了");
});

test("导出再导入：配装和队伍按键合并，导入的页面草稿替换本机的并排在后面", async () => {
  const a = createStore(memoryBackend({
    [TEAMS]: JSON.stringify({ x: { name: "旧" } }),
    "ui-state": JSON.stringify({ version: 1, entries: { p: { version: 1, updatedAt: 5, value: { v: "新" } } } }),
  }).backend, null);
  await a.ready;
  const backup = a.exportAll();
  const b = createStore(memoryBackend({
    [TEAMS]: JSON.stringify({ y: { name: "本机" } }),
    "ui-state": JSON.stringify({ version: 1, entries: { p: { version: 1, updatedAt: 9, value: { v: "本机更新" } } } }),
  }).backend, null);
  await b.ready;
  assert.deepEqual(b.importAll(backup).sort(), [TEAMS, "ui-state"].sort());
  assert.deepEqual(Object.keys(b.get(TEAMS) as object).sort(), ["x", "y"]);
  assert.equal((b.get("ui-state") as any).entries.p.value.v, "新");
  assert.ok((b.get("ui-state") as any).entries.p.updatedAt > Date.now() + 30_000);
  assert.throws(() => b.importAll({ nothing: 1 }), /没有能导入的存档/);
  assert.equal(LEGACY_FILES["speed-plan-presets.json"], "honkai-star-rail/speed-plan-presets");
});

test("浏览器版第一次打开时接过 B站 Toy 试用版存的队伍", async () => {
  const legacy = { getItem: (key: string) => (key === "feifeifox-axis-teams" ? JSON.stringify({ t: { name: "试用队" } }) : null) };
  const store = createStore(memoryBackend({}, "browser").backend, legacy);
  await store.ready;
  assert.deepEqual(store.get(TEAMS), { t: { name: "试用队" } });
});

test("浏览器存不进去时报能看懂的错", async () => {
  const backend = browserBackend({ getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); } });
  await assert.rejects(backend.write("ui-state", "{}"), /浏览器不让保存数据/);
});

test("队伍存档：存、改名、删，和以前后端一样的返回", async () => {
  const store = createStore(memoryBackend().backend, null);
  await store.ready;
  const actions = teamActions(store, () => ({ 1502: { name: "爻光" } }), () => "abc", fixedNow);
  assert.deepEqual(actions.library(), { presets: { 1502: { name: "爻光" } }, teams: {} });
  const saved = await actions.save_team({ name: "  阿哈队 ", team: [member], state: { mode: "moc" } });
  assert.equal(saved.id, "abc");
  assert.deepEqual({ ...saved.teams.abc, team: undefined, state: undefined }, { name: "阿哈队", format: "axis", savedAt: "2026-11-04T18:30:05", team: undefined, state: undefined });
  await actions.save_team({ id: "abc", name: "改名", team: [member, member], state: {} });
  assert.equal((store.get(TEAMS) as any).abc.name, "改名");
  assert.deepEqual(await actions.delete_team({ id: "abc" }), { teams: {} });
  assert.equal(localStamp(new Date(2026, 0, 2, 3, 4, 5)), "2026-01-02T03:04:05");
});

test("队伍存档的校验和报错跟以前后端一致", async () => {
  const store = createStore(memoryBackend().backend, null);
  await store.ready;
  const actions = teamActions(store, () => ({}), () => "x", fixedNow);
  await assert.rejects(actions.save_team({ name: " ", team: [member], state: {} }), /队伍名称需要 1 到 80 个字符/);
  await assert.rejects(actions.save_team({ name: "a".repeat(81), team: [member], state: {} }), /1 到 80/);
  await assert.rejects(actions.save_team({ name: "a", team: [], state: {} }), /队伍需要 1 到 4 名角色/);
  await assert.rejects(actions.save_team({ name: "a", team: [member, member, member, member, member], state: {} }), /1 到 4 名/);
  await assert.rejects(actions.save_team({ name: "a", team: ["1502"], state: {} }), /1 到 4 名/);
  await assert.rejects(actions.save_team({ name: "a", team: [member], state: [] }), /缺少队伍设置/);
  await assert.rejects(actions.save_team({ id: "gone", name: "a", team: [member], state: {} }), /已经不在了/);
  await assert.rejects(actions.delete_team({ id: "gone" }), /请选择已有的队伍存档/);
});

test("功能列表和 modules/ 同步，五个功能都在、隐藏的不在", () => {
  const fresh = buildRegistry();
  assert.equal(readFileSync(REGISTRY_FILE, "utf-8").replaceAll("\r\n", "\n"), fresh, "app/registry.json 过期了，运行 npm run build:pages");
  const registry = JSON.parse(fresh);
  const features = registry.modules.flatMap((module: any) => module.features.map((feature: any) => feature.id));
  assert.deepEqual(features, ["roster", "speed-plan", "axis", "gacha", "records"]);
  assert.equal(registry.toolbox.version, JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "package.json"), "utf-8")).version);
  assert.ok(registry.modules[0].features.every((feature: any) => feature.uiUrl?.endsWith("/ui.js")));
});
