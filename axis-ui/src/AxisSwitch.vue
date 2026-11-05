<script setup lang="ts">
import { SwitchRoot, SwitchThumb } from "reka-ui";

defineProps<{ modelValue: boolean; label: string }>();
const emit = defineEmits<{ "update:modelValue": [value: boolean] }>();
</script>

<template>
  <label class="axis-switch-field">
    <SwitchRoot class="axis-switch" :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)">
      <SwitchThumb class="axis-switch-thumb" />
    </SwitchRoot>
    <span>{{ label }}</span>
  </label>
</template>
