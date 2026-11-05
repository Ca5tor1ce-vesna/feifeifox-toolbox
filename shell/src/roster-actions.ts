/** 「角色与遗器」的存档和后端动作（1.2）。存在 honkai-star-rail/roster（exe 里是 userdata/honkai-star-rail/roster.json）。 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { fromEnka } from "../../ui-shared/src/import/enka.ts";
import { diffLibrary, mergeCharacters } from "../../ui-shared/src/import/merge.ts";
import { relicStats } from "../../ui-shared/src/stats/relic.ts";
import { toSpeedConfig, type SpeedConfig } from "../../ui-shared/src/stats/to-speed-config.ts";
import { emptyRoster, type RelicPiece, type RosterCharacter, type RosterSave, type StatData } from "../../ui-shared/src/stats/types.ts";
import type { Store } from "./store.ts";

export const ROSTER = "honkai-star-rail/roster";
const SOURCES = new Set(["scanner-v4", "freesr", "enka", "record-card", "manual"]);
/** exe 外壳的命令（Tauri 的 invoke）。网页版没有。 */
export type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
const tauriInvoke = (): Invoke | undefined => (globalThis as any).__TAURI__?.core?.invoke;

const isRecord = (value: unknown): value is Record<string, any> => !!value && typeof value === "object" && !Array.isArray(value);

