/** 浏览器里的「后端」：外壳和各功能页发往 /api/... 的请求都在这里就地处理，不再需要 Python 服务。
 *
 * 2026-11-04 用户决定去掉 Python：计算已经都在浏览器里（各功能的 calc.ts / axis-engine），
 * 剩下的只有「列出功能、读数据、读写存档」，由这个文件接住。同一份站点可以跑在三个地方：
 *   - 开发：node tools/serve.mjs 直接把仓库当静态站点；
 *   - exe：Rust 外壳（desktop/），存档经 Tauri 命令写进 exe 旁边的 userdata/，文件名和以前完全一样；
 *   - B站 Toy：站点在 /toy/<id>/ 子路径下，存档放浏览器本地，可以导出导入。
 * 所以所有静态文件都按「站点根目录」（index.html 所在目录）解析，数据里的 /modules/... 也在这里换成站点内的路径。
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createApi } from "../../speed-ui/src/calc.ts";
import { createStore, LEGACY_FILES, type Store } from "./store.ts";
import { buildStatData } from "../../ui-shared/src/stats/data.ts";
import type { StatData } from "../../ui-shared/src/stats/types.ts";
import { ROSTER, rosterActions, speedConfigFromRoster } from "./roster-actions.ts";
import { teamActions } from "./teams.ts";

declare global {
  interface Window {
    GT_BACKEND?: {
      store: Store;
      siteUrl: (path: string) => string;
      exportAll: () => Promise<Record<string, unknown>>;
      importAll: (data: Record<string, unknown>) => Promise<string[]>;
      importFiles: (files: { name: string; text: string }[]) => Promise<string[]>;
    };
  }
}

const siteRoot = new URL(".", document.baseURI);
/** 站点里的文件地址。传入 /modules/x 或 modules/x 都按站点根目录解析。 */
export const siteUrl = (path: string): string => new URL(path.replace(/^\//, ""), siteRoot).href;
/** 数据里写的站内绝对路径（/modules/...、/app/...）换成站点内的路径：Toy 版在子路径下，绝对路径会指错。 */
function relocate(value: unknown): unknown {
  if (typeof value === "string") return /^\/(modules|app)\//.test(value) ? new URL(value.slice(1), siteRoot).pathname : value;
  if (Array.isArray(value)) return value.map(relocate);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, relocate(item)]));
  return value;
}

const realFetch = window.fetch.bind(window);
async function fetchJSON(path: string): Promise<any> {
  const response = await realFetch(siteUrl(path), { cache: "no-cache" });
  if (!response.ok) throw new Error(`读不到 ${path}（HTTP ${response.status}）`);
  return JSON.parse((await response.text()).replace(/^﻿/, ""));
}

const store = createStore();
const dataCache = new Map<string, Promise<any>>();
const readData = (moduleId: string, name: string): Promise<any> => {
  if (!/^[A-Za-z0-9_-]+$/.test(moduleId) || !/^[A-Za-z0-9_-]+$/.test(name)) return Promise.reject(new Error(`数据名不对：${moduleId}/${name}`));
  const key = `${moduleId}/${name}`;
  if (!dataCache.has(key)) {
    const loading = fetchJSON(`modules/${moduleId}/data/${name}.json`).then(relocate);
    loading.catch(() => dataCache.delete(key));
    dataCache.set(key, loading);
  }
  return dataCache.get(key)!;
};

// ---- 「我的配装」：和以前一样存在 honkai-star-rail/speed-plan-presets，全角色行动轴也读这一份 ---- //
const PRESETS = "honkai-star-rail/speed-plan-presets";
let speedCalc: Promise<ReturnType<typeof createApi>> | null = null;
function presetCalc() {
  speedCalc ??= Promise.all(["characters", "lightcones", "relic_sets", "modes", "data_info"].map((name) => readData("honkai-star-rail", name).catch(() => ({}))))
    .then(([characters, lightcones, relicSets, modes, dataInfo]) => createApi(
      { characters, lightcones, relic_sets: relicSets, modes, dataInfo },
      { load: () => store.get(PRESETS) ?? {}, save: (value: unknown) => store.set(PRESETS, value) },
    ));
  return speedCalc;
}

// ---- 「角色与遗器」：面板计算用的查表，按需读一次 ---- //
let statData: Promise<StatData> | null = null;
const loadStatData = (): Promise<StatData> => {
  statData ??= Promise.all(["characters", "lightcones", "relic_sets", "relic_pieces"].map((name) => readData("honkai-star-rail", name)))
    .then(([characters, lightcones, relicSets, relicPieces]) => buildStatData(characters, lightcones, relicSets, relicPieces));
  statData.catch(() => { statData = null; });
  return statData;
};

/** 配速查询「用实际装配填入」：读「角色与遗器」存档里这个角色和他身上的遗器。 */
async function rosterSpeedConfig(characterId: string) {
  const save = store.get(ROSTER) as any;
  const character = save?.characters?.[characterId];
  if (!character) throw new Error("「角色与遗器」里还没有这个角色：先去那里导入或添加。");
  const relics = (save.relics ?? []).filter((relic: any) => relic.equippedBy === characterId);
  return speedConfigFromRoster(character, relics, await loadStatData(), await presetCalc());
}

