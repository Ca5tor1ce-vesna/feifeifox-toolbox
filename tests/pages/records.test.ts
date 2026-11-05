/** 角色顶分：镜像轮换、SHA-256 校验、缓存和离线兜底、头像和光锥图标对照（从原来的 Python 测试搬过来）。 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { beijingNow, loadRecords, MIRRORS, validate, withAvatars, type CacheStore, type Fetcher } from "../../records-ui/src/records.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const json = (...parts: string[]): any => JSON.parse(readFileSync(join(ROOT, ...parts), "utf-8"));

const SAMPLE = {
  source: "https://theherta.com/archive", collected_at: "2026-10-15 16:28 UTC+8", selection_rule: "x",
  targets: [{ mode: "混沌回忆", season: "4.5", stage: "关卡", category: "0轮次", total_runs: 3,
    records: [{ group: "爻光", runs_in_group: 1, tag: "0轮次", cycle: "0", ltd: 1, std: 0, date: "2026-10-01 00:00",
      lineup: [{ name: "爻光", eidolon: 0, superimposition: 5 }] }] }],
};
const body = new TextEncoder().encode(JSON.stringify(SAMPLE));
const sha = createHash("sha256").update(body).digest("hex");

function fake(good: Set<string>, badSha = new Set<string>()) {
  const calls: string[] = [];
  const fetcher: Fetcher = async (url) => {
    calls.push(url);
    const name = MIRRORS.find((mirror) => url.startsWith(mirror.base))!.name;
    if (!good.has(name)) throw new Error("down");
    if (url.endsWith(".sha256")) return new TextEncoder().encode(`${badSha.has(name) ? "0".repeat(64) : sha}  latest.json\n`);
    return new Uint8Array(body);
  };
  return { fetcher, calls };
}
function memoryCache(): CacheStore & { value: any } {
  const store = { value: null as any, get: () => store.value, set: (value: any) => { store.value = JSON.parse(JSON.stringify(value)); } };
  return store;
}

test("镜像覆盖必要的几个地址，GitHub Raw 排第一", () => {
  const bases = MIRRORS.map((mirror) => mirror.base).join(" ");
  for (const host of ["raw.githubusercontent.com", "cdn.jsdelivr.net/gh/Ca5tor1ce-vesna/herta-data@main", "fastly.jsdelivr.net", "gcore.jsdelivr.net", "ghfast.top/https://", "gh-proxy.com/https://"]) {
    assert.ok(bases.includes(host), host);
  }
  assert.equal(MIRRORS[0].name, "GitHub Raw");
});

test("第一个能用的镜像胜出，校验不一致的跳过", async () => {
  const { fetcher } = fake(new Set(["jsDelivr", "ghfast.top"]), new Set(["jsDelivr"]));
  const result = await loadRecords({ refresh: true, cache: memoryCache(), fetcher });
  assert.equal(result.mirror, "ghfast.top");
  assert.equal(result.offline, false);
  assert.equal(result.sha256, sha);
  assert.deepEqual(result.attempts.map((a: any) => a.ok), [false, false, false, false, true]);
  assert.match(result.attempts[1].error, /校验不一致/);
});

test("缓存新鲜时不联网；全部连不上时用缓存并标离线", async () => {
  const cache = memoryCache();
  await loadRecords({ refresh: true, cache, fetcher: fake(new Set(["GitHub Raw"])).fetcher });
  const down = fake(new Set());
  const fresh = await loadRecords({ cache, fetcher: down.fetcher });
  assert.equal(fresh.from_cache, true);
  assert.deepEqual(down.calls, []);
  const offline = await loadRecords({ refresh: true, cache, fetcher: down.fetcher });
  assert.equal(offline.offline, true);
  assert.match(offline.note, /离线/);
  assert.equal(offline.data.targets[0].stage, "关卡");
  // 缓存过期（超过一小时）就重新联网
  const later = await loadRecords({ cache, fetcher: fake(new Set(["jsDelivr"])).fetcher, now: () => Date.now() + 2 * 3600 * 1000 });
  assert.equal(later.mirror, "jsDelivr");
});

test("没有镜像也没有缓存时报能看懂的错；缓存读坏了当没有", async () => {
  await assert.rejects(loadRecords({ refresh: true, cache: memoryCache(), fetcher: fake(new Set()).fetcher }), /所有镜像都连不上，且没有本地缓存/);
  const broken: CacheStore = { get: () => { throw new Error("bad json"); }, set: () => {} };
  await assert.rejects(loadRecords({ cache: broken, fetcher: fake(new Set()).fetcher }), /没有本地缓存/);
});

test("数据结构不对就拒绝", () => {
  assert.throws(() => validate({ targets: [{ mode: "未知", records: [] }] }), /target 异常/);
  assert.throws(() => validate({ targets: [] }), /缺少 targets/);
  assert.throws(() => validate({ targets: [{ mode: "混沌回忆", records: [{}] }] }), /record 异常/);
});

test("头像和光锥图标对照", () => {
  const characters = json("modules", "honkai-star-rail", "data", "characters.json");
  const lightcones = json("modules", "honkai-star-rail", "data", "lightcones.json");
  const result = withAvatars({ data: json("tests", "fixtures", "herta_lightcone_sample.json") }, characters, lightcones);
  const av = result.avatars;
  assert.equal(av["三月七 (巡猎)"], "/modules/honkai-star-rail/assets/1224.webp");
  const byId = Object.fromEntries(characters.map((c: any) => [c.id, c.icon]));
  assert.equal(av["开拓者 (欢愉)"], byId["8009"]);
  assert.equal(av["开拓者 (记忆)"], byId["8007"]);
  for (const name of ["砂金•戏浪", "银狼LV.999", "Archer", "Saber"]) assert.ok(av[name].startsWith("/modules/honkai-star-rail/assets/"), name);
  assert.deepEqual(result.unmapped, ["不存在的角色"]);
  const lc = result.lightcone_icons;
  assert.ok("一场谎言的终幕" in lc);
  assert.ok("舞! 舞! 舞!" in lc); // 半角/空格写法也能对上
  assert.ok("忍法帖·缭乱破魔" in lc); // · 与 • 等价
  assert.deepEqual(result.unmapped_lightcones, ["不存在的光锥"]);
});

test("现在的数据里每个角色都有头像", () => {
  const characters = json("modules", "honkai-star-rail", "data", "characters.json");
  const result = withAvatars({ data: json("tests", "fixtures", "herta_latest_snapshot.json") }, characters, []);
  assert.deepEqual(result.unmapped, []);
});

test("时间按北京时间写", () => {
  assert.equal(beijingNow(new Date(Date.UTC(2026, 10, 4, 16, 5))), "2026-11-05 00:05");
});

test("B站 Toy 版读随包数据：结果标 snapshot，读不到或结构不对都报错", async () => {
  const { loadSnapshot } = await import("../../records-ui/src/snapshot.ts");
  const ok = (value: unknown) => async () => ({ ok: true, status: 200, json: async () => value });
  const result = await loadSnapshot("x", ok({ fetched_at: "2026-11-04 20:44", sha256: sha, data: SAMPLE }));
  assert.equal(result.snapshot, true);
  assert.equal(result.offline, false);
  assert.equal(result.fetched_at, "2026-11-04 20:44");
  assert.equal(result.data.targets.length, 1);
  await assert.rejects(loadSnapshot("x", async () => ({ ok: false, status: 404, json: async () => null })), /随包的顶分数据读不到（HTTP 404）/);
  await assert.rejects(loadSnapshot("x", ok({ fetched_at: "", sha256: "", data: { targets: [] } })), /缺少 targets/);
});

test("打 Toy 包时抓数据：和页面同一套镜像与校验，全部连不上就报错", async () => {
  const { fetchRecordsSnapshot } = await import("../../tools/records_snapshot.mjs");
  const { snapshot, mirror } = await fetchRecordsSnapshot({ fetcher: fake(new Set(["jsDelivr"])).fetcher, now: () => new Date(Date.UTC(2026, 10, 4, 12, 44)) });
  assert.equal(mirror, "jsDelivr");
  assert.equal(snapshot.sha256, sha);
  assert.equal(snapshot.fetched_at, "2026-11-04 20:44");
  assert.deepEqual(snapshot.data, SAMPLE);
  await assert.rejects(fetchRecordsSnapshot({ fetcher: fake(new Set()).fetcher }), /角色顶分数据抓不到/);
});
