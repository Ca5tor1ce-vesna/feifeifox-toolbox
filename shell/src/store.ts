/** 存档：配装、队伍和页面草稿。启动时一次读进内存，改了再写回去。
 *
 * - exe（Rust 外壳）：经 Tauri 命令读写 exe 旁边的 userdata/<名字>.json，和以前 Python 版的文件一模一样，
 *   老用户把 userdata 文件夹拷过来就能接着用，复制这个文件夹就是备份。
 * - 浏览器（开发、B站 Toy）：存在 localStorage，用「导出存档 / 导入存档」备份和搬家。
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

export const STORE_NAMES = ["honkai-star-rail/speed-plan-presets", "honkai-star-rail/aha-team-presets", "honkai-star-rail/roster", "ui-state"] as const;
export type StoreName = (typeof STORE_NAMES)[number];

/** 以前 Python 版 userdata 里的文件名 → 存档名，导入老存档时按文件名认。 */
export const LEGACY_FILES: Record<string, StoreName> = {
  "speed-plan-presets.json": "honkai-star-rail/speed-plan-presets",
  "aha-team-presets.json": "honkai-star-rail/aha-team-presets",
  "ui-state.json": "ui-state",
};
export const BACKUP_APP = "feifeifox-toolbox";

export interface Backend {
  kind: "tauri" | "browser";
  read(name: string): Promise<string | null>;
  write(name: string, text: string): Promise<void>;
}

export interface Store {
  kind: Backend["kind"];
  ready: Promise<void>;
  get(name: StoreName): unknown;
  set(name: StoreName, value: unknown): void;
  flush(): Promise<void>;
  exportAll(): Record<string, unknown>;
  importAll(data: Record<string, unknown>): string[];
}

const isRecord = (value: unknown): value is Record<string, any> => !!value && typeof value === "object" && !Array.isArray(value);

interface TauriWindow { __TAURI__?: { core?: { invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown> } } }

export function tauriBackend(): Backend | null {
  const invoke = (globalThis as TauriWindow).__TAURI__?.core?.invoke;
  if (!invoke) return null;
  return {
    kind: "tauri",
    read: async (name) => (await invoke("read_store", { name })) as string | null,
    write: async (name, text) => { await invoke("write_store", { name, text }); },
  };
}

export function browserBackend(storage: Pick<Storage, "getItem" | "setItem"> | null = globalThis.localStorage ?? null): Backend {
  return {
    kind: "browser",
    read: async (name) => storage?.getItem(`feifeifox:${name}`) ?? null,
    write: async (name, text) => {
      try {
        if (!storage) throw new Error("no storage");
        storage.setItem(`feifeifox:${name}`, text);
      } catch {
        throw new Error("浏览器不让保存数据（可能开了无痕模式，或者存储空间满了），这次没有存上。");
      }
    },
  };
}

/** 导入是用户明确要恢复：配装和队伍按键覆盖；导入的页面草稿替换同一页的草稿。
 * 草稿的时间戳推到一分钟以后：导入后页面刷新前，当前页面关闭时还会存一次旧状态（时间是现在），
 * 页面草稿只收更新的那份，这样旧状态就盖不回去。 */
export const IMPORT_AHEAD_MS = 60_000;
function merge(name: StoreName, current: unknown, incoming: unknown, now: number): unknown {
  if (!isRecord(incoming)) throw new Error(`${name} 的内容不是 JSON 对象`);
  if (name !== "ui-state") return { ...(isRecord(current) ? current : {}), ...incoming };
  if (incoming.version !== 1 || !isRecord(incoming.entries)) throw new Error("页面草稿的格式不对");
  const entries = { ...(isRecord(current) && isRecord(current.entries) ? current.entries : {}) };
  for (const [key, entry] of Object.entries(incoming.entries)) {
    if (!isRecord(entry) || entry.version !== 1 || !isRecord(entry.value)) continue;
    entries[key] = { ...entry, updatedAt: now + IMPORT_AHEAD_MS };
  }
  return { version: 1, entries };
}

export function createStore(backend: Backend = tauriBackend() ?? browserBackend(), legacy: Pick<Storage, "getItem"> | null = globalThis.localStorage ?? null, now: () => number = Date.now): Store {
  const cache = new Map<string, unknown>();
  const dirty = new Set<StoreName>();
  const broken = new Set<string>();
  let writing: Promise<void> = Promise.resolve();

  const ready = (async () => {
    for (const name of STORE_NAMES) {
      const text = await backend.read(name).catch(() => null);
      if (!text) continue;
      try {
        cache.set(name, JSON.parse(text.replace(/^﻿/, "")));
      } catch {
        // 文件坏了不能当空的覆盖掉：保持不读，写的时候也不碰它（见 set）。
        cache.set(name, undefined);
        broken.add(name);
      }
    }
    // B站 Toy 版第一次试用时队伍存在另一个键里，接过来。
    if (backend.kind === "browser" && !cache.get("honkai-star-rail/aha-team-presets")) {
      try {
        const old = legacy?.getItem("feifeifox-axis-teams");
        const teams = old ? JSON.parse(old) : null;
        if (isRecord(teams) && Object.keys(teams).length) {
          cache.set("honkai-star-rail/aha-team-presets", teams);
          dirty.add("honkai-star-rail/aha-team-presets");
        }
      } catch {
        /* 旧数据坏了就算了 */
      }
    }
  })();

  const flush = (): Promise<void> => {
    const names = [...dirty];
    dirty.clear();
    writing = writing.then(async () => {
      for (const name of names) await backend.write(name, JSON.stringify(cache.get(name) ?? {}, null, 2));
    });
    return writing;
  };

  return {
    kind: backend.kind,
    ready,
    get: (name) => cache.get(name),
    set(name, value) {
      if (broken.has(name)) throw new Error(`存档 ${name} 读不出来（文件坏了），为了不覆盖它这次没有保存。`);
      cache.set(name, JSON.parse(JSON.stringify(value)));
      dirty.add(name);
    },
    flush,
    exportAll: () => ({ app: BACKUP_APP, version: 1, exportedAt: new Date().toISOString(), stores: Object.fromEntries(STORE_NAMES.filter((name) => cache.get(name) !== undefined).map((name) => [name, cache.get(name)])) }),
    importAll(data) {
      const stores = isRecord(data) && data.app === BACKUP_APP && isRecord(data.stores) ? data.stores : data;
      const names: string[] = [];
      for (const [name, value] of Object.entries(stores)) {
        if (!(STORE_NAMES as readonly string[]).includes(name)) continue;
        const key = name as StoreName;
        broken.delete(key);
        cache.set(key, merge(key, cache.get(key), value, now()));
        dirty.add(key);
        names.push(key);
      }
      if (!names.length) throw new Error("这个文件里没有能导入的存档。");
      return names;
    },
  };
}
