/** 配速查询页入口。外壳只认 export default { mount, getState, unmount }。
 *
 * 计算（目录、光锥列表、配速、推荐）在浏览器里用 calc.ts 算；「我的配装」的读写还走外壳的 ctx.call，
 * 存在 userdata 里，全角色行动轴读的是同一份。
 */
import { createApp, type App as VueApp } from "vue";
import App from "./App.vue";
import type { SpeedDraft } from "./page.ts";
import { createApi } from "./calc.ts";

import type { FeatureCtx, FeaturePersistence as Persistence } from "../../ui-shared/src/feature.ts";

export type { FeatureCtx };

const LOCAL_ACTIONS = new Set(["catalog", "lightcones", "cone_art", "enhanceable", "plan", "recommend"]);
export const DATA_NAMES = ["characters", "lightcones", "relic_sets", "modes", "data_info"] as const;

/** 本地算的动作和发给外壳的动作走同一个口子。参数先过一遍 JSON，和以前发给后端时完全一样（比如 NaN 变成 null）。 */
export function makeCall(calc: ReturnType<typeof createApi>, remote: FeatureCtx["call"]) {
  return async (action: string, payload: unknown = {}): Promise<any> => {
    const clean = JSON.parse(JSON.stringify(payload ?? {}));
    return LOCAL_ACTIONS.has(action) ? calc.call(action, clean) : remote(action, clean);
  };
}

export async function loadCalc(data: FeatureCtx["data"]) {
  const [characters, lightcones, relicSets, modes, dataInfo] = await Promise.all(DATA_NAMES.map((name) => data(name)));
  return createApi({ characters, lightcones, relic_sets: relicSets, modes, dataInfo: dataInfo ?? {} });
}

let app: VueApp | null = null;
let readState: (() => unknown) | null = null;

export function mountSpeedPage(root: HTMLElement, options: { catalog: unknown; call: (action: string, payload?: unknown) => Promise<any>; persistence?: Persistence | null; teamLink?: string | null }): void {
  const draft = options.persistence?.load?.()?.data as SpeedDraft | undefined;
  app = createApp(App, {
    catalog: options.catalog,
    call: options.call,
    draft: draft ?? null,
    persistence: options.persistence ?? null,
    root,
    teamLink: options.teamLink ?? null,
    expose: (getState: () => unknown) => { readState = getState; },
  });
  app.provide("popupRoot", root);
  app.mount(root);
}

export function showLoadError(root: HTMLElement, error: unknown): void {
  root.innerHTML = `<div class="card error"><h2>读不到数据</h2><p class="error-text"></p><p class="muted small">数据文件缺失或损坏：请重新下载完整的工具箱。</p></div>`;
  root.querySelector(".error-text")!.textContent = (error as Error)?.message ?? String(error);
}

export default {
  title: "配速查询",

  async mount(root: HTMLElement, ctx: FeatureCtx): Promise<void> {
    let call;
    let catalog;
    try {
      call = makeCall(await loadCalc(ctx.data), ctx.call);
      catalog = await call("catalog");
    } catch (error) {
      showLoadError(root, error);
      return;
    }
    mountSpeedPage(root, { catalog, call, persistence: ctx.persistence, teamLink: "#/honkai-star-rail/axis" });
  },

  getState(): unknown {
    return readState?.();
  },

  unmount(): void {
    app?.unmount();
    app = null;
    readState = null;
  },
};
