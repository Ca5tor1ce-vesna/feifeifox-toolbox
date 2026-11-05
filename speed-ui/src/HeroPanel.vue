<script setup lang="ts">
/* 配速查询 · 结论：当前速度 → 需要速度，还差多少。 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useSpeedPage } from "./page.ts";

const { splashSrc, planError, verdict, heroArtBroken, heroCurrent, heroTarget, heroNeed, heroGap, gapClass, gapText, heroSub, markHeroArtBroken } = useSpeedPage();
</script>

<template>
  <div id="hero" class="sp-hero" :class="{ 'is-error': !!planError }" :title="verdict?.text || ''">
    <img id="hero-art" class="sp-hero-art" alt="" aria-hidden="true" :src="splashSrc || undefined" :style="{ display: splashSrc && !heroArtBroken ? 'block' : 'none' }" @error="markHeroArtBroken" />
    <div class="sp-hero-nums">
      <div class="sp-hero-num">
        <div class="k">当前速度</div>
        <div id="hero-current" ref="heroCurrent" class="v">—</div>
      </div>
      <div class="sp-hero-vs" aria-hidden="true">→</div>
      <div class="sp-hero-num">
        <div class="k"><span>需要速度</span><span id="hero-target">{{ heroTarget }}</span></div>
        <div id="hero-need" ref="heroNeed" class="v accent">—</div>
      </div>
    </div>
    <div class="sp-hero-foot">
      <div id="hero-gap" ref="heroGap" class="sp-hero-gap" :class="gapClass">{{ gapText }}</div>
      <div id="hero-sub" class="sp-hero-sub">{{ heroSub }}</div>
    </div>
    <div id="hero-error"><p v-if="planError" class="error-text">{{ planError }}</p></div>
  </div>
</template>
