/** 各功能页共用的外壳接口和小工具（2026-11-04 起统一放这里，不在每个页面各写一份）。
 *
 * 外壳（app/app.js 的 makeCtx）给每个功能页传同一个 ctx；每个页面只用到其中一部分。
 */

/** 页面草稿的自动保存（外壳的 ctx.persistence）。 */
export interface FeaturePersistence {
  /** 上次存的草稿。 */
  load?: () => { data?: unknown } | undefined;
  /** 异步改了输入之后，让外壳马上记一次。 */
  capture?: () => void;
  /** 异步结果渲染完，恢复页面里的滚动位置。 */
  restoreUI?: (root: HTMLElement) => void;
  /** 没有 getState 的页面：按控件 id 把上次的输入填回去，emit 为 true 时顺带发 input/change。 */
  restoreForms?: (root: HTMLElement, emit?: boolean) => void;
}

export interface FeatureCtx {
  /** 调浏览器里的后端动作（shell/src/backend.ts），出错时抛出能看懂的错误。 */
  call: (action: string, payload?: unknown) => Promise<unknown>;
  /** 读模块 data/<名字>.json，图片路径已经按站点根目录换算好。 */
  data: (name: string) => Promise<unknown>;
  persistence?: FeaturePersistence | null;
}

/** 只在有鼠标的设备上自动聚焦（比如弹窗里的搜索框）：手机上一聚焦就弹出键盘，挡住要选的东西。 */
export function focusOnPointerDevice(element: { focus(): void } | null | undefined): void {
  if (element && typeof matchMedia === "function" && matchMedia("(pointer: fine)").matches) element.focus();
}
