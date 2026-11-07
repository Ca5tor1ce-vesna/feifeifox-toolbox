/** 角色顶分的筛选、排序和标签。不碰页面，能直接测。 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type SortKey = "default" | "gold" | "result" | "date";
export type EidolonFilter = "any" | "zero" | "low";

export interface RecordsFilter {
  season: string;
  stage: string;
  category: string;
  group: string;
  ltdMax: number | null;
  stdMax: number | null;
  eidolon: EidolonFilter;
  sort: SortKey;
  query: string;
}

export interface RecordRow {
  target: any;
  record: any;
}

/** season、stage、category、group 写这个表示不限。 */
export const ALL = "";
/** 「低星魂」的上限。 */
const LOW_EIDOLON = 2;

export const SORTS: { id: SortKey; label: string }[] = [
  { id: "default", label: "默认" },
  { id: "gold", label: "限定最少" },
  { id: "result", label: "成绩最好" },
  { id: "date", label: "最新" },
];
export const EIDOLONS: { id: EidolonFilter; label: string }[] = [
  { id: "any", label: "不限" },
  { id: "zero", label: "全员 0 魂" },
  { id: "low", label: `全员 ${LOW_EIDOLON} 魂以内` },
];

export const newFilter = (): RecordsFilter => ({ season: ALL, stage: ALL, category: ALL, group: ALL, ltdMax: null, stdMax: null, eidolon: "any", sort: "default", query: "" });

/** 从存档恢复：只认对得上的字段。 */
export function restoreFilter(raw: Partial<RecordsFilter> | null | undefined): RecordsFilter {
  const filter = newFilter();
  for (const key of ["season", "stage", "category", "group", "query"] as const) {
    const value = raw?.[key];
    if (typeof value === "string") filter[key] = value;
  }
  for (const key of ["ltdMax", "stdMax"] as const) {
    const value = raw?.[key];
    if (typeof value === "number") filter[key] = value;
  }
  if (EIDOLONS.some((item) => item.id === raw?.eidolon)) filter.eidolon = raw!.eidolon!;
  if (SORTS.some((item) => item.id === raw?.sort)) filter.sort = raw!.sort!;
  return filter;
}

