/**
 * 崩铁业务：把光锥、遗器套装转成通用带图下拉（IconPicker）的选项。
 * 各页面（配速查询、全角色行动轴）都从这里转，选项长什么样只有一份；页面只传自己要加的小字（配速相关、影响轴……）。
 */
import type { PickerItem } from "../components/picker-item.ts";

/** 选项要用到的光锥字段；各页面的光锥数据都有这些。 */
export interface ConeLike {
  id: string | number;
  name: string;
  rarity?: number;
  pathName?: string;
  icon?: string;
}

/** 选项要用到的遗器套装字段。 */
export interface RelicSetLike {
  id: string | number;
  name: string;
  icon?: string;
  /** 套装效果全文，做悬停说明。 */
  summary?: string;
}

/** 光锥选项：第一项是「不装备」，右侧小字是「5★ · 巡猎」，再接上页面给的说明。 */
export function coneItems<T extends ConeLike>(cones: readonly T[], emptyLabel: string, note?: (cone: T) => string | undefined): PickerItem[] {
  return [
    { id: "", name: emptyLabel, meta: "", icon: "" },
    ...cones.map((cone) => ({
      id: String(cone.id),
      name: cone.name,
      meta: [cone.rarity ? `${cone.rarity}★` : "", cone.pathName ?? "", note?.(cone) ?? ""].filter(Boolean).join(" · "),
      icon: cone.icon ?? "",
    })),
  ];
}

/** 遗器套装选项：第一项是「不用」，右侧小字由页面决定（配速查询写速度效果，行动轴写影响轴），悬停看套装效果全文。 */
export function relicSetItems<T extends RelicSetLike>(sets: readonly T[], emptyLabel: string, describe?: (set: T) => string | undefined): PickerItem[] {
  return [
    { id: "", name: emptyLabel, meta: "", icon: "" },
    ...sets.map((set) => ({ id: String(set.id), name: set.name, meta: describe?.(set) ?? "", title: set.summary || set.name, icon: set.icon ?? "" })),
  ];
}
