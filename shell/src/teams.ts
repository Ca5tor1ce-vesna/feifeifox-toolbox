/** 全角色行动轴的队伍存档和配装库。动作名、返回值和报错跟以前的 Python 后端（axis/api.py）一致。
 * 队伍存在 honkai-star-rail/aha-team-presets（和旧欢愉队页面同一份存档，旧队伍继续读得到，页面按 format 区分）。
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Store } from "./store.ts";

export const TEAMS = "honkai-star-rail/aha-team-presets";

const isRecord = (value: unknown): value is Record<string, any> => !!value && typeof value === "object" && !Array.isArray(value);

/** 和 Python 的 datetime.now().isoformat(timespec="seconds") 一样：本地时间，不带时区。 */
export function localStamp(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function randomId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function teamActions(store: Pick<Store, "get" | "set" | "flush">, presets: () => unknown, newId: () => string = randomId, now: () => Date = () => new Date()) {
  const readTeams = (): Record<string, any> => {
    const value = store.get(TEAMS);
    return isRecord(value) ? { ...value } : {};
  };
  return {
    library: () => ({ presets: isRecord(presets()) ? presets() : {}, teams: readTeams() }),
    save_team: async (payload: any) => {
      const name = String(payload?.name ?? "").trim();
      const { team, state } = payload ?? {};
      if (!name || name.length > 80) throw new Error("队伍名称需要 1 到 80 个字符。");
      if (!Array.isArray(team) || team.length < 1 || team.length > 4 || !team.every(isRecord)) throw new Error("队伍需要 1 到 4 名角色。");
      if (!isRecord(state)) throw new Error("缺少队伍设置。");
      const teams = readTeams();
      let key = String(payload?.id ?? "");
      if (key && !(key in teams)) throw new Error("这个队伍存档已经不在了，请另存。");
      key = key || newId();
      teams[key] = { name, format: "axis", team, state, savedAt: localStamp(now()) };
      store.set(TEAMS, teams);
      await store.flush();
      return { id: key, teams };
    },
    delete_team: async (payload: any) => {
      const teams = readTeams();
      const key = String(payload?.id ?? "");
      if (!(key in teams)) throw new Error("请选择已有的队伍存档。");
      delete teams[key];
      store.set(TEAMS, teams);
      await store.flush();
      return { teams };
    },
  };
}
