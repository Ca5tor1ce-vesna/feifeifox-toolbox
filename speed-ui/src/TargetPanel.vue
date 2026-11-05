<script setup lang="ts">
/* 配速查询 · 计算目标：模式、T 数、动数和更多目标设置。 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import NumField from "./NumField.vue";
import SelectField from "./SelectField.vue";
import { useSpeedPage } from "./page.ts";

const { summaries, state, form, modeOptions, onMode, tOptions, onTargetT, onActions, onCustomAV, onFirstUlt, quickAV, onExcludeLastUlt } = useSpeedPage();
</script>

<template>
  <section class="sp-target" data-step="target">
    <div class="sp-target-line">
      <SelectField id="mode" label="目标模式" :value="state.target.mode" :options="modeOptions" @change="onMode" />
      <SelectField id="targetT" label="T 数" :value="String(state.target.t)" :options="tOptions" @change="onTargetT" />
      <NumField id="targetActions" label="动数" :value="form.targetActions" min="1" max="8" step="1" @input="onActions" />
    </div>
    <details id="sp-target-more" class="sp-more">
      <summary>更多目标设置<span id="sum-targetmore" class="sp-sum">{{ summaries.targetmore }}</span></summary>
      <div class="sp-form-row">
        <NumField id="customAV" label="行动值" :value="form.customAV" min="0" step="10" title="直接指定行动值；0 表示按 T 数" @input="onCustomAV" />
        <NumField id="firstUltAction" label="首次开大" :value="form.firstUltAction" min="0" step="1" title="首次开大在第几次行动后；0 表示进战即开大" @input="onFirstUlt" />
      </div>
      <div class="sp-aux">
        <span>行动值快捷选择</span>
        <button v-for="av in [150, 250, 300]" :key="av" type="button" class="sp-quick" :data-av="av" @click="quickAV(av)">{{ av }}</button>
      </div>
      <label class="sp-check"><input id="excludeLastUlt" type="checkbox" :checked="!!state.advance.excludeLastUlt" @change="onExcludeLastUlt" /> 轴底开大（最后一次开大的拉条不计入）</label>
      <p class="hint">行动值填 0 时按 T 数；首次开大填 0 表示进战即开大。首次开大影响开大提速，不影响拉条。</p>
    </details>
  </section>
</template>
