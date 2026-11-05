<script setup lang="ts">
/* 顶部的导入入口：扫描文件、战绩分享图（可多选）、UID（只在 exe 里能用）。 */
import { ref } from "vue";

const props = defineProps<{ isExe: boolean; busy: boolean; uid: string }>();
const emit = defineEmits<{ scan: [file: File]; images: [files: File[]]; uid: [uid: string] }>();
const scanInput = ref<HTMLInputElement | null>(null);
const imageInput = ref<HTMLInputElement | null>(null);
const uidText = ref(props.uid);

function pickScan(event: Event): void {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) emit("scan", file);
  (event.target as HTMLInputElement).value = "";
}
function pickImages(event: Event): void {
  const files = [...((event.target as HTMLInputElement).files ?? [])];
  if (files.length) emit("images", files);
  (event.target as HTMLInputElement).value = "";
}
</script>

<template>
  <div class="rs-import">
    <button type="button" class="btn" :disabled="busy" @click="imageInput?.click()">识图导入</button>
    <button type="button" class="btn secondary" :disabled="busy" @click="scanInput?.click()">导入扫描文件</button>
    <input ref="imageInput" type="file" accept="image/*" multiple hidden @change="pickImages" />
    <input ref="scanInput" type="file" accept=".json,application/json" hidden @change="pickScan" />
    <form v-if="isExe" class="rs-uid" @submit.prevent="emit('uid', uidText.trim())">
      <input v-model="uidText" class="input" inputmode="numeric" maxlength="10" placeholder="游戏 UID" aria-label="游戏 UID" />
      <button type="submit" class="btn secondary" :disabled="busy || !uidText.trim()">{{ uid ? "刷新展柜" : "查询展柜" }}</button>
    </form>
  </div>
</template>
