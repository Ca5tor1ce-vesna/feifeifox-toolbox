/* 配速查询 · 结论区：当前速度 → 需要速度、还差多少；订阅计算结果，数字滚动、达标状态变化时弹一下。 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, ref } from "vue";
import { bounce, fix, rollNumber } from "./motion.ts";
import type { PlanRun } from "./use-plan-run.ts";

// 一条速度副词条平均约 2.3 速（2.0 / 2.3 / 2.6 三档的中位），只用来估算「还要几条」
const SUBSTAT_ROLL = 2.3;

export function useHero(plan: PlanRun) {
  const verdict = computed(() => plan.result.value?.verdict);
  const heroTarget = computed(() => (verdict.value ? `（${verdict.value.customAV > 0 ? `${fix(verdict.value.customAV, 0)} AV` : `${verdict.value.t}T`} · ${verdict.value.actions} 动）` : ""));
  const gapText = computed(() => {
    if (!verdict.value) return "—";
    const gap = Number(verdict.value.gap);
    return gap > 0 ? `还差 ${fix(gap, 1)} 速` : `已达标，多 ${fix(Math.abs(gap), 1)} 速`;
  });
  const gapClass = computed(() => (!verdict.value ? "" : Number(verdict.value.gap) > 0 ? "bad" : "good"));
  const heroSub = computed(() => {
    if (!verdict.value) return "";
    const gap = Number(verdict.value.gap);
    return gap > 0
      ? `约需 ${Math.ceil(gap / SUBSTAT_ROLL)} 条速度副词条（按每条 ≈${SUBSTAT_ROLL} 速估算）· 当前行动值下能打 ${verdict.value.achievableActions} 动`
      : `当前行动值下能打 ${verdict.value.achievableActions} 动`;
  });

  const heroCurrent = ref<HTMLDivElement | null>(null);
  const heroNeed = ref<HTMLDivElement | null>(null);
  const heroGap = ref<HTMLDivElement | null>(null);
  let lastReached: boolean | null = null;
  plan.onResult((res) => {
    const v = res.verdict;
    rollNumber(heroCurrent.value, v.currentSpeed, 1);
    rollNumber(heroNeed.value, v.requiredSpeed, 1);
    const reached = Number(v.gap) <= 0;
    if (reached !== lastReached && lastReached !== null) bounce(heroGap.value);
    lastReached = reached;
  });

  return { verdict, heroTarget, gapText, gapClass, heroSub, heroCurrent, heroNeed, heroGap };
}