const seasonParts = (season: unknown): number[] => String(season).split(".").map(Number);
/** 新版本在前：4.10 比 4.9 新。 */
export function compareSeason(a: unknown, b: unknown): number {
  const [left, right] = [seasonParts(a), seasonParts(b)];
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (right[index] ?? 0) - (left[index] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

const unique = <T>(values: T[]): T[] => [...new Set(values)];
const inMode = (targets: any[], mode: string | null): any[] => targets.filter((target) => target.mode === mode);
const inSeason = (targets: any[], mode: string | null, season: string): any[] => inMode(targets, mode).filter((target) => season === ALL || String(target.season) === season);

export const seasonsOf = (targets: any[], mode: string | null): string[] => unique(inMode(targets, mode).map((target) => String(target.season))).sort(compareSeason);
export const stagesOf = (targets: any[], mode: string | null, season: string): string[] => unique(inSeason(targets, mode, season).map((target) => String(target.stage)));
export const categoriesOf = (targets: any[], mode: string | null, season: string, stage: string): string[] =>
  unique(inSeason(targets, mode, season).filter((target) => stage === ALL || target.stage === stage).map((target) => String(target.category)));

/** 异相仲裁分骑士和王棋：骑士关卡名前面带 [K1]，绝境王棋带「绝境」。 */
export function stageKind(target: { mode?: string; stage?: string }): string {
  if (target.mode !== "异相仲裁") return "";
  const stage = String(target.stage ?? "");
  if (/^\[K\d+\]/.test(stage)) return "骑士";
  return stage.includes("绝境") ? "绝境王棋" : "普通王棋";
}

export const stageLabel = (mode: string | null, stage: string): string => {
  const kind = stageKind({ mode: mode ?? "", stage });
  return kind ? `${kind} · ${stage}` : stage;
};

/** 空格和逗号分开的词：一条记录里每个词都要对上一名角色或一件光锥。 */
export const termsOf = (query: string): string[] => query.trim().toLowerCase().split(/[\s,，、]+/).filter(Boolean);
const includes = (value: unknown, term: string): boolean => String(value ?? "").toLowerCase().includes(term);
export const charMatches = (char: any, terms: readonly string[]): boolean => terms.some((term) => includes(char.name, term) || includes(char.lightcone, term));

function matches(record: any, filter: RecordsFilter, terms: readonly string[]): boolean {
  const lineup: any[] = record.lineup || [];
  if (filter.group !== ALL && record.group !== filter.group) return false;
  if (filter.ltdMax !== null && Number(record.ltd) > filter.ltdMax) return false;
  if (filter.stdMax !== null && Number(record.std) > filter.stdMax) return false;
  if (filter.eidolon === "zero" && lineup.some((char) => char.eidolon > 0)) return false;
  if (filter.eidolon === "low" && lineup.some((char) => char.eidolon > LOW_EIDOLON)) return false;
  return terms.every((term) => lineup.some((char) => charMatches(char, [term])));
}

/** 成绩好坏：轮次少、积分高、行动值低在前，没有的排后面。 */
const resultKey = (record: any): number[] => [
  record.cycle == null || record.cycle === "" ? Infinity : Number(record.cycle),
  -Number(record.score ?? 0),
  record.av == null || record.av === "" ? Infinity : Number(record.av),
];
const compareKeys = (left: number[], right: number[]): number => {
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  return 0;
};

const SORTERS: Record<Exclude<SortKey, "default">, (a: RecordRow, b: RecordRow) => number> = {
  gold: (a, b) => compareKeys([Number(a.record.ltd), Number(a.record.std)], [Number(b.record.ltd), Number(b.record.std)]),
  result: (a, b) => compareKeys(resultKey(a.record), resultKey(b.record)),
  date: (a, b) => String(b.record.date ?? "").localeCompare(String(a.record.date ?? "")),
};

export function rowsOf(targets: any[], mode: string | null, filter: RecordsFilter): RecordRow[] {
  const terms = termsOf(filter.query);
  const scope = inSeason(targets, mode, filter.season)
    .filter((target) => (filter.stage === ALL || target.stage === filter.stage) && (filter.category === ALL || target.category === filter.category));
  const rows = scope.flatMap((target) => (target.records || []).filter((record: any) => matches(record, filter, terms)).map((record: any) => ({ target, record })));
  return filter.sort === "default" ? rows : [...rows].sort(SORTERS[filter.sort]);
}

/** 这个范围里一共多少条原始记录。 */
export function totalRuns(targets: any[], mode: string | null, filter: RecordsFilter): number {
  return inSeason(targets, mode, filter.season)
    .filter((target) => (filter.stage === ALL || target.stage === filter.stage) && (filter.category === ALL || target.category === filter.category))
    .reduce((sum, target) => sum + Number(target.total_runs ?? 0), 0);
}

/** 阵容组选项：不算阵容组这一项筛选时，每组有几条，多的在前。 */
export function groupsOf(targets: any[], mode: string | null, filter: RecordsFilter): { group: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const { record } of rowsOf(targets, mode, { ...filter, group: ALL, sort: "default" })) counts.set(record.group, (counts.get(record.group) ?? 0) + 1);
  return [...counts].map(([group, count]) => ({ group, count })).sort((a, b) => b.count - a.count || a.group.localeCompare(b.group, "zh"));
}

/** 换版本、换数据后把对不上的选项收回来。 */
export function settle(filter: RecordsFilter, targets: any[], mode: string | null): RecordsFilter {
  const next = { ...filter };
  const seasons = seasonsOf(targets, mode);
  if (next.season !== ALL && !seasons.includes(next.season)) next.season = seasons[0] ?? ALL;
  const stages = stagesOf(targets, mode, next.season);
  if (next.stage !== ALL && !stages.includes(next.stage)) next.stage = stages[0] ?? ALL;
  if (next.category !== ALL && !categoriesOf(targets, mode, next.season, next.stage).includes(next.category)) next.category = ALL;
  if (next.group !== ALL && !groupsOf(targets, mode, next).some((item) => item.group === next.group)) next.group = ALL;
  return next;
}

/** 打开一个模式时的默认范围：最新版本的第一关。 */
export function openMode(filter: RecordsFilter, targets: any[], mode: string | null): RecordsFilter {
  const season = seasonsOf(targets, mode)[0] ?? ALL;
  return { ...filter, season, stage: stagesOf(targets, mode, season)[0] ?? ALL, category: ALL, group: ALL };
}

/** 卡片上的标签。stage 为 true 时带上关卡名（看全部关卡时才分得清）。 */
export function tagsOf({ target, record }: RecordRow, stage: boolean): string[] {
  const lineup: any[] = record.lineup || [];
  return [
    String(target.season),
    stageKind(target),
    String(target.category ?? ""),
    stage ? String(target.stage ?? "") : "",
    Number(record.std) === 0 ? "零常驻" : "",
    lineup.length && lineup.every((char) => !char.eidolon) ? "全员 0 魂" : "",
    lineup.length && lineup.length < 4 ? `${lineup.length} 人队` : "",
    target.archived_at ? `存档于 ${target.archived_at}` : "",
  ].filter(Boolean);
}
