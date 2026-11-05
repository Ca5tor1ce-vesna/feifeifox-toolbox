/* 配速查询 · 结果页签：计算明细 / 行动时间轴 / 各模式需求 / 自动推荐的切换和下划线，
 * 以及「各模式需求」里看哪张表（只影响显示，不是计算状态）。 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, nextTick, ref } from "vue";
import { rise } from "./motion.ts";
import type { PlanState } from "./plan-state.ts";
import type { PlanRun } from "./use-plan-run.ts";

export const TABS = ["detail", "timeline", "tables", "recommend"];
export const KIND_TEXT: Record<string, string> = { pct: "速度 %", base: "基础" };

export function useResultTabs(s: PlanState, plan: PlanRun, root: HTMLElement) {
  const activeTab = ref("detail");
  const tabsBox = ref<HTMLDivElement | null>(null);
  const tabInk = ref<HTMLSpanElement | null>(null);
  function moveTabInk(): void {
    const tab = tabsBox.value?.querySelector<HTMLElement>(".tab.active");
    if (!tab || !tabInk.value) return;
    tabInk.value.style.width = `${tab.offsetWidth}px`;
    tabInk.value.style.transform = `translateX(${tab.offsetLeft}px)`;
  }
  async function selectTab(tab: string): Promise<void> {
    activeTab.value = tab;
    await nextTick();
    moveTabInk();
    rise(root.querySelector(`.sp-panel[data-panel="${tab}"]`));
  }
  let tabResize: ResizeObserver | null = null;
  /** 页签宽度变了（窗口缩放、字体加载完）下划线跟着走。 */
  function observeTabs(): void {
    if (typeof ResizeObserver === "function" && tabsBox.value) {
      tabResize = new ResizeObserver(moveTabInk);
      tabResize.observe(tabsBox.value);
    }
  }

  const tableModeView = ref<string | null>(null);
  const tables = computed<any[]>(() => plan.result.value?.tables || []);
  const viewId = computed(() => (tables.value.some((t) => t.id === tableModeView.value) ? tableModeView.value : s.state.target.mode));
  const viewTable = computed(() => tables.value.find((item) => item.id === viewId.value) || tables.value[0]);
  const viewTableMode = (id: string): void => { tableModeView.value = id; };
  /** 换了目标模式，表也回到目标模式那张。 */
  const resetTableView = (): void => { tableModeView.value = null; };

  const dispose = (): void => tabResize?.disconnect();

  return { activeTab, tabsBox, tabInk, moveTabInk, selectTab, observeTabs, tables, viewId, viewTable, viewTableMode, resetTableView, KIND_TEXT, dispose };
}
