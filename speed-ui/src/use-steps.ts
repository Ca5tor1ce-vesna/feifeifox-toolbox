/* 配速查询 · 步骤卡片折叠：折叠状态记在浏览器本地，展开时卡片内容升起。 */
import { nextTick, reactive, ref } from "vue";
import { rise } from "./motion.ts";

const STEP_KEY = "gt-speed-plan-steps";

export function useSteps() {
  const collapsedSteps = reactive(new Set<string>());
  try {
    const saved = JSON.parse(localStorage.getItem(STEP_KEY) || "[]");
    if (Array.isArray(saved)) for (const id of saved) collapsedSteps.add(String(id));
  } catch {
    /* 读不到就全部展开 */
  }
  const charBody = ref<HTMLDivElement | null>(null);
  function toggleStep(id: string): void {
    if (collapsedSteps.has(id)) {
      collapsedSteps.delete(id);
      void nextTick(() => rise(charBody.value));
    } else collapsedSteps.add(id);
    try {
      localStorage.setItem(STEP_KEY, JSON.stringify([...collapsedSteps]));
    } catch {
      /* 存不了就算了 */
    }
  }
  return { collapsedSteps, charBody, toggleStep };
}
