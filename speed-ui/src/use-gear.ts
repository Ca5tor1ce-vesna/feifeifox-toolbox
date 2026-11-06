/* 配速查询 · 光锥与遗器的选项：光锥按命途列，遗器套装附上速度效果说明。 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, shallowRef } from "vue";
import { nameOf, type PickerItem } from "../../ui-shared/src/components/picker-item.ts";
import { relicSetItems } from "../../ui-shared/src/hsr/picker-items.ts";
import { fix } from "./motion.ts";
import type { Call, PlanState } from "./plan-state.ts";

export function describeSet(set: any): string {
  if (!(set.effects || []).length) return "无速度效果";
  return (set.effects || []).map((effect: any) => {
    const prefix = effect.slot === "4件套" ? "4件" : "2件";
    if (effect.kind === "advance") return `${prefix} 拉条+${fix(effect.value, 0)}%`;
    if (effect.kind === "pct") return `${prefix} 速度+${fix(effect.value, 0)}%`;
    return `${prefix} 速度+${fix(effect.value, 0)}`;
  }).join("，");
}
const setOptions = (list: any[]): PickerItem[] => relicSetItems(list, "（不用）", describeSet);
/** 光锥选项名字后面的小字：和配速有关的光锥标出来。 */
const coneNote = (cone: any): string | undefined => (cone.speedRelated ? "配速相关" : undefined);

export function useGear(s: PlanState, call: Call) {
  const { catalog, state, isCustom, currentCharacter } = s;
  const cones = shallowRef<any[]>([]);
  /** 有强化版的角色 id（3.4 老角色加强），星魂旁边给「角色强化」开关。 */
  const enhanceableIds = shallowRef<Set<string>>(new Set());
  const fourPieceSets: any[] = catalog.fourPieceSets || [];
  const ornamentSets: any[] = catalog.ornamentSets || [];
  // 摘要里按 id 找名字用；下拉本身用业务组件，转换走同一个 relicSetItems。
  const fourPieceItems = setOptions(fourPieceSets);
  const ornamentItems = setOptions(ornamentSets);
  const nameIn = nameOf;

  // 角色卡右边显示当前光锥（2026-11-05 群里建议）：原画单独取一次，取不到就用小图标
  const coneArt = shallowRef<Record<string, string>>({});
  let artLoaded = false;
  const currentCone = computed(() => {
    const cone = cones.value.find((item) => String(item.id) === String(state.lightconeId));
    return cone ? { id: String(cone.id), name: cone.name as string, rarity: Number(cone.rarity), art: coneArt.value[cone.id] || cone.icon || "" } : null;
  });

  async function loadCones(): Promise<void> {
    // 自定义角色没有命途：不传 path，列出全部光锥
    const data = await call("lightcones", isCustom.value ? {} : { path: currentCharacter.value?.path });
    cones.value = (data.lightcones || []).sort(
      (a: any, b: any) => b.rarity - a.rarity || Number(b.speedRelated) - Number(a.speedRelated) || a.name.localeCompare(b.name, "zh"),
    );
    state.lightconeId = cones.value[0]?.id || "";
    if (!artLoaded) {
      artLoaded = true;
      coneArt.value = (await call("cone_art").catch(() => null))?.art ?? {};
      enhanceableIds.value = new Set((await call("enhanceable").catch(() => null))?.ids ?? []);
    }
  }

  const relicNote = `套装效果来自官方文案，选中即自动计入：4 件套可选 ${(catalog.fourPieceSets || []).length} 个、位面饰品可选 ${(catalog.ornamentSets || []).length} 个。带条件的效果不会自动算，会单独列出来。`;
  const charInfo = catalog.dataInfo?.generatedAt ? `数据更新于 ${String(catalog.dataInfo.generatedAt).slice(0, 10)}` : "";

  return { cones, coneNote, enhanceableIds, currentCone, fourPieceSets, ornamentSets, describeSet, fourPieceItems, ornamentItems, nameIn, loadCones, relicNote, charInfo };
}
