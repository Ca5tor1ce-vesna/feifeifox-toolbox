<script setup lang="ts">
import { computed, ref, watch } from "vue";
import AxisFace from "./AxisFace.vue";
import { vLoad } from "./img-load.ts";
import type { FaceCrop } from "./face-crops.ts";

export interface Head {
  splash: string;
  crop: FaceCrop;
}

// 轴上的头像：用透明底立绘，没有底色、属性和命途图标（2026-11-04 用户要求）。
// 以选人头像的取景为准再拉远一些，带上肩膀和上半身，不只剩一个头；头部附近（FOCUS）位置不动。
// 立绘必须铺满整个头像框：拉得太远时立绘比框窄，左右和底下会露出立绘的边（2026-11-04 用户反馈），
// 所以每个角色至少放大到盖满框，再把位置夹在框内。
// 没有立绘（自定义角色）或加载失败时退回普通头像。
const ZOOM_OUT = 0.8;
const FOCUS = [0.5, 0.15] as const;
/** 立绘的高宽比（随包的立绘都是 191×260 或 213×290）。 */
const SPLASH_RATIO = 260 / 191;
/** 盖满框时多留一点，免得抗锯齿在边上透出一条细线。 */
const COVER = 1.04;

const props = defineProps<{ head?: Head; icon?: string; name?: string }>();

const broken = ref(false);
watch(() => props.head?.splash, () => { broken.value = false; });
// 百分比都以头像边长为准：宽度和 left 相对容器宽度，top 也换算成同一边长（容器是正方形）。
const style = computed(() => {
  const [width, left, top] = props.head?.crop ?? [1, 0, 0];
  const zoom = Math.max(ZOOM_OUT, COVER / width);
  const w = width * zoom;
  const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));
  const x = clamp(FOCUS[0] - (FOCUS[0] - left) * zoom, 1 - w, 0);
  const y = clamp(FOCUS[1] - (FOCUS[1] - top) * zoom, 1 - w * SPLASH_RATIO, 0);
  const pct = (value: number): string => `${(value * 100).toFixed(2)}%`;
  return { width: pct(w), left: pct(x), top: pct(y) };
});
</script>

<template>
  <span v-if="head?.splash && !broken" class="axis-head" :title="name">
    <img v-load :src="head.splash" :style="style" alt="" @error="broken = true" />
  </span>
  <AxisFace v-else :src="icon ?? ''" :name="name" />
</template>
