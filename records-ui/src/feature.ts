/** 角色顶分页的外壳接口（export default { mount, getState, unmount }），工具箱和 B站 Toy 版共用。
 * 两版只差数据从哪来：工具箱联网从镜像拉（main.ts），Toy 版读打包时随包放好的数据（main-toy.ts）。 */
import { createApp, type App as VueApp } from "vue";
import App, { type RecordsState } from "./App.vue";
import { withAvatars } from "./data.ts";

import type { FeatureCtx } from "../../ui-shared/src/feature.ts";

export type { FeatureCtx };

/* eslint-disable @typescript-eslint/no-explicit-any */
/** refresh：用户点了「刷新」。返回 loadRecords / loadSnapshot 的结果。 */
export type RecordsSource = (refresh: boolean) => Promise<any>;

export function recordsFeature(source: RecordsSource) {
  let app: VueApp | null = null;
  let readState: (() => RecordsState) | null = null;
  return {
    title: "角色顶分",

    async mount(root: HTMLElement, ctx: FeatureCtx): Promise<void> {
      // 头像对照用崩铁的角色和光锥数据，读到的时候才对。
      const catalog = Promise.all([ctx.data("characters"), ctx.data("lightcones")]).catch(() => [[], []]);
      const load = async (refresh: boolean) => {
        const [result, [characters, lightcones]] = await Promise.all([source(refresh), catalog]);
        return withAvatars(result, characters as unknown[] as never[], lightcones as unknown[] as never[]);
      };
      const initial = (ctx.persistence?.load?.()?.data as Partial<RecordsState> | undefined) ?? null;
      app = createApp(App, { load, initial, expose: (getState: () => RecordsState) => { readState = getState; } });
      app.mount(root);
    },

    getState(): RecordsState | undefined {
      return readState?.();
    },

    unmount(): void {
      app?.unmount();
      app = null;
      readState = null;
    },
  };
}
