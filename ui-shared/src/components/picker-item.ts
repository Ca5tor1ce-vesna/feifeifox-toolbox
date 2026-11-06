/** 通用带图下拉（IconPicker）的一个选项。不带任何游戏含义：名字、右侧小字、悬停说明、图标。 */
export interface PickerItem {
  id: string;
  name: string;
  /** 名字右边的灰色小字。 */
  meta?: string;
  /** 悬停时的说明，没有就用 meta。 */
  title?: string;
  icon?: string;
}

/** 按 id 找选项的名字（找不到返回空字符串）。 */
export const nameOf = (items: readonly PickerItem[], id: unknown): string => items.find((item) => String(item.id) === String(id))?.name || "";
