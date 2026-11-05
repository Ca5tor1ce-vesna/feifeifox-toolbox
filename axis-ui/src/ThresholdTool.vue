<script setup lang="ts">
import { computed, ref } from "vue";
import { speedThreshold } from "./model.ts";

const props = defineProps<{ firstCycleAV: number; cycleAV: number; maxT: number }>();

const targets = computed(() => Array.from({ length: props.maxT + 1 }, (_, t) => ({ t, av: props.firstCycleAV + t * props.cycleAV })));
const t = ref(0);
const actions = ref(2);
const advance = ref(0);

const targetAV = computed(() => targets.value[Math.min(t.value, targets.value.length - 1)].av);
const result = computed(() => {
  try {
    return { ok: speedThreshold(targetAV.value, Number(actions.value), Number(advance.value)), error: "" };
  } catch (error) {
    return { ok: null, error: (error as Error).message };
  }
});
</script>

<template>
  <details class="axis-more axis-threshold">
    <summary>速度阈值反推</summary>
    <div class="axis-threshold-fields">
      <label class="axis-field">
        <span>目标</span>
        <select v-model.number="t" class="input">
          <option v-for="item in targets" :key="item.t" :value="item.t">{{ item.t }}T（{{ item.av }} AV）</option>
        </select>
      </label>
      <label class="axis-field">
        <span>动数</span>
        <input v-model.number="actions" class="input" type="number" min="1" max="200" />
      </label>
      <label class="axis-field">
        <span>累计拉条 <small>%</small></span>
        <input v-model.number="advance" class="input" type="number" min="0" step="5" />
      </label>
    </div>
    <p v-if="result.ok" class="axis-threshold-result"><b>至少 {{ result.ok.required.toFixed(2) }} 速</b> <small>{{ result.ok.formula }}</small></p>
    <p v-else class="error-text">{{ result.error }}</p>
  </details>
</template>
