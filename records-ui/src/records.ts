/** 角色顶分：从多个镜像拉 herta-data 的 latest.json，校验 SHA-256，缓存到浏览器本地。
 *
 * 从 modules/honkai-star-rail/features/records/api.py 移植（2026-11-04 用户决定计算从 Python 搬到 TypeScript）。
 * 镜像按顺序试（短超时），第一个「json 和 sha256 都取到且校验一致」的胜出；全部失败就用上次的缓存，并标 offline。
 * GitHub Raw 和 jsDelivr 都允许浏览器跨域读取，不需要后端转发。
 */
import { beijingNow, validate } from "./data.ts";

// 数据处理放在 data.ts；这里转出去，工具和测试照旧从 records.ts 取。
export { avatarMap, beijingNow, lightconeMap, MODES, normLc, validate, withAvatars } from "./data.ts";

const REPO = "Ca5tor1ce-vesna/herta-data";
const RAW = `https://raw.githubusercontent.com/${REPO}/main/data/`;
export const MIRRORS: { name: string; base: string }[] = [
  { name: "GitHub Raw", base: RAW },
  { name: "jsDelivr", base: `https://cdn.jsdelivr.net/gh/${REPO}@main/data/` },
  { name: "jsDelivr Fastly", base: `https://fastly.jsdelivr.net/gh/${REPO}@main/data/` },
  { name: "jsDelivr Gcore", base: `https://gcore.jsdelivr.net/gh/${REPO}@main/data/` },
  { name: "ghfast.top", base: `https://ghfast.top/${RAW}` },
  { name: "gh-proxy.com", base: `https://gh-proxy.com/${RAW}` },
];
export const TIMEOUT = 4000;
const CACHE_FRESH_MS = 3600 * 1000;

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Fetcher = (url: string, timeoutMs: number) => Promise<Uint8Array<ArrayBuffer>>;
export interface CacheStore {
  get(): any;
  set(value: any): void;
}

const hex = (buffer: ArrayBuffer): string => [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

export const browserFetch: Fetcher = async (url, timeoutMs) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
    return new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    if ((error as Error).name === "AbortError") throw new Error("timed out");
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

export async function fetchMirror(base: string, fetcher: Fetcher, timeoutMs = TIMEOUT): Promise<[any, string]> {
  const shaText = new TextDecoder().decode(await fetcher(`${base}latest.sha256`, timeoutMs)).trim();
  const expected = shaText ? shaText.split(/\s+/)[0].toLowerCase() : "";
  if (expected.length !== 64) throw new Error("sha256 文件格式不对");
  const body = await fetcher(`${base}latest.json`, timeoutMs);
  const actual = hex(await crypto.subtle.digest("SHA-256", body));
  if (actual !== expected) throw new Error("校验不一致（镜像缓存未同步？）");
  const data = JSON.parse(new TextDecoder().decode(body).replace(/^﻿/, ""));
  validate(data);
  return [data, actual];
}

export async function tryMirrors(fetcher: Fetcher, mirrors = MIRRORS, timeoutMs = TIMEOUT) {
  const attempts: { name: string; ok: boolean; ms: number; error: string }[] = [];
  for (const mirror of mirrors) {
    const start = performance.now();
    try {
      const [data, sha] = await fetchMirror(mirror.base, fetcher, timeoutMs);
      attempts.push({ name: mirror.name, ok: true, ms: Math.round(performance.now() - start), error: "" });
      return { mirror, data, sha, attempts };
    } catch (error) {
      // 任何错误都只是「这个镜像不行」
      attempts.push({ name: mirror.name, ok: false, ms: Math.round(performance.now() - start), error: String((error as Error)?.message || error).slice(0, 120) || "Error" });
    }
  }
  return { mirror: null, data: null, sha: null, attempts };
}


export async function loadRecords(options: { refresh?: boolean; cache: CacheStore; fetcher?: Fetcher; now?: () => number }): Promise<any> {
  const now = options.now ?? Date.now;
  let cache: any = null;
  try {
    cache = options.cache.get() || null;
  } catch {
    cache = null;
  }
  if (cache && !options.refresh && now() - Number(cache.ts || 0) < CACHE_FRESH_MS) return { ...cache.result, from_cache: true };
  const { mirror, data, sha, attempts } = await tryMirrors(options.fetcher ?? browserFetch);
  if (mirror) {
    const result = { data, mirror: mirror.name, sha256: sha, offline: false, note: "", fetched_at: beijingNow(new Date(now())), attempts };
    try {
      options.cache.set({ ts: now(), result });
    } catch {
      /* 存不下缓存不影响这次显示 */
    }
    return result;
  }
  if (cache) {
    return { ...cache.result, offline: true, attempts, from_cache: true, note: `所有镜像都连不上，显示的是 ${cache.result?.fetched_at} 缓存的数据（离线）。` };
  }
  throw new Error("所有镜像都连不上，且没有本地缓存。请检查网络后点刷新。");
}

/** 浏览器本地缓存（localStorage）。这只是缓存，丢了下次重新下载。 */
export function localCache(key = "feifeifox-records-cache"): CacheStore {
  return {
    get: () => {
      const raw = globalThis.localStorage?.getItem(key);
      return raw ? JSON.parse(raw) : null;
    },
    set: (value) => globalThis.localStorage?.setItem(key, JSON.stringify(value)),
  };
}