type Handler = (payload: any) => unknown | Promise<unknown>;
const ACTIONS: Record<string, Record<string, Handler>> = {
  "honkai-star-rail/speed-plan": {
    // 页面自己在浏览器里算（speed-ui/src/calc.ts）；这几个动作留着，验收脚本和以后别的页面也能按以前的接口调用。
    catalog: async (payload) => (await presetCalc()).call("catalog", payload),
    lightcones: async (payload) => (await presetCalc()).call("lightcones", payload),
    plan: async (payload) => (await presetCalc()).call("plan", payload),
    recommend: async (payload) => (await presetCalc()).call("recommend", payload),
    presets: async (payload) => (await presetCalc()).call("presets", payload),
    save_preset: async (payload) => { const result = (await presetCalc()).call("save_preset", payload); await store.flush(); return result; },
    delete_preset: async (payload) => { const result = (await presetCalc()).call("delete_preset", payload); await store.flush(); return result; },
    roster_speed_config: async (payload) => rosterSpeedConfig(String(payload?.characterId ?? "")),
  },
  "honkai-star-rail/axis": { ...teamActions(store, () => store.get(PRESETS) ?? {}), roster_get: () => store.get(ROSTER) ?? null },
  "honkai-star-rail/roster": rosterActions(store, loadStatData),
};

// ---- 功能列表：tools/build_pages.mjs 扫 modules/ 生成 app/registry.json ---- //
async function registry(): Promise<any> {
  const data = await fetchJSON("app/registry.json");
  for (const module of data.modules || []) {
    for (const feature of module.features || []) {
      feature.actions = Object.keys(ACTIONS[`${module.id}/${feature.id}`] ?? {}).sort();
      for (const key of ["baseUrl", "uiUrl", "styleUrl"]) if (feature[key]) feature[key] = relocate(feature[key]);
    }
  }
  return data;
}

async function handle(method: string, path: string, body: any): Promise<Record<string, unknown>> {
  if (path === "/api/registry") return registry();
  if (path.startsWith("/api/data/")) {
    const [moduleId, name] = path.slice("/api/data/".length).split("/").map(decodeURIComponent);
    return { name, data: await readData(moduleId, name) };
  }
  if (path === "/api/ui-state") {
    const saved = (store.get("ui-state") as any) ?? { version: 1, entries: {} };
    if (method === "GET") return { ...saved, storageId: store.kind };
    const { key, entry } = body ?? {};
    if (typeof key !== "string" || !/^[A-Za-z0-9/_-]{1,120}$/.test(key)) throw new Error("非法页面状态名称。");
    if (!entry || typeof entry !== "object" || entry.version !== 1 || !entry.value || typeof entry.value !== "object") throw new Error("页面状态需要版本号和对象内容。");
    if (!Number.isFinite(entry.updatedAt) || entry.updatedAt <= 0) throw new Error("页面状态的更新时间无效。");
    const old = saved.entries?.[key];
    if (old && old.updatedAt >= entry.updatedAt) return { saved: false, entry: old };
    store.set("ui-state", { version: 1, entries: { ...saved.entries, [key]: entry } });
    await store.flush();
    return { saved: true, entry };
  }
  if (path === "/api/call") {
    const { module, feature, action, payload } = body ?? {};
    const handler = ACTIONS[`${module}/${feature}`]?.[action];
    if (!handler) throw new Error(`功能 ${module}/${feature} 没有动作 '${action}'`);
    return { result: await handler(JSON.parse(JSON.stringify(payload ?? {}))) };
  }
  throw new Error(`未知接口：${path}`);
}

const reply = (status: number, data: unknown): Response => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = new URL(input instanceof Request ? input.url : String(input), location.href);
  // 只接站点自己的 /api/...（Toy 在子路径下时外壳请求的还是根上的 /api/...）。
  if (url.origin !== location.origin || !url.pathname.startsWith("/api/")) return realFetch(input, init);
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  try {
    await store.ready;
    const raw = init?.body ?? (input instanceof Request ? await input.text() : null);
    const body = typeof raw === "string" && raw ? JSON.parse(raw) : null;
    return reply(200, { ok: true, ...(await handle(method, url.pathname, body)) });
  } catch (error) {
    return reply(400, { ok: false, error: (error as Error)?.message ?? String(error) });
  }
};

window.GT_BACKEND = {
  store,
  siteUrl,
  exportAll: async () => { await store.ready; return store.exportAll(); },
  importAll: async (data) => { await store.ready; const names = store.importAll(data); await store.flush(); return names; },
  importFiles: async (files) => {
    await store.ready;
    const names = new Set<string>();
    for (const file of files) {
      let data: unknown;
      try {
        data = JSON.parse(file.text.replace(/^﻿/, ""));
      } catch {
        throw new Error(`${file.name} 不是 JSON 文件`);
      }
      // 以前 userdata 里的单个文件按文件名认；导出的存档文件里自己写着是哪几份。
      const legacy = LEGACY_FILES[file.name.replace(/^.*[\/]/, "")];
      for (const name of store.importAll(legacy ? { [legacy]: data } : (data as Record<string, unknown>))) names.add(name);
    }
    await store.flush();
    return [...names];
  },
};

// exe 里（Tauri）点外部链接（b站主页、GitHub）：交给系统默认浏览器，不在工具箱窗口里打开。
const tauriInvoke = (globalThis as { __TAURI__?: { core?: { invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown> } } }).__TAURI__?.core?.invoke;
if (tauriInvoke) {
  document.addEventListener("click", (event) => {
    const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!link || !/^https?:\/\//.test(link.href) || new URL(link.href).origin === location.origin) return;
    event.preventDefault();
    tauriInvoke("open_external", { url: link.href }).catch((error) => console.warn("打不开链接：", error));
  }, true);
}
