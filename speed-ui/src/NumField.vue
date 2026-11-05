<script setup lang="ts">
import { ref } from "vue";

// 带「− / +」的数字框。− / + 按输入框自己的 step/min/max 调整，再发 input 与 change，和直接输入走同一条路。
const props = defineProps<{
  id: string;
  label: string;
  value: string;
  min?: string;
  max?: string;
  step?: string;
  placeholder?: string;
  title?: string;
  plusDisabled?: boolean;
}>();
const emit = defineEmits<{ input: [value: string] }>();
const input = ref<HTMLInputElement | null>(null);

const nudge = (dir: number): void => {
  const element = input.value;
  if (!element || element.disabled) return;
  if (element.value === "") element.value = element.min || "0";
  else if (element.step === "any") {
    let next = Number(element.value) + dir;
    if (element.min !== "") next = Math.max(Number(element.min), next);
    if (dir > 0 && element.max !== "") next = Math.min(Number(element.max), next);
    element.value = String(next);
  } else if (dir > 0) element.stepUp();
  else element.stepDown();
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
};
const onInput = (event: Event): void => emit("input", (event.target as HTMLInputElement).value);
defineExpose({ input });
</script>

<template>
  <div class="field">
    <label :for="props.id">{{ props.label }}</label>
    <div class="sp-control sp-numeric">
      <button type="button" :data-step-for="props.id" data-dir="-1" :aria-label="`减少${props.label}`" @click="nudge(-1)">−</button>
      <input :id="props.id" ref="input" type="number" :value="props.value" :min="props.min" :max="props.max" :step="props.step" :placeholder="props.placeholder" :title="props.title" @input="onInput" />
      <button type="button" :data-step-for="props.id" data-dir="1" :aria-label="`增加${props.label}`" :disabled="props.plusDisabled" @click="nudge(1)">+</button>
    </div>
  </div>
</template>
