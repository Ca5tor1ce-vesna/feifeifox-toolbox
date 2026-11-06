<script setup lang="ts" generic="T extends RelicSetLike">
// 业务组件：遗器 4 件套 / 位面饰品选择（带图、可搜索）。把套装数据转成选项交给通用的 IconPicker。
import { computed } from "vue";
import IconPicker from "../components/IconPicker.vue";
import { relicSetItems, type RelicSetLike } from "./picker-items.ts";

const props = withDefaults(defineProps<{
  buttonId: string;
  sets: readonly T[];
  value: string;
  /** 4 件套还是位面饰品：决定搜索框的提示。 */
  kind: "four" | "ornament";
  /** 「不用」那一项叫什么。 */
  emptyLabel?: string;
  /** 名字右边的小字（配速查询写速度效果，行动轴写影响轴）。 */
  describe?: (set: T) => string | undefined;
  buttonClass?: string;
}>(), { emptyLabel: "（不用）", describe: undefined, buttonClass: undefined });
const emit = defineEmits<{ pick: [id: string] }>();

const items = computed(() => relicSetItems(props.sets, props.emptyLabel, props.describe));
const searchPlaceholder = computed(() => (props.kind === "four" ? "搜索遗器 4 件套…" : "搜索位面饰品…"));
</script>

<template>
  <IconPicker :button-id="props.buttonId" :items="items" :value="props.value" :placeholder="props.emptyLabel" :search-placeholder="searchPlaceholder" :button-class="props.buttonClass" @pick="emit('pick', $event)" />
</template>
