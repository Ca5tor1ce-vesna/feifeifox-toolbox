/* 配速查询 · 光锥与遗器的选项：光锥按命途列，遗器套装附上速度效果说明。 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, shallowRef } from "vue";
import type { PickerItem } from "./Picker.vue";
import { fix } from "./motion.ts";
import type { Call, PlanState } from "./plan-state.ts";

function describeSet(set: any): string {
  if (!(set.effects || []).length) return "无速度效果";
  return (set.effects || []).map((effect: any) => {
    const prefix = effect.slot === "4件套" ? "4件" : "2件";
    if (effect.kind === "advance") return `${prefix} 拉条+${fix(effect.value, 0)}%`;
    if (effect.kind === "pct") return `${prefix} 速度+${fix(effect.value, 0)}%`;
    return `${prefix} 速度+${fix(effect.value, 0)}`;
  }).join("，");
}
const setOptions = (list: any[]): PickerItem[] => [
  { id: "", name: "（不用）", meta: "", icon: "" },
  ...list.map((set) => ({ id: set.id, name: set.name, meta: describeSet(set), title: set.summary || set.name, icon: set.icon })),
];

export function useGear(s: PlanState, call: Call) {
  const { catalog, state, isCustom, currentCharacter } = s;
  const cones = shallowRef<any[]>([]);
  const coneItems = computed<PickerItem[]>(() => [
    { id: "", name: "（不装备光锥）", meta: "", icon: "" },
    ...cones.value.map((cone) => ({ id: cone.id, name: cone.name, meta: `${cone.rarity}★ · ${cone.pathName}${cone.speedRelated ? " · 配速相关" : ""}`, icon: cone.icon })),
  ]);
  const fourPieceItems = setOptions(catalog.fourPieceSets || []);
  const ornamentItems = setOptions(catalog.ornamentSets || []);
  const nameIn = (items: PickerItem[], id: unknown): string => items.find((item) => String(item.id) === String(id))?.name || "";

  async function loadCones(): Promise<void> {
    // 自定义角色没有命途：不传 path，列出全部光锥
    const data = await call("lightcones", isCustom.value ? {} : { path: currentCharacter.value?.path });
    cones.value = (data.lightcones || []).sort(
      (a: any, b: any) => b.rarity - a.rarity || Number(b.speedRelated) - Number(a.speedRelated) || a.name.localeCompare(b.name, "zh"),
    );
    state.lightconeId = cones.value[0]?.id || "";
  }

  const relicNote = `套装效果来自官方文案，选中即自动计入：4 件套可选 ${(catalog.fourPieceSets || []).length} 个、位面饰品可选 ${(catalog.ornamentSets || []).length} 个。带条件的效果不会自动算，会单独列出来。`;
  const charInfo = catalog.dataInfo?.generatedAt ? `数据更新于 ${String(catalog.dataInfo.generatedAt).slice(0, 10)}` : "";

  return { cones, coneItems, fourPieceItems, ornamentItems, nameIn, loadCones, relicNote, charInfo };
}
