/** 排轴页入口。外壳和单文件版都只认 export default { mount, getState, unmount }。 */
// 正服是空包；测试服构建在这里注册还没进正式服的角色和预设，要排在页面代码之前。
import "@beta-pack";
import { createApp, type App as VueApp } from "vue";
import type { GameData } from "../../axis-engine/src/battle.ts";
import App from "./App.vue";
import type { SavedBuild } from "./build.ts";
import { stateFromLegacy, type LegacyRecord } from "./legacy-team.ts";
import { makeBuildResolver } from "./resolve-build.ts";
import { droppedMembers, droppedNotice, newState, pageCharacters, restoreState, type CatalogItem, type Mode, type PageData, type PageState } from "./model.ts";

import type { FeatureCtx, FeaturePersistence as Persistence } from "../../ui-shared/src/feature.ts";
import { buildStatData } from "../../ui-shared/src/stats/data.ts";
import type { RosterSave, StatData } from "../../ui-shared/src/stats/types.ts";

/** 旧欢愉队页面没存成队伍的草稿：新页面第一次打开时接过来，坏数据就当没有。 */
function legacyDraft(data: PageData): PageState | null {
  try {
    const scope = (window as unknown as { GT_LOCAL_STATE?: { scope(key: string): Persistence } }).GT_LOCAL_STATE?.scope("honkai-star-rail/aha-speed");
    const draft = scope?.load?.()?.data as LegacyRecord | undefined;
    return Array.isArray(draft?.team) && draft.team.length > 0 ? stateFromLegacy({ team: draft.team, config: draft.config ?? {} }, data) : null;
  } catch {
    return null;
  }
}

let app: VueApp | null = null;
let readState: (() => PageState) | null = null;

export default {

  async mount(root: HTMLElement, ctx: FeatureCtx): Promise<void> {
    const [axis, characters, lightcones, relicSets, modes] = await Promise.all(
      ["axis_data", "characters", "lightcones", "relic_sets", "modes"].map((name) => ctx.data(name)),
    );
    const game = { axis, characters } as GameData;
    const data: PageData = {
      game,
      characters: pageCharacters(game),
      lightcones: lightcones as CatalogItem[],
      relicSets: relicSets as CatalogItem[],
      modes: (modes as { modes: Mode[] }).modes,
    };
    // 「读取我的配装」在浏览器里算；配装本身还从 library 读（工具箱里是 userdata，Toy 版是浏览器本地）。
    const resolveBuild = makeBuildResolver({ characters, lightcones, relicSets, modes }, async () => ((await ctx.call("library")) as { presets?: Record<string, SavedBuild> }).presets);
    // 「读取实际装配」：角色与遗器的存档 + 面板计算用的查表（单件遗器表第一次用到时才读）。
    let stats: Promise<StatData> | null = null;
    const resolveRoster = async (characterId: string) => {
      const roster = (await ctx.call("roster_get")) as RosterSave | null;
      const character = roster?.characters?.[characterId];
      if (!character) throw new Error("「角色与遗器」里还没有这个角色：先去那里导入或添加。");
      stats ??= ctx.data("relic_pieces").then((pieces) => buildStatData(characters, lightcones, relicSets, pieces));
      return { character, relics: roster!.relics.filter((relic) => relic.equippedBy === characterId), stats: await stats };
    };
    const call = (action: string, payload?: unknown): Promise<unknown> => {
      const id = (payload as { characterId?: unknown } | undefined)?.characterId;
      if (action === "resolve_build") return resolveBuild(id);
      if (action === "resolve_roster") return resolveRoster(String(id ?? ""));
      return ctx.call(action, payload);
    };
    const saved = ctx.persistence?.load?.()?.data;
    const initial = saved ? restoreState(saved, data) : legacyDraft(data) ?? newState();
    app = createApp(App, {
      data,
      initial,
      initialNotice: droppedNotice(droppedMembers((saved as { team?: unknown } | undefined)?.team, initial.team, data)),
      call,
      onChange: () => ctx.persistence?.capture?.(),
      expose: (getState: () => PageState) => { readState = getState; },
    });
    app.mount(root);
  },

  getState(): PageState | undefined {
    return readState?.();
  },

  unmount(): void {
    app?.unmount();
    app = null;
    readState = null;
  },
};
