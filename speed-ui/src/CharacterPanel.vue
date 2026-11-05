<script setup lang="ts">
/* 配速查询 · 角色卡：立绘、星魂、光锥、遗器、触发条件、自定义角色。 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import CharacterDialog from "./CharacterDialog.vue";
import NumField from "./NumField.vue";
import Picker from "./Picker.vue";
import SelectField from "./SelectField.vue";
import { fix } from "./motion.ts";
import { useSpeedPage } from "./page.ts";

const { collapsedSteps, toggleStep, summaries, charBody, openCharacters, splash, splashSrc, splashBroken, onSplashLoad, state, numberOptions, onEidolon, splashMeta, currentCharacter, charSpeed, charTrace, coneItems, pickCone, onSuperimpose, fourPieceItems, pickFourPiece, ornamentItems, pickOrnament, onSpeedBoots, blockedSets, blockedNames, triggerMore, form, onFourUlts, onConeUlts, onUltTargetsAlly, relicNote, charInfo, characterDialog, characters, pickCharacter, isCustom, onCustomInput, markSplashBroken } = useSpeedPage();
</script>

<template>
  <section class="sp-panel-card sp-step sp-char-panel" :class="{ collapsed: collapsedSteps.has('char') }" data-step="char">
    <button type="button" class="sp-step-head" :aria-expanded="collapsedSteps.has('char') ? 'false' : 'true'" @click="toggleStep('char')">
      <span class="sp-step-title">角色</span>
      <span id="sum-char" class="sp-step-sum">{{ summaries.char }}</span>
      <span class="sp-caret" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m6 15 6-6 6 6" /></svg></span>
    </button>
    <div ref="charBody" class="sp-step-body sp-char-body">
      <div class="sp-portrait-column">
        <div id="portrait" class="sp-portrait" title="点击更换角色" @click="openCharacters">
          <img id="splash" ref="splash" class="sp-splash" alt="角色立绘" :src="splashSrc || undefined" :style="{ visibility: splashSrc && !splashBroken ? 'visible' : 'hidden' }" @load="onSplashLoad" @error="markSplashBroken" />
          <div class="sp-art-wash" aria-hidden="true"></div>
        </div>
        <button id="select-character" type="button" class="sp-pick" @click="openCharacters">选择角色　⌕</button>
      </div>
      <div class="sp-config">
        <SelectField id="eidolon" label="星魂" extra="sp-soul" :value="String(state.eidolon)" :options="numberOptions([0, 1, 2, 3, 4, 5, 6], ' 魂')" @change="onEidolon" />
        <div id="splash-meta" ref="splashMeta" class="sp-splash-meta">
          <h2 class="sp-char-title">{{ currentCharacter.name || "选个角色" }}</h2>
          <div class="sp-char-path">{{ currentCharacter.pathName || "" }}<template v-if="currentCharacter.elementName"> · {{ currentCharacter.elementName }}</template></div>
          <div class="sp-char-speed">初始速度 {{ fix(charSpeed, 0) }}<template v-if="charTrace">（基础 {{ fix(currentCharacter.baseSpeed, 0) }} + 行迹 {{ fix(charTrace, 0) }}）</template></div>
        </div>
        <div class="sp-split"></div>
        <div class="sp-form-row">
          <div class="field sp-grow">
            <label>光锥（只显示同命途）</label>
            <Picker button-id="lightcone-picker" :items="coneItems" :value="state.lightconeId || ''" placeholder="（不装备光锥）" search-placeholder="搜索光锥…" @pick="pickCone" />
          </div>
          <SelectField id="superimpose" label="叠影" extra="sp-tiny" :value="String(state.superimpose)" :options="numberOptions([1, 2, 3, 4, 5])" @change="onSuperimpose" />
        </div>
        <div class="sp-split"></div>
        <h3 class="sp-cfg-heading">遗器</h3>
        <div class="sp-form-row">
          <div class="field sp-grow">
            <label>遗器 4 件套</label>
            <Picker button-id="fourPiece-picker" :items="fourPieceItems" :value="state.relic.fourPieceId || ''" placeholder="（不用）" search-placeholder="搜索遗器 4 件套…" @pick="pickFourPiece" />
          </div>
          <div class="field sp-grow">
            <label>位面饰品</label>
            <Picker button-id="ornamentA-picker" :items="ornamentItems" :value="state.relic.ornamentIds?.[0] || ''" placeholder="（不用）" search-placeholder="搜索位面饰品…" @pick="pickOrnament" />
          </div>
        </div>
        <label class="sp-check"><input id="speedBoots" type="checkbox" :checked="!!state.relic.speedBoots" @change="onSpeedBoots" /> 速度鞋（主词条 +25）</label>
        <div id="relic-warn"><p v-if="blockedSets.length" class="warnbar">⚠ {{ blockedNames }} 需要开大才生效：请把「开大次数」设成 1 或更大（目前是 0，所以没计入）。</p></div>
        <details id="sp-trigger-more" ref="triggerMore" class="sp-more">
          <summary>套装触发条件<span id="sum-trigger" class="sp-sum">{{ summaries.trigger }}</span></summary>
          <div class="sp-form-row">
            <NumField id="fourUlts" label="遗器开大次数" :value="form.fourUlts" min="0" step="1" @input="onFourUlts" />
            <NumField id="coneUlts" label="光锥开大次数" :value="form.coneUlts" min="0" step="1" @input="onConeUlts" />
          </div>
          <label class="sp-check"><input id="ultTargetsAlly" type="checkbox" :checked="!!state.relic.ultTargetsAlly" @change="onUltTargetsAlly" /> 开大目标是队友（信使 4 件套）</label>
          <p id="relic-note" class="hint">{{ relicNote }}</p>
          <p id="char-info" class="hint">{{ charInfo }}</p>
        </details>
      </div>
    </div>
    <CharacterDialog ref="characterDialog" :characters="characters" :selected="String(state.characterId)" @pick="pickCharacter" />
    <div id="custom-fields" class="sp-custom" :class="{ hidden: !isCustom }">
      <div class="sp-form-row">
        <div class="field"><label for="customName">名字</label><input id="customName" class="input" maxlength="20" :value="form.customName" @input="form.customName = ($event.target as HTMLInputElement).value; onCustomInput()" /></div>
        <div class="field"><label for="customBase">基础速度（1–1000）</label><input id="customBase" class="input narrow" type="number" min="1" max="1000" step="1" :value="form.customBase" @input="form.customBase = ($event.target as HTMLInputElement).value; onCustomInput()" /></div>
        <div class="field"><label for="customTrace">行迹速度（0–200）</label><input id="customTrace" class="input narrow" type="number" min="0" max="200" step="1" :value="form.customTrace" @input="form.customTrace = ($event.target as HTMLInputElement).value; onCustomInput()" /></div>
      </div>
      <p class="hint">自定义角色没有自带的速度效果；光锥不限命途。</p>
    </div>
  </section>
</template>
