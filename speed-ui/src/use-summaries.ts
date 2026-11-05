/* 配速查询 · 折叠区块标题后面的一行摘要（角色、光锥、遗器、其它加成、目标……）。只读状态，不改任何东西。 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, type Ref } from "vue";
import type { PickerItem } from "./Picker.vue";
import { fix } from "./motion.ts";
import type { PlanState } from "./plan-state.ts";
import type { PlanRun } from "./use-plan-run.ts";

interface GearView {
  cones: Ref<any[]>;
  fourPieceItems: PickerItem[];
  ornamentItems: PickerItem[];
  nameIn: (items: PickerItem[], id: unknown) => string;
}

const signed = (value: unknown, unit = ""): string => `${Number(value) > 0 ? "+" : ""}${Number(value)}${unit}`;

/** linked：正按「角色与遗器」的实际装配算时，「其它固定速度」是补差额用的，不算用户填的加成。 */
export function useSummaries(s: PlanState, gear: GearView, plan: PlanRun, tables: Ref<any[]>, linked: Ref<unknown>) {
  const { state, currentCharacter } = s;
  const summaries = computed(() => {
    const character = currentCharacter.value;
    const cone = gear.cones.value.find((item) => String(item.id) === String(state.lightconeId));
    const res = plan.result.value;
    const mode = tables.value.find((t) => t.id === state.target.mode);
    const v = res?.verdict;
    const first = Number(state.simulation.firstUltAction);
    return {
      char: `${character.name || "—"} · ${state.eidolon} 魂 · 初始 ${fix(character.effectiveBaseSpeed ?? character.baseSpeed, 0)} 速`,
      cone: cone ? `${cone.name} · 叠影 ${state.superimpose}` : "不装备光锥",
      relic: [
        state.relic.fourPieceId ? gear.nameIn(gear.fourPieceItems, state.relic.fourPieceId) : "无 4 件套",
        state.relic.ornamentIds?.[0] ? gear.nameIn(gear.ornamentItems, state.relic.ornamentIds[0]) : "无饰品",
        state.relic.speedBoots ? "速度鞋" : "非速度鞋",
      ].join(" · "),
      other: [
        state.relic.customPct ? `速度 ${signed(state.relic.customPct, "%")}` : "",
        state.relic.customFlat && !linked.value ? `固定 ${signed(state.relic.customFlat)}` : "",
        state.advance.custom ? `拉条 ${signed(state.advance.custom, "%")}` : "",
      ].filter(Boolean).join(" · "),
      targetmore: [
        state.target.customAV ? `按 ${state.target.customAV} AV 算` : "",
        first !== 1 ? (first === 0 ? "进战即开大" : `第 ${state.simulation.firstUltAction} 动后开大`) : "",
        state.advance.excludeLastUlt ? "轴底开大" : "",
      ].filter(Boolean).join(" · "),
      trigger: [
        state.relic.fourPieceUlts ? `遗器开大 ${state.relic.fourPieceUlts} 次` : "",
        state.advance.coneUlts ? `光锥开大 ${state.advance.coneUlts} 次` : "",
      ].filter(Boolean).join(" · "),
      bonus: res ? `副词条 +${fix(state.relic.substatSpeed || 0, 0)} · 已勾 ${(res.effects.enabled || []).length} 条效果 · 拉条 ${fix(res.advance.total, 0)}%` : "",
      target: v
        ? `${mode?.name || state.target.mode} · ${v.customAV > 0 ? `${fix(v.customAV, 0)} AV` : `${v.t}T`} · ${v.actions} 动 · 首次开大 ${state.simulation.firstUltAction === 0 ? "进战" : `第 ${state.simulation.firstUltAction} 动后`}`
        : "",
    };
  });
  return { summaries };
}
