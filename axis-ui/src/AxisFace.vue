<script setup lang="ts">
import { ref, watch } from "vue";
import { vLoad } from "./img-load.ts";

const props = defineProps<{ src: string; name?: string }>();

// 没有本地头像（星神★阿哈）或图片加载失败时显示名字的第一个字。
const broken = ref(false);
watch(() => props.src, () => { broken.value = false; });
</script>

<template>
  <span class="axis-face" :title="name">
    <img v-if="src && !broken" v-load :src="src" alt="" @error="broken = true" />
    <span v-else class="axis-face-text" aria-hidden="true">{{ name?.charAt(0) ?? "?" }}</span>
  </span>
</template>
