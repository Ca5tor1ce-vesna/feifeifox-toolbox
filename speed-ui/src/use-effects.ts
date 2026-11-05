/* 配速查询 · 速度效果：按触发方式分组的勾选列表、套装与光锥明细、「要开大才生效」的提醒。
 * 订阅计算结果：有被挡住的套装效果就展开触发条件，并把勾选框对齐到算出来的结果。 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, nextTick, ref, watch } from "vue";
import { fix, rise } from "./motion.ts";
import type { PlanState } from "./plan-state.ts";
import type { PlanRun } from "./use-plan-run.ts";

const TRIGGER_TEXT: Record<string, { label: string; hint: string }> = {
  passive: { label: "常驻", hint: "开局就生效，默认勾上" },
  onEnter: { label: "进战", hint: "进入战斗时触发，开局即生效" },
  perUlt: { label: "开大", hint: "要开大才生效，按「更多目标设置」里的「首次开大」时刻开始算" },
  conditional: { label: "条件", hint: "需要满足特定条件才生效，请自行判断" },
};

export const describeEffect = (effect: any): string =>
  `${effect.slot} ${effect.kind === "pct" ? `速度 +${fix(effect.value, 1)}%` : effect.kind === "advance" ? `拉条 +${fix(effect.value, 0)}%` : `固定速度 +${fix(effect.value, 0)}`}`;

export function useEffects(s: PlanState, plan: PlanRun, root: HTMLElement) {
  const { state } = s;
  const { result, schedule } = plan;

  const enabledSet = computed(() => new Set<string>(result.value?.effects?.enabled || []));
  const effectGroups = computed(() => {
    const list = result.value?.effects?.speed || [];
    return ["passive", "onEnter", "perUlt", "conditional"]
      .map((key) => ({ key, trigger: TRIGGER_TEXT[key], items: list.filter((item: any) => (TRIGGER_TEXT[item.trigger] ? item.trigger : "conditional") === key) }))
      .filter((group) => group.items.length);
  });
  const effectsNeedNote = computed(() => (result.value?.effects?.speed || []).some((item: any) => item.apply !== "self" || !TRIGGER_TEXT[item.trigger] || item.trigger === "conditional"));
  const effectTitle = (item: any, groupKey: string): string =>
    `${item.text}\n${item.apply === "ally" ? "这条提速给的是队友（不算作自己的速度）" : item.apply === "enemy" ? "作用于敌方，不计入本角色" : TRIGGER_TEXT[groupKey].hint}`;
  function toggleEffect(id: string, on: boolean): void {
    const ids = new Set<string>(state.enabled || []);
    if (on) ids.add(id);
    else ids.delete(id);
    state.enabled = [...ids];
    schedule();
  }

  const blockedSets = computed(() => (result.value?.effects?.conditional || []).filter((item: any) => item.note && item.note.includes("需要开大")));
  const blockedNames = computed(() => blockedSets.value.map((item: any) => item.setName || item.name || "该效果").join("、"));
  const triggerMore = ref<HTMLDetailsElement | null>(null);

  const advanceMoreOpen = ref(false);
  const effectMoreOpen = ref(false);
  const advanceToggleHidden = computed(() => (result.value?.effects?.advance || []).length === 0);
  watch(advanceToggleHidden, (hidden) => { if (hidden) advanceMoreOpen.value = false; });
  const advanceBox = ref<HTMLDivElement | null>(null);
  const effectBox = ref<HTMLDivElement | null>(null);
  function toggleBox(which: "advance" | "effect"): void {
    const open = which === "advance" ? (advanceMoreOpen.value = !advanceMoreOpen.value) : (effectMoreOpen.value = !effectMoreOpen.value);
    if (open) void nextTick(() => rise(which === "advance" ? advanceBox.value : effectBox.value));
  }

  plan.onResult(async () => {
    // 有「开大才触发」的套装效果但开大次数是 0：展开触发条件，免得以为功能坏了
    if (blockedSets.value.length && triggerMore.value) triggerMore.value.open = true;
    await nextTick();
    // 勾选以算出来的为准（比如换光锥后默认勾选变了），输入框的显示也跟着它。
    root.querySelectorAll<HTMLInputElement>("[data-effect]").forEach((input) => { input.checked = enabledSet.value.has(input.dataset.effect || ""); });
  });

  return {
    enabledSet, effectGroups, effectsNeedNote, effectTitle, toggleEffect, describeEffect,
    blockedSets, blockedNames, triggerMore, advanceMoreOpen, effectMoreOpen, advanceToggleHidden, advanceBox, effectBox, toggleBox,
  };
}
