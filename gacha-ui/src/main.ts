/** 抽卡规划页入口。外壳只认 export default { mount, unmount }；没有 getState，输入框由外壳按 id 保存和恢复。 */
import { createApp, nextTick, type App as VueApp } from "vue";
import App from "./App.vue";
import { createGachaApi, type GachaData } from "./calc.ts";

import type { FeatureCtx } from "../../ui-shared/src/feature.ts";

export type { FeatureCtx };

let app: VueApp | null = null;

/** 工具箱和 B站 Toy 版共用：传入卡池数据，挂上页面，恢复上次的输入后算一次。 */
export async function mountGachaPage(root: HTMLElement, data: GachaData, restoreForms?: (root: HTMLElement, emit?: boolean) => void): Promise<void> {
  const api = createGachaApi(data ?? {});
  let run = (): void => {};
  app = createApp(App, {
    call: (action: string, payload?: unknown) => api.call(action, JSON.parse(JSON.stringify(payload ?? {}))),
    expose: (exposed: { run: () => void }) => { run = exposed.run; },
  });
  app.mount(root);
  // 先把上次的输入填回去（会发 input/change，页面状态跟着变），再按这些输入算第一次。
  restoreForms?.(root, true);
  await nextTick();
  run();
}

export default {
  title: "抽卡规划",

  async mount(root: HTMLElement, ctx: FeatureCtx): Promise<void> {
    let data: GachaData = {};
    try {
      data = (await ctx.data("gacha_pools")) as GachaData;
    } catch {
      /* 读不到就交给页面显示「读不到卡池数据」 */
    }
    await mountGachaPage(root, data, ctx.persistence?.restoreForms);
  },

  unmount(): void {
    app?.unmount();
    app = null;
  },
};
