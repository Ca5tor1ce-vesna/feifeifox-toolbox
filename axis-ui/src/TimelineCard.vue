<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import AxisHead, { type Head } from "./AxisHead.vue";
import { vLoad } from "./img-load.ts";
import { cardDamage, formatDamage, type RowDamage } from "./damage.ts";
import { AHA_NAME, TYPE_NAMES, type AxisCard, type Row } from "./model.ts";
import { prefersReducedMotion } from "./motion.ts";
import { claimClipPlayback, releaseClipPlayback, type UltClip } from "./ult-clips.ts";

// 轴上的一张卡。头像用 AxisHead（和选人头像同样取景的透明底立绘，没有底色和图标），大招多一张立绘。
const props = defineProps<{ damage: Record<string, RowDamage> | null; card: AxisCard; icons: Record<number, string>; splashes: Record<number, string>; heads: Record<number, Head>; clips: Record<number, UltClip>; active?: boolean }>();

// 挂在卡片右边的小头像下面只写两三个字。
const SHORT: Record<string, string> = { fua: "追击", elation_skill: "欢愉技", memosprite: "忆灵技" };

const main = computed(() => props.card.main);
const hitTotal = computed(() => cardDamage([...(main.value ? [main.value.key] : []), ...props.card.follows.map((row) => row.key)], props.damage));
const faceOf = (row: Row): string => (row.slot === null ? "" : props.icons[row.slot] ?? "");
const headOf = (row: Row): Head | undefined => (row.slot === null ? undefined : props.heads[row.slot]);
const splashOf = (row: Row): string => (row.slot === null ? "" : props.splashes[row.slot] ?? "");
const isAha = (row: Row): boolean => row.name === AHA_NAME;
// 【阿哈时刻】卡：欢愉技排成一排小头像，其余（少见）照常挂在右边。
const casters = computed(() => (props.card.kind === "aha" ? props.card.follows.filter((row) => row.type === "elation_skill") : []));
const follows = computed(() => (props.card.kind === "aha" ? props.card.follows.filter((row) => row.type !== "elation_skill") : props.card.follows));
const extra = computed(() => !!main.value?.extra || props.card.notes.some((row) => row.type === "extra_turn"));
// 「额外」标签已经说了是额外回合，只留括号里的「计入 20 笑点」。
const ahaText = computed(() => {
  const text = main.value?.label.replace(AHA_NAME, "").trim() || "触发";
  return extra.value ? text.replace(/^额外回合[（(]?(.*?)[）)]?$/, "$1") : text;
});
const energyText = (row: Row): string => {
  if (row.energy === null) return "";
  return row.energyName === "能量" ? `${row.energy.toFixed(0)} 能` : `${row.energyName} ${row.energy.toFixed(0)}`;
};
const techCount = computed(() => props.card.notes.filter((row) => row.type === "tech").length);
const splash = computed(() => (main.value ? splashOf(main.value) : ""));
// 横幅里的立绘按每个角色的头像取景摆：脸落在横幅右侧中间，不同立绘构图不同，统一裁会歪（2026-11-04 用户反馈）。
// 头像框边长 FRAME 比横幅高一些，露出肩膀；框贴在横幅右边。数值都是像素，横幅高约 60。
const ART_WIDTH = 180;
const BANNER = 60;
const FRAME = 78;
const SPLASH_RATIO = 260 / 191;
const artStyle = computed(() => {
  const head = main.value ? headOf(main.value) : undefined;
  const [width, left, top] = head?.crop ?? [1.2, -0.1, -0.15];
  const size = width * FRAME;
  const frameLeft = ART_WIDTH - FRAME - 6;
  const frameTop = (BANNER - FRAME) / 2;
  // 右边和上下都不能露出立绘的边；左边有渐隐遮罩，露一点没关系。
  const x = Math.max(frameLeft + left * FRAME, ART_WIDTH - size);
  const y = Math.max(Math.min(frameTop + top * FRAME, 0), BANNER - size * SPLASH_RATIO);
  const px = (value: number): string => `${value.toFixed(1)}px`;
  return { width: px(size), left: px(x), top: px(y) };
});

