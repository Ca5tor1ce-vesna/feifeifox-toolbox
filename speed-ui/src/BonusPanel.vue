<script setup lang="ts">
/* 配速查询 · 加成与拉条：副词条、其它加成、检测到的速度效果和明细。 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import NumField from "./NumField.vue";
import { fix } from "./motion.ts";
import { useSpeedPage } from "./page.ts";

const { rosterLinked, summaries, state, form, substatLimit, onSubstat, substatInvalid, onCustomPct, onCustomFlat, onAdvCustom, advanceMoreOpen, advanceToggleHidden, toggleBox, advanceBox, result, effectGroups, enabledSet, effectTitle, toggleEffect, effectsNeedNote, effectMoreOpen, effectBox, describeEffect } = useSpeedPage();
</script>

<template>
  <section class="sp-panel-card sp-bonus" data-step="bonus">
    <div class="sp-compact-head"><strong>加成与拉条</strong></div>
    <!-- 按实际装配算时，副词条速度已经从遗器里读出来了，不用填 -->
    <div v-if="!rosterLinked" class="sp-bonus-main">
      <NumField id="substat" label="副词条速度合计" :value="form.substat" min="0" :max="String(substatLimit)" step="any" :plus-disabled="Number(form.substat) >= substatLimit" @input="onSubstat" />
      <p id="substat-limit" class="hint" :class="{ 'error-text': substatInvalid }" aria-live="polite">五星遗器理论上限 {{ substatLimit }} 速（{{ state.relic.speedBoots ? "速度鞋不含速度副词条" : "不穿速度鞋，六件均可含速度副词条" }}）。{{ substatInvalid ? "当前数值超出上限，请调整。" : "" }}</p>
    </div>
    <details id="sp-other-more" class="sp-more">
      <summary>其它加成<span id="sum-other" class="sp-sum">{{ summaries.other }}</span></summary>
      <div class="sp-bonus-grid">
        <NumField id="customPct" label="其它速度 %" :value="form.customPct" step="1" @input="onCustomPct" />
        <NumField v-if="!rosterLinked" id="customFlat" label="其它固定速度" :value="form.customFlat" step="1" @input="onCustomFlat" />
        <NumField id="advCustom" label="其它拉条 %" :value="form.advCustom" step="5" @input="onAdvCustom" />
      </div>
      <button type="button" class="sp-link" data-toggle="sp-advance-more" :aria-expanded="advanceMoreOpen" :hidden="advanceToggleHidden" @click="toggleBox('advance')">查看拉条效果</button>
      <div id="sp-advance-more" ref="advanceBox" class="sp-more-box" :hidden="!advanceMoreOpen">
        <div id="r-advance-effects">
          <template v-if="result?.effects?.advance?.length">
            <h3>检测到的拉条效果（参考，换算成上面的「其它拉条 %」）</h3>
            <div v-for="(item, index) in result.effects.advance" :key="index" class="effect-row"><span class="pill">{{ item.origin }}</span><span class="grow">{{ item.text }}</span><span class="num">{{ fix(item.value, 0) }}%</span></div>
          </template>
        </div>
      </div>
    </details>
    <div class="sp-effects">
      <div class="sp-compact-head">
        <strong title="检测到的速度效果，打开开关后计入">角色与装备效果</strong>
        <button type="button" class="sp-link" data-toggle="sp-effect-more" :aria-expanded="effectMoreOpen" @click="toggleBox('effect')">套装与光锥明细</button>
      </div>
      <div id="r-effects">
        <template v-if="result">
          <p v-if="!result.effects.speed.length" class="hint">这个角色 + 光锥组合没有检测到速度类效果。</p>
          <template v-else>
            <div v-for="group in effectGroups" :key="group.key" class="sp-effect-group">
              <div class="effect-list">
                <label v-for="item in group.items" :key="item.id" class="effect-row" :class="{ 'ally-only': item.apply === 'ally' || item.apply === 'enemy' }" :title="effectTitle(item, group.key)">
                  <input type="checkbox" :data-effect="item.id" :checked="enabledSet.has(item.id)" @change="toggleEffect(item.id, ($event.target as HTMLInputElement).checked)" />
                  <span class="effect-origin">{{ item.origin }}<template v-if="item.name"> · {{ item.name }}</template></span>
                  <span class="trigger-badge" :class="group.key">{{ group.trigger.label }}</span>
                  <span v-if="item.apply === 'ally'" class="trigger-badge conditional" title="提速对象是队友，不是自己，不计入本角色速度">仅队友</span>
                  <span v-else-if="item.apply === 'enemy'" class="trigger-badge enemy" title="这是对敌方的效果，不计入本角色速度">作用于敌方</span>
                  <span class="grow">{{ item.text }}</span>
                  <span class="num">速度 {{ item.value >= 0 ? "+" : "" }}{{ fix(item.value, 1) }}{{ item.kind === "pct" ? "%" : "" }}{{ item.apply === "team" ? "（全队）" : "" }}</span>
                </label>
              </div>
            </div>
            <p v-if="effectsNeedNote" class="hint">「条件」类不会自动计入，勾上表示你自己确认它成立；「仅队友」「作用于敌方」的不算这个角色的速度。</p>
          </template>
        </template>
      </div>
      <div id="sp-effect-more" ref="effectBox" class="sp-more-box" :hidden="!effectMoreOpen">
        <div id="r-cone-advance">
          <template v-if="result">
            <template v-if="result.effects.coneAdvance?.length">
              <h3>当前光锥的拉条</h3>
              <div v-for="(item, index) in result.effects.coneAdvance" :key="`a${index}`" class="effect-row"><span class="pill">叠影 {{ item.superimpose }}</span><span class="grow">{{ item.text }}</span><span class="num">{{ item.counted !== undefined ? `已计入 ${fix(item.counted, 0)}%` : "填「光锥开大次数」后计入" }}</span></div>
            </template>
            <div v-for="(item, index) in result.effects.coneConditional || []" :key="`c${index}`" class="effect-row"><span class="pill">有条件</span><span class="grow">{{ item.text }}</span><span class="num">未计入</span></div>
          </template>
        </div>
        <div id="r-relics">
          <template v-if="result">
            <template v-if="result.relicSets?.length">
              <h3>遗器套装生效</h3>
              <div v-for="(set, index) in result.relicSets" :key="`s${index}`" class="effect-row"><span class="pill">{{ set.label }}</span><span class="grow"><b>{{ set.setName }}</b>　{{ set.effects.map(describeEffect).join("；") }}</span></div>
            </template>
            <template v-if="result.effects.conditional?.length">
              <h3>有条件的效果（未计入，需要的话自己加到「其它加成」里）</h3>
              <div v-for="(effect, index) in result.effects.conditional" :key="`e${index}`" class="effect-row"><span class="pill">{{ effect.setName }}·{{ effect.slot }}</span><span class="grow">{{ effect.text }}</span><span class="num">{{ describeEffect(effect) }}</span></div>
            </template>
          </template>
        </div>
      </div>
    </div>
  </section>
</template>
