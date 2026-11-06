<script setup lang="ts" generic="T extends ConeLike">
// 业务组件：光锥选择（带图、可搜索）。把光锥数据转成选项交给通用的 IconPicker；页面只管当前值和自己要加的小字。
import { computed } from "vue";
import IconPicker from "../components/IconPicker.vue";
import { coneItems, type ConeLike } from "./picker-items.ts";

const props = withDefaults(defineProps<{
  buttonId: string;
  cones: readonly T[];
  value: string;
  /** 「不装备光锥」那一项叫什么。 */
  emptyLabel?: string;
  /** 星级、命途后面再加的小字（配速查询的「配速相关」、行动轴的「影响轴」）。 */
  note?: (cone: T) => string | undefined;
  buttonClass?: string;
}>(), { emptyLabel: "（不装备光锥）", note: undefined, buttonClass: undefined });
const emit = defineEmits<{ pick: [id: string] }>();

const items = computed(() => coneItems(props.cones, props.emptyLabel, props.note));
</script>

<template>
  <IconPicker :button-id="props.buttonId" :items="items" :value="props.value" :placeholder="props.emptyLabel" search-placeholder="搜索光锥…" :button-class="props.buttonClass" @pick="emit('pick', $event)" />
</template>