function randomId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const stamp = (date: Date): string => {
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const isInt = (value: unknown, min: number, max: number): boolean => Number.isInteger(value) && (value as number) >= min && (value as number) <= max;

function checkCharacter(character: any, data: StatData): RosterCharacter {
  if (!isRecord(character)) throw new Error("缺少角色信息。");
  const info = data.characters.get(String(character.id));
  if (!info) throw new Error(`角色 ${character.id} 不在数据里，可能是新角色，请更新工具箱。`);
  if (!isInt(character.promotion, 0, 6)) throw new Error(`${info.name} 的突破阶段要在 0 到 6 之间。`);
  const low = character.promotion === 0 ? 1 : 10 + 10 * character.promotion;
  const high = 20 + 10 * character.promotion;
  if (!isInt(character.level, low, high)) throw new Error(`${info.name} 的等级要在 ${low} 到 ${high} 之间（突破 ${character.promotion}）。`);
  if (!isInt(character.eidolon, 0, 6)) throw new Error(`${info.name} 的星魂要在 0 到 6 之间。`);
  const cone = character.lightcone;
  if (cone !== null) {
    if (!isRecord(cone) || !data.lightcones.has(String(cone.id))) throw new Error(`光锥 ${cone?.id} 不在数据里。`);
    if (!isInt(cone.superimpose, 1, 5)) throw new Error("光锥叠影要在 1 到 5 之间。");
    if (!isInt(cone.promotion, 0, 6) || !isInt(cone.level, 1, 20 + 10 * cone.promotion)) throw new Error("光锥的等级和突破对不上。");
  }
  const traces = Array.isArray(character.traces) ? character.traces.map(String) : [];
  const unknown = traces.filter((node: string) => !(node in info.statTraces));
  if (unknown.length) throw new Error(`${info.name} 没有这些属性行迹：${unknown.join("、")}。`);
  return {
    id: info.id, level: character.level, promotion: character.promotion, eidolon: character.eidolon,
    lightcone: cone === null ? null : { id: String(cone.id), level: cone.level, promotion: cone.promotion, superimpose: cone.superimpose },
    traces, defaults: Array.isArray(character.defaults) ? character.defaults.map(String) : [],
  };
}

function checkRelic(relic: any, data: StatData): RelicPiece {
  if (!isRecord(relic)) throw new Error("缺少遗器信息。");
  const piece = data.pieces.get(String(relic.pieceId));
  if (!piece) throw new Error(`遗器编号 ${relic.pieceId} 不在数据里，可能是新遗器，请更新工具箱。`);
  const maxLevel = piece.rarity * 3;
  if (!isInt(relic.level, 0, maxLevel)) throw new Error(`这件遗器的等级要在 0 到 ${maxLevel} 之间。`);
  const subs = Array.isArray(relic.subAffixes) ? relic.subAffixes : [];
  if (subs.length > 4) throw new Error("副词条最多 4 条。");
  for (const sub of subs) {
    if (!isInt(sub?.count, 1, 6) || !isInt(sub?.step, 0, sub.count * 2)) throw new Error("副词条的次数要在 1 到 6 之间，档位不能超过次数的 2 倍。");
  }
  const checked: RelicPiece = {
    id: String(relic.id ?? ""), pieceId: String(relic.pieceId), level: relic.level, mainAffix: String(relic.mainAffix),
    subAffixes: subs.map((sub: any) => ({ affix: String(sub.affix), count: sub.count, step: sub.step })),
    equippedBy: relic.equippedBy === null || relic.equippedBy === undefined ? null : String(relic.equippedBy),
  };
  relicStats(checked, data); // 主副词条编号查不到时这里会报出具体是哪个
  return checked;
}

/** 配速查询的计算（speed-ui/src/calc.ts 的 createApi）里这里用到的部分。 */
export interface SpeedCalc { call: (action: string, payload: any) => any }

/**
 * 「用实际装配填入」：实际装配 → 配速查询的配置，再用配速查询自己的算法算一次，和面板速度的差额记成「其它固定速度」，
 * 这样配速查询的初始速度就等于面板速度（两边算法细节不同：行迹按全点、速度鞋按 25 整、条件效果的默认勾选等）。
 */
export function speedConfigFromRoster(character: RosterCharacter, relics: RelicPiece[], data: StatData, calc: SpeedCalc): { config: SpeedConfig; panelSpeed: number; notes: string[] } {
  const filled = toSpeedConfig(character, relics, data);
  const result = calc.call("plan", { ...filled.config, characterId: character.id });
  const gap = filled.panelSpeed - Number(result?.speed?.final ?? filled.panelSpeed);
  filled.config.relic.customFlat = Math.round(gap * 1e6) / 1e6;
  if (Math.abs(gap) >= 0.05) filled.notes.push(`配速查询和面板的算法有 ${gap.toFixed(1)} 点速度的差别（比如行迹没点满），已记在「其它固定速度」里。`);
  return filled;
}

export function rosterActions(
  store: Pick<Store, "get" | "set" | "flush" | "kind">,
  loadData: () => Promise<StatData>,
  newId: () => string = randomId,
  now: () => Date = () => new Date(),
  invoke: Invoke | undefined = tauriInvoke(),
) {
  const read = (): RosterSave => {
    const value = store.get(ROSTER);
    return isRecord(value) && value.version === 1 ? (structuredClone(value) as RosterSave) : emptyRoster();
  };
  const write = async (save: RosterSave): Promise<RosterSave> => {
    store.set(ROSTER, save);
    await store.flush();
    return read();
  };
  const incoming = async (payload: any) => {
    const data = await loadData();
    const characters = (Array.isArray(payload?.characters) ? payload.characters : []).map((c: any) => checkCharacter(c, data));
    const relics = (Array.isArray(payload?.relics) ? payload.relics : []).map((r: any) => checkRelic(r, data));
    const source = SOURCES.has(payload?.source) ? payload.source : "manual";
    return { data, characters, relics, source } as { data: StatData; characters: RosterCharacter[]; relics: RelicPiece[]; source: RosterSave["source"] };
  };
  /** 穿到 characterId 身上：对方同部位原来那件脱下来。 */
  const equipInto = (relics: RelicPiece[], relic: RelicPiece, characterId: string | null, data: StatData): void => {
    relic.equippedBy = characterId;
    if (!characterId) return;
    const slot = data.pieces.get(relic.pieceId)?.slot;
    for (const other of relics) {
      if (other !== relic && other.equippedBy === characterId && data.pieces.get(other.pieceId)?.slot === slot) other.equippedBy = null;
    }
  };

  return {
    get: async () => read(),
    preview_replace: async (payload: any) => {
      const { characters, relics, source } = await incoming(payload);
      return diffLibrary(read(), { ...emptyRoster(), source, characters: Object.fromEntries(characters.map((c) => [c.id, c])), relics });
    },
    replace: async (payload: any) => {
      const { characters, relics, source } = await incoming(payload);
      const current = read();
      return write({
        version: 1, uid: typeof payload?.uid === "string" ? payload.uid : current.uid, importedAt: stamp(now()), source,
        characters: Object.fromEntries(characters.map((c) => [c.id, c])), relics: relics.map((r) => ({ ...r, id: newId() })),
      });
    },
    merge: async (payload: any) => {
      const { characters, relics, source } = await incoming(payload);
      const merged = mergeCharacters(read(), { characters, relics }, payload?.loose === true, newId);
      return write({ ...merged, source, importedAt: stamp(now()), uid: typeof payload?.uid === "string" ? payload.uid : merged.uid });
    },
    save_character: async (payload: any) => {
      const data = await loadData();
      const character = checkCharacter(payload?.character, data);
      const save = read();
      save.characters[character.id] = character;
      return write(save);
    },
    save_relic: async (payload: any) => {
      const data = await loadData();
      const relic = checkRelic(payload?.relic, data);
      const save = read();
      if (relic.equippedBy && !save.characters[relic.equippedBy]) throw new Error("要穿的角色还不在「角色与遗器」里，先添加这个角色。");
      const index = save.relics.findIndex((r) => r.id === relic.id);
      if (index >= 0) save.relics[index] = relic;
      else save.relics.push({ ...relic, id: newId() });
      const saved = index >= 0 ? save.relics[index] : save.relics[save.relics.length - 1];
      equipInto(save.relics, saved, saved.equippedBy, data);
      return write(save);
    },
    delete_relic: async (payload: any) => {
      const save = read();
      const index = save.relics.findIndex((r) => r.id === String(payload?.id ?? ""));
      if (index < 0) throw new Error("这件遗器已经不在了。");
      save.relics.splice(index, 1);
      return write(save);
    },
    equip: async (payload: any) => {
      const data = await loadData();
      const save = read();
      const relic = save.relics.find((r) => r.id === String(payload?.relicId ?? ""));
      if (!relic) throw new Error("这件遗器已经不在了。");
      const target = payload?.characterId === null || payload?.characterId === undefined ? null : String(payload.characterId);
      if (target && !save.characters[target]) throw new Error("要穿的角色还不在「角色与遗器」里，先添加这个角色。");
      equipInto(save.relics, relic, target, data);
      return write(save);
    },
    /** UID 查询：只在 exe 里有（Rust 外壳向 Enka 请求）；网页版（含 B站 Toy）请求会被跨域拦下。
     * 只更新展柜里的角色（局部合并），返回存档和跳过的条目。 */
    showcase: async (payload: any): Promise<{ roster: RosterSave; skipped: string[] }> => {
      if (store.kind !== "tauri" || !invoke) throw new Error("网页版不支持 UID 查询，请用 exe 或导入文件。");
      const uid = String(payload?.uid ?? "").trim();
      if (!/^\d{9,10}$/.test(uid)) throw new Error(`UID 是 9 到 10 位数字，收到的是「${uid}」。`);
      let text: unknown;
      try {
        text = await invoke("fetch_showcase", { uid });
      } catch (error: any) {
        throw new Error(typeof error === "string" ? error : error?.message ?? String(error));
      }
      const data = await loadData();
      const imported = fromEnka(JSON.parse(String(text)), data);
      const merged = mergeCharacters(read(), imported, false, newId);
      const roster = await write({ ...merged, uid, source: "enka", importedAt: stamp(now()) });
      return { roster, skipped: imported.skipped };
    },
  };
}
