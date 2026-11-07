/** 角色顶分的数据处理：头像和光锥图标对照、结构检查、北京时间。不连网，工具箱版和 B站 Toy 版都用。
 * 联网拉数据在 records.ts（Toy 版的页面不引用它，打出来的 ui.js 里就没有镜像地址）。 */
import { ASSET_ROOT } from "../../ui-shared/src/asset-root.ts";

export const MODES = ["混沌回忆", "虚构叙事", "末日幻影", "异相仲裁"];

/* eslint-disable @typescript-eslint/no-explicit-any */
// 头像：复用崩铁模块随包带的角色图标（characters.json 的 icon）。
// 「开拓者 (欢愉)」「三月七 (巡猎)」这类带命途的名字按 name + pathName 匹配。
// 例外：characters.json 里 1224 三月七（巡猎）的图鉴图标和 1001 是同一张，单独用一张游戏内的 1224 头像。
const AVATAR_OVERRIDES: Record<string, string> = { "三月七 (巡猎)": `${ASSET_ROOT}1224.webp` };
const VARIANT = /^(.+?)\s*[(（]([^()（）]+)[)）]$/;

const sortedUnique = (names: Iterable<string>): string[] => [...new Set(names)].sort();

/** {数据里的角色名: 图标路径}，以及没对上的名字（界面退回首字圆圈）。 */
export function avatarMap(characters: any[], names: Iterable<string>): [Record<string, string>, string[]] {
  const byName = new Map<string, any[]>();
  for (const c of characters || []) {
    if (!byName.has(c.name)) byName.set(c.name, []);
    byName.get(c.name)!.push(c);
  }
  const out: Record<string, string> = {};
  const missing: string[] = [];
  for (const name of sortedUnique(names)) {
    let icon: string | undefined = AVATAR_OVERRIDES[name];
    if (!icon) {
      let hits = byName.get(name) || [];
      const match = VARIANT.exec(name);
      if (match) hits = (byName.get(match[1].trim()) || []).filter((c) => c.pathName === match[2].trim());
      if (hits.length === 1) icon = hits[0].icon;
    }
    if (icon) out[name] = icon;
    else missing.push(name);
  }
  return [out, missing];
}

const LC_TABLE: Record<string, string> = { "！": "!", "，": ",", "？": "?", "：": ":", "·": "•", "・": "•" };
/** 光锥名宽松匹配：去空白、全角标点转半角、统一间隔号。 */
export const normLc = (name: unknown): string =>
  String(name || "").replace(/\s+/g, "").replace(/[！，？：·・]/g, (char) => LC_TABLE[char]).toLowerCase();

export function lightconeMap(lightcones: any[], names: Iterable<string | undefined>): [Record<string, string>, string[]] {
  const by = new Map<string, any[]>();
  for (const lc of lightcones || []) {
    const key = normLc(lc.name);
    if (!by.has(key)) by.set(key, []);
    by.get(key)!.push(lc);
  }
  const out: Record<string, string> = {};
  const missing: string[] = [];
  for (const name of sortedUnique([...names].filter((n): n is string => !!n))) {
    const hits = by.get(normLc(name)) || [];
    if (hits.length === 1 && hits[0].icon) out[name] = hits[0].icon;
    else missing.push(name);
  }
  return [out, missing];
}

const lineups = (data: any): any[] => (data?.targets || []).flatMap((t: any) => (t.records || []).flatMap((r: any) => r.lineup || []));

const targetKey = (target: any): string => [target.mode, target.season, target.stage, target.category].join("|");

/** 把随包的往期成绩接在最新数据后面。两边都有的关卡用最新的。 */
export function withArchive(result: any, archive: any): any {
  const targets: any[] = result?.data?.targets || [];
  const known = new Set(targets.map(targetKey));
  const older = (archive?.targets || []).filter((target: any) => !known.has(targetKey(target)));
  return older.length ? { ...result, data: { ...result.data, targets: [...targets, ...older] } } : result;
}

export function withAvatars(result: any, characters: any[], lightcones: any[]): any {
  const data = result.data || {};
  const [avatars, unmapped] = avatarMap(characters, lineups(data).map((c) => c.name));
  const [lightconeIcons, unmappedLightcones] = lightconeMap(lightcones, lineups(data).map((c) => c.lightcone));
  return { ...result, avatars, unmapped, lightcone_icons: lightconeIcons, unmapped_lightcones: unmappedLightcones };
}

export function validate(data: any): void {
  if (!data || typeof data !== "object" || Array.isArray(data) || !Array.isArray(data.targets) || !data.targets.length) throw new Error("数据结构不对：缺少 targets");
  for (const t of data.targets) {
    if (!t || typeof t !== "object" || !MODES.includes(t.mode) || !Array.isArray(t.records)) throw new Error("数据结构不对：target 异常");
    for (const r of t.records) {
      if (!r || typeof r !== "object" || !Array.isArray(r.lineup)) throw new Error("数据结构不对：record 异常");
    }
  }
}

/** 北京时间 YYYY-MM-DD HH:MM。 */
export function beijingNow(now = new Date()): string {
  const t = new Date(now.getTime() + 8 * 3600 * 1000);
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
}
