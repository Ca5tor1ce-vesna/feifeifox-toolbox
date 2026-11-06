<script setup lang="ts">
/* 配速查询 · 角色卡：立绘、星魂、光锥、遗器、触发条件、自定义角色。
 * 「角色与遗器」里有这个角色时，遗器那几项按实际装配算，收成一行（use-roster-link.ts）。 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import CharacterDialog from "./CharacterDialog.vue";
import NumField from "./NumField.vue";
import LightconePicker from "../../ui-shared/src/hsr/LightconePicker.vue";
import RelicSetPicker from "../../ui-shared/src/hsr/RelicSetPicker.vue";
import SelectField from "./SelectField.vue";
import { fix } from "./motion.ts";
import { useSpeedPage } from "./page.ts";

const { collapsedSteps, toggleStep, summaries, charBody, openCharacters, splash, splashSrc, splashBroken, onSplashLoad, state, enhanceableIds, numberOptions, onEidolon, onEnhanced, splashMeta, currentCharacter, charSpeed, charTrace, cones, coneNote, pickCone, onSuperimpose, fourPieceItems, fourPieceSets, pickFourPiece, ornamentItems, ornamentSets, describeSet, pickOrnament, onSpeedBoots, blockedSets, blockedNames, triggerMore, form, onFourUlts, onConeUlts, onUltTargetsAlly, relicNote, charInfo, characterDialog, characters, pickCharacter, isCustom, onCustomInput, markSplashBroken, currentCone, rosterLinked, rosterHas, rosterError, rosterMissing, rosterManual, rosterBack, nameIn } = useSpeedPage();

/** 3.4 老角色加强：游戏里可以不强化。 */
const ENHANCE_OPTIONS = [{ value: "on", label: "已强化" }, { value: "off", label: "原版" }];

/** 用不上「角色与遗器」实际装配时，告诉用户为什么还要手填。 */
const ROSTER_MISSING: Record<string, string> = {
  empty: "导入角色和遗器后，这里会自动按实际装配算，不用手填。",
  character: "「角色与遗器」里还没有这个角色，下面先按手填算。",
  relics: "「角色与遗器」里这个角色还没穿遗器，下面先按手填算。",
};

/** 点光锥图打开下面的光锥选择。 */
function openCones(event: Event): void {
  (event.currentTarget as HTMLElement).closest(".sp-char-panel")?.querySelector<HTMLButtonElement>("#lightcone-picker")?.click();
}
/** 收起时那一行：实际穿的套装、鞋和副词条速度。 */
function linkedRelics(): string {
  const relic = state.relic;
  return [
    relic.fourPieceId ? `4 件套 ${nameIn(fourPieceItems, relic.fourPieceId)}` : "没凑满 4 件套",
    relic.ornamentIds?.[0] ? `饰品 ${nameIn(ornamentItems, relic.ornamentIds[0])}` : "没凑满饰品",
    relic.speedBoots ? "速度鞋" : "不是速度鞋",
    `副词条速度 ${fix(relic.substatSpeed || 0, 1)}`,
  ].join(" · ");
}
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
        <SelectField v-if="enhanceableIds.has(String(state.characterId))" id="enhanced" label="角色强化" extra="sp-soul" :value="state.enhanced === false ? 'off' : 'on'" :options="ENHANCE_OPTIONS" @change="onEnhanced" />
        <div id="splash-meta" ref="splashMeta" class="sp-splash-meta">
          <h2 class="sp-char-title">{{ currentCharacter.name || "选个角色" }}</h2>
          <div class="sp-char-path">{{ currentCharacter.pathName || "" }}<template v-if="currentCharacter.elementName"> · {{ currentCharacter.elementName }}</template></div>
          <div class="sp-char-speed">初始速度 {{ fix(charSpeed, 0) }}<template v-if="charTrace">（基础 {{ fix(currentCharacter.baseSpeed, 0) }} + 行迹 {{ fix(charTrace, 0) }}）</template></div>
          <button type="button" class="sp-cone-chip" :class="{ empty: !currentCone }" :title="currentCone ? '点图换光锥' : '选光锥'" @click="openCones">
            <span class="sp-cone-pic" :class="currentCone ? `r${currentCone.rarity}` : ''"><img v-if="currentCone?.art" :src="currentCone.art" alt="" loading="lazy" /><span v-else aria-hidden="true">＋</span></span>
            <span class="sp-cone-text"><b>{{ currentCone ? currentCone.name : "没装备光锥" }}</b><small v-if="currentCone">叠影 {{ state.superimpose }}</small></span>
          </button>
        </div>
        <div class="sp-split"></div>
        <div class="sp-form-row">
          <div class="field sp-grow">
            <label>光锥（只显示同命途）</label>
            <LightconePicker button-id="lightcone-picker" button-class="sp-control" :cones="cones" :note="coneNote" :value="state.lightconeId || ''" @pick="pickCone" />
          </div>
          <SelectField id="superimpose" label="叠影" extra="sp-tiny" :value="String(state.superimpose)" :options="numberOptions([1, 2, 3, 4, 5])" @change="onSuperimpose" />
        </div>
        <div class="sp-split"></div>
        <h3 class="sp-cfg-heading">遗器</h3>
        <div v-if="rosterLinked" id="roster-linked" class="sp-roster-link">
          <p><b>按「角色与遗器」里的实际装配</b>：面板速度 {{ fix(rosterLinked.panelSpeed, 1) }}</p>
          <p class="hint">{{ linkedRelics() }}</p>
          <p v-for="(note, index) in rosterLinked.notes" :key="index" class="hint">{{ note }}</p>
          <button id="roster-manual" type="button" class="sp-link" @click="rosterManual">手动改</button>
        </div>
        <template v-else>
        <p v-if="rosterMissing" id="roster-missing" class="hint sp-roster-missing">
          {{ ROSTER_MISSING[rosterMissing] }}<a href="#/honkai-star-rail/roster">去「角色与遗器」</a>
        </p>
        <div class="sp-form-row">
          <div class="field sp-grow">
            <label>遗器 4 件套</label>
            <RelicSetPicker button-id="fourPiece-picker" button-class="sp-control" kind="four" :sets="fourPieceSets" :describe="describeSet" :value="state.relic.fourPieceId || ''" @pick="pickFourPiece" />
          </div>
          <div class="field sp-grow">
            <label>位面饰品</label>
            <RelicSetPicker button-id="ornamentA-picker" button-class="sp-control" kind="ornament" :sets="ornamentSets" :describe="describeSet" :value="state.relic.ornamentIds?.[0] || ''" @pick="pickOrnament" />
          </div>
        </div>
        <label class="sp-check"><input id="speedBoots" type="checkbox" :checked="!!state.relic.speedBoots" @change="onSpeedBoots" /> 速度鞋（主词条 +25）</label>
        <p v-if="rosterHas" class="hint sp-roster-back"><button id="fill-from-roster" type="button" class="sp-link" @click="rosterBack">改回「角色与遗器」里的实际装配</button></p>
        </template>
        <p v-if="rosterError" class="error-text">{{ rosterError }}</p>
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
