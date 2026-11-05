<script setup lang="ts">
/* 配速查询 · 我的配速：保存、套用、删除和队伍模拟补充参数。 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import NumField from "./NumField.vue";
import SelectField from "./SelectField.vue";
import { useSpeedPage } from "./page.ts";

const { form, presetStatus, savedPreset, applyPreset, savingPreset, savePreset, deletePreset, presetNote, teamLink } = useSpeedPage();
</script>

<template>
  <section class="sp-saved">
    <div class="sp-presetbar">
      <strong class="sp-presetbar-label">我的配速</strong>
      <span id="preset-status" class="sp-preset-status">{{ presetStatus }}</span>
      <button id="apply-preset" type="button" class="sp-btn" :hidden="!savedPreset" @click="applyPreset">套用</button>
      <button id="save-preset" type="button" class="sp-btn primary" title="把当前这套（光锥/叠影/星魂/遗器/拉条/目标）存下来，下次一键套用" :disabled="savingPreset" @click="savePreset">保存</button>
      <button id="delete-preset" type="button" class="sp-btn" :hidden="!savedPreset" @click="deletePreset">删除</button>    </div>
    <p id="preset-note" class="hint sp-preset-note"><span v-if="presetNote.error" class="error-text">{{ presetNote.text }}</span><template v-else>{{ presetNote.text }}</template></p>
    <details class="sp-more sp-sim-save">
      <summary>队伍模拟补充参数</summary>
      <div class="sp-form-row">
        <NumField id="preset-err" label="额外充能效率 %" :value="form.presetErr" min="0" step="0.1" @input="(v: string) => (form.presetErr = v)" />
        <NumField id="preset-energy" label="开局资源" :value="form.presetEnergy" min="0" step="any" placeholder="默认" @input="(v: string) => (form.presetEnergy = v)" />
        <SelectField id="preset-rotation" label="出招" :value="form.presetRotation" :options="[{ value: 'auto', label: '智能出招' }, { value: 'skill', label: '全程战技' }, { value: 'basic', label: '全程普攻' }]" @change="(v: string) => (form.presetRotation = v)" />
      </div>
      <p class="hint">随角色配装保存。充能填写遗器和光锥特效以外的加成；愿力、隐藏分角色不使用充能效率。开局资源单位为角色的能量、愿力或隐藏分。</p>
    </details>
    <a v-if="teamLink" id="open-team-simulator" class="sp-team-link" :href="teamLink">前往队伍与行动模拟　→</a>
  </section>
</template>
