/** 「角色与遗器」页入口（1.2）。外壳只认 export default { mount, unmount }。
 *
 * 面板计算、各种导入的格式转换都在 ui-shared/src/ 里（纯函数）；存档的读写走外壳的 ctx.call（shell/src/roster-actions.ts）。
 * 识图用的引擎和字库在同目录的 ocr/ 里，点「识图导入」时才加载。
 */
import { createApp, type App as VueApp } from "vue";
import App from "./App.vue";
import type { Catalog } from "./use-roster.ts";

import type { FeatureCtx } from "../../ui-shared/src/feature.ts";
import { buildStatData } from "../../ui-shared/src/stats/data.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
let app: VueApp | null = null;

const byId = <T>(rows: any, pick: (row: any) => T): Map<string, T> => new Map((Array.isArray(rows) ? rows : []).map((row: any) => [String(row.id), pick(row)]));

export default {
  title: "角色与遗器",

  async mount(root: HTMLElement, ctx: FeatureCtx): Promise<void> {
    let characters: any;
    let lightcones: any;
    let relicSets: any;
    let relicPieces: any;
    try {
      [characters, lightcones, relicSets, relicPieces] = await Promise.all(["characters", "lightcones", "relic_sets", "relic_pieces"].map((name) => ctx.data(name)));
    } catch (error) {
      root.innerHTML = `<div class="card error"><h2>读不到数据</h2><p class="error-text"></p><p class="muted small">数据文件缺失或损坏：请重新下载完整的工具箱。</p></div>`;
      root.querySelector(".error-text")!.textContent = (error as Error)?.message ?? String(error);
      return;
    }
    const data = buildStatData(characters, lightcones, relicSets, relicPieces);
    const catalog: Catalog = {
      characters: byId(characters, (c) => ({
        id: String(c.id), name: String(c.name), icon: c.icon, iconHd: c.iconHd, splash: c.splash, splashHd: c.splashHd, element: String(c.element ?? ""), elementName: c.elementName, path: String(c.path ?? ""), pathName: c.pathName,
        rarity: c.rarity, order: c.order, signatureCone: c.signatureCone, recommendedCones: c.recommendedCones,
      })),
      lightcones: byId(lightcones, (l) => ({ id: String(l.id), name: String(l.name), icon: l.icon, portrait: l.portrait, path: String(l.path ?? ""), pathName: l.pathName, rarity: l.rarity })),
      relicSets: byId(relicSets, (s) => ({ id: String(s.id), name: String(s.name), icon: s.icon })),
    };
    app = createApp(App, {
      call: (action: string, payload?: unknown) => ctx.call(action, JSON.parse(JSON.stringify(payload ?? {}))),
      data,
      catalog,
      isExe: !!(globalThis as any).__TAURI__,
      ocrBase: new URL("./ocr/", import.meta.url).href,
    });
    app.provide("popupRoot", root);
    app.mount(root);
  },

  unmount(): void {
    app?.unmount();
    app = null;
  },
};
