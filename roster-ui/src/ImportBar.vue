<script setup lang="ts">
/* 顶部的导入入口：扫描文件、战绩分享图（可多选）、UID（只在 exe 里能用）。 */
import { ref } from "vue";

const props = defineProps<{ isExe: boolean; busy: boolean; uid: string }>();
const emit = defineEmits<{ scan: [file: File]; images: [files: File[]]; uid: [uid: string] }>();
const uidText = ref(props.uid);
// 安卓 App 里的内置网页（B站 App 打开的 Toy 等）给文件框带「多选」时，有的手机点了没反应；那里一次选一张。
const multiPick = !(/Android/i.test(navigator.userAgent) && /; wv\)|BiliApp|MicroMessenger|QQ\//i.test(navigator.userAgent));

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
    <!-- 文件框透明地盖在按钮上，点按钮就是点文件框本身。不用脚本去点隐藏的文件框：手机 App 里的内置网页常常不认。 -->
    <label class="btn rs-file" :class="{ disabled: busy }">
      识图导入
      <input type="file" accept="image/*" :multiple="multiPick" :disabled="busy" aria-label="识图导入：选战绩分享图" @change="pickImages" />
    </label>
    <label class="btn secondary rs-file" :class="{ disabled: busy }">
      导入扫描文件
      <input type="file" accept=".json,application/json" :disabled="busy" aria-label="导入扫描文件" @change="pickScan" />
    </label>
    <form v-if="isExe" class="rs-uid" @submit.prevent="emit('uid', uidText.trim())">
      <input v-model="uidText" class="input" inputmode="numeric" maxlength="10" placeholder="游戏 UID" aria-label="游戏 UID" />
      <button type="submit" class="btn secondary" :disabled="busy || !uidText.trim()">{{ uid ? "刷新展柜" : "查询展柜" }}</button>
    </form>
  </div>
</template>
