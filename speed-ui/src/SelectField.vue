<script setup lang="ts">
export interface Option {
  value: string;
  label: string;
  title?: string;
}
const props = defineProps<{ id: string; label: string; options: Option[]; value: string; extra?: string }>();
const emit = defineEmits<{ change: [value: string] }>();
</script>

<template>
  <div class="field" :class="props.extra">
    <label :for="props.id">{{ props.label }}</label>
    <div class="sp-control sp-select">
      <select :id="props.id" :value="props.value" @change="emit('change', ($event.target as HTMLSelectElement).value)">
        <option v-for="option in props.options" :key="option.value" :value="option.value" :title="option.title">{{ option.label }}</option>
      </select>
      <svg class="sp-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 9 7 7 7-7" /></svg>
    </div>
  </div>
</template>
