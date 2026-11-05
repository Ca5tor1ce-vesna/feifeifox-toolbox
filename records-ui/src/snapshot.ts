/** B站 Toy 版的角色顶分数据：打包时抓一份最新的（tools/records_snapshot.mjs），随包放在
 * features/records/records-snapshot.json，页面只读这份，不连外网（2026-11-04 用户决定：Toy 版不能带 GitHub 地址）。 */
import { validate } from "./data.ts";

export const SNAPSHOT_FILE = "records-snapshot.json";

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface RecordsSnapshot {
  fetched_at: string;
  sha256: string;
  data: any;
}

export type JsonFetcher = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

/** 读随包数据，返回和 loadRecords 一样形状的结果（snapshot: true，界面据此不显示「刷新」）。 */
export async function loadSnapshot(url: string, fetcher: JsonFetcher = (u) => fetch(u, { cache: "no-cache" })): Promise<any> {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`随包的顶分数据读不到（HTTP ${response.status}），重新打一次 Toy 包试试`);
  const snapshot = (await response.json()) as RecordsSnapshot;
  validate(snapshot?.data);
  return { data: snapshot.data, mirror: null, sha256: snapshot.sha256, offline: false, snapshot: true, note: "", fetched_at: snapshot.fetched_at, attempts: [] };
}