// ---- 大招动画 ---- //
// 平时显示立绘；大招演出（出轴、点开、多开了大）时放一遍大招动画片段，放完回到立绘。
// 选中这张卡或鼠标停在上面时循环播放。减少动态效果时不播。
const clip = computed(() => (props.card.kind === "ult" && main.value && main.value.slot !== null ? props.clips[main.value.slot] : undefined));
const video = ref<HTMLVideoElement | null>(null);
const playing = ref(false);
const hovering = ref(false);
const reduced = prefersReducedMotion();
const stop = (): void => {
  video.value?.pause();
  playing.value = false;
  releaseClipPlayback(stop);
};
const play = (loop: boolean): void => {
  const element = video.value;
  if (!element || reduced || !claimClipPlayback(stop, loop)) return;
  element.loop = loop;
  if (!loop || element.paused) element.currentTime = 0;
  element.play().then(() => { playing.value = !element.paused; }).catch(() => { playing.value = false; });
};
const keepLooping = (): boolean => !!props.active || hovering.value;
watch(() => props.active, (on) => { if (on) play(true); else if (!hovering.value) stop(); });
const onAnimation = (event: AnimationEvent): void => {
  if (event.animationName === "axis-splash-in") play(keepLooping());
};
const onEnter = (): void => { hovering.value = true; if (clip.value) play(true); };
const onLeave = (): void => { hovering.value = false; if (!props.active) stop(); };
const onEnded = (): void => { if (!keepLooping()) stop(); };
onBeforeUnmount(stop);
</script>

<template>
  <button class="axis-card" :class="[`is-${card.kind}`, { 'is-clip-playing': playing }]" type="button" :data-key="card.key" @animationstart="onAnimation" @mouseenter="onEnter" @mouseleave="onLeave">
    <template v-if="card.kind === 'start' || !main">
      <b>开战</b>
      <span class="axis-card-meta">{{ techCount ? `${techCount} 个秘技 · ` : "" }}{{ card.notes.length }} 条进场效果</span>
    </template>

    <template v-else-if="card.kind === 'aha'">
      <span class="axis-face axis-face-aha axis-card-face" aria-hidden="true"></span>
      <span class="axis-card-body">
        <b>阿哈时刻</b>
        <span class="axis-card-meta"><span v-if="extra" class="axis-card-tag">额外</span>{{ ahaText }}<template v-if="casters.length"> · {{ casters.length }} 个欢愉技</template></span>
      </span>
      <span v-if="casters.length" class="axis-card-cast">
        <span v-for="row in casters" :key="row.key" class="axis-card-caster" :title="row.label"><img v-if="faceOf(row)" v-load :src="faceOf(row)" alt="" /><b v-else>{{ row.name.charAt(0) }}</b></span>
      </span>
    </template>

    <template v-else>
      <span v-if="card.kind === 'ult' && splash" class="axis-card-art" aria-hidden="true"><img v-load class="axis-card-splash" :src="splash" :style="artStyle" alt="" /></span>
      <video v-if="clip" ref="video" class="axis-card-clip" :src="clip.src" :style="{ objectPosition: `50% ${clip.y}%` }" muted playsinline preload="none" aria-hidden="true" @ended="onEnded"></video>
      <AxisHead class="axis-card-face" :head="headOf(main)" :icon="faceOf(main)" :name="main.name" />
      <span class="axis-card-body">
        <small v-if="card.kind === 'ult'" class="axis-card-ult">终结技</small>
        <b>{{ main.name }}</b>
        <span v-if="card.kind !== 'ult'" class="axis-card-meta">
          <span class="axis-card-type" :class="`is-${main.type}`">{{ TYPE_NAMES[main.type] ?? main.type }}</span>
          <span v-if="extra" class="axis-card-tag">额外</span>
        </span>
      </span>
      <span v-if="card.kind !== 'ult' && energyText(main)" class="axis-card-energy">{{ energyText(main) }}</span>
    </template>

    <span v-if="hitTotal !== null" class="axis-card-damage" :title="`这一动的伤害 ${formatDamage(hitTotal)}`">{{ formatDamage(hitTotal) }}</span>
    <span v-if="follows.length" class="axis-card-follows">
      <span class="axis-card-plus" aria-hidden="true">+</span>
      <span v-for="row in follows" :key="row.key" class="axis-card-follow" :class="{ 'is-extra': row.extra }" :title="row.label">
        <span v-if="isAha(row)" class="axis-face axis-face-aha" aria-hidden="true"></span>
        <AxisHead v-else :head="headOf(row)" :icon="faceOf(row)" :name="row.name" />
        <em>{{ SHORT[row.type] ?? TYPE_NAMES[row.type] ?? row.type }}</em>
      </span>
    </span>
  </button>
</template>
