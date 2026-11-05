<script setup lang="ts">
/* 导入前的确认：
 * - 扫描文件：整库替换，先看「新增 / 消失 / 改动」各多少件；
 * - 战绩分享图：每张图认出的角色和遗器，算出的面板和图上的并排比，对不上的标红，估计的项列出来；勾选的才导入。 */
import { computed } from "vue";
import type { CardResult } from "../../ui-shared/src/import/record-card/recognize.ts";
import { computePanel, displayStat } from "../../ui-shared/src/stats/panel.ts";
import type { StatData, StatKey } from "../../ui-shared/src/stats/types.ts";
import PanelView from "./PanelView.vue";
import type { Review } from "./review.ts";
import type { Catalog } from "./use-roster.ts";

const props = defineProps<{ review: Review; data: StatData; catalog: Catalog; busy: boolean }>();
const emit = defineEmits<{ confirm: []; cancel: [] }>();

const SCALED = new Set<StatKey>(["hp", "atk", "def", "spd"]);
function mismatches(result: CardResult): number {
  const panel = computePanel(result.character, result.relics, props.data);
  return (Object.entries(result.shownPanel) as [StatKey, number][]).filter(([stat, shown]) =>
    displayStat(stat, panel[stat].total) !== (SCALED.has(stat) ? String(shown) : `${(shown * 100).toFixed(1)}%`)).length;
}
const cards = computed(() => (props.review.kind === "cards" ? props.review.items : []));
const working = computed(() => cards.value.some((item) => item.status === "waiting" || item.status === "working"));
const chosen = computed(() => cards.value.filter((item) => item.include && item.result).length);
const name = (id: string) => props.catalog.characters.get(id)?.name ?? id;
const coneName = (id: string) => props.catalog.lightcones.get(id)?.name ?? id;
</script>

<template>
  <div class="rs-modal" role="dialog" aria-modal="true">
    <div class="rs-modal-box rs-review">
      <template v-if="review.kind === 'file'">
        <h3>导入扫描文件</h3>
        <p>文件里有 {{ review.characters }} 名角色、{{ review.relics }} 件遗器。导入会<strong>替换</strong>现在的整个遗器库：</p>
        <div class="stat-grid rs-diff">
          <div class="stat"><div class="k">新增</div><div class="v">{{ review.diff.added }}</div></div>
          <div class="stat"><div class="k">消失</div><div class="v">{{ review.diff.removed }}</div></div>
          <div class="stat"><div class="k">改动</div><div class="v">{{ review.diff.changed }}</div></div>
        </div>
        <p v-if="!review.diff.added && !review.diff.removed && !review.diff.changed" class="muted">和现在的遗器库一样，没有变化。</p>
        <ul v-if="review.skipped.length" class="rs-notes"><li v-for="(line, i) in review.skipped" :key="i">{{ line }}</li></ul>
      </template>

      <template v-else>
        <h3>识图导入（{{ cards.length }} 张）</h3>
        <p class="muted small">图片只在你的设备上识别，不会上传。每张图算出的面板会和图上的对比，红色是对不上的项，黄色是估计的项；确认无误再导入。</p>
        <div class="rs-cards">
          <article v-for="(item, i) in cards" :key="i" class="rs-card-item" :class="item.status">
            <header>
              <label v-if="item.result" class="check"><input v-model="item.include" type="checkbox" /> 导入</label>
              <strong>{{ item.result ? name(item.result.character.id) : item.name }}</strong>
              <span v-if="item.status === 'waiting'" class="muted small">等待中</span>
              <span v-else-if="item.status === 'working'" class="muted small">识别中 {{ Math.round(item.progress * 100) }}%</span>
            </header>
            <p v-if="item.error" class="error-text small">{{ item.error }}</p>
            <template v-if="item.result">
              <p class="small">
                Lv.{{ item.result.character.level }} · {{ item.result.character.eidolon }} 魂 ·
                {{ item.result.character.lightcone ? `${coneName(item.result.character.lightcone.id)}（${item.result.character.lightcone.level} 级 · 叠影 ${item.result.character.lightcone.superimpose}）` : "没穿光锥" }} ·
                遗器 {{ item.result.relics.length }} 件 · 属性行迹 {{ item.result.character.traces.length }} 个
              </p>
              <p :class="mismatches(item.result) ? 'error-text small' : 'muted small'">
                {{ mismatches(item.result) ? `面板有 ${mismatches(item.result)} 项和图上对不上，可能有词条认错了，导入后请在遗器库里核对。` : "算出的面板和图上一致。" }}
              </p>
              <ul v-if="item.result.uncertain.length" class="rs-notes warn"><li v-for="(line, k) in item.result.uncertain" :key="k">{{ line }}</li></ul>
              <details>
                <summary>看面板对比</summary>
                <PanelView
                  :panel="computePanel(item.result.character, item.result.relics, data)"
                  :element="data.characters.get(item.result.character.id)?.element ?? ''" :shown="item.result.shownPanel"
                />
              </details>
            </template>
          </article>
        </div>
      </template>

      <div class="rs-modal-actions">
        <button type="button" class="btn secondary" @click="emit('cancel')">放弃</button>
        <button
          type="button" class="btn" :disabled="busy || working || (review.kind === 'cards' && !chosen)"
          @click="emit('confirm')"
        >{{ review.kind === "file" ? "替换遗器库" : working ? "识别中…" : `导入 ${chosen} 个角色` }}</button>
      </div>
    </div>
  </div>
</template>
