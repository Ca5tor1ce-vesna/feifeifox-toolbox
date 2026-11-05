<script setup lang="ts">
/* 角色面板：照游戏的样子，每项「白值 + 加成」和总值；点一项展开看加成来自哪里。 */
import { computed, ref } from "vue";
import { ELEMENT_STAT, PANEL_ORDER, STAT_NAMES } from "../../ui-shared/src/stats/labels.ts";
import { displayStat, type Panel } from "../../ui-shared/src/stats/panel.ts";
import type { StatKey } from "../../ui-shared/src/stats/types.ts";

const props = defineProps<{ panel: Panel; element: string; shown?: Partial<Record<StatKey, number>> | null }>();
const open = ref<StatKey | null>(null);
const SCALED = new Set<StatKey>(["hp", "atk", "def", "spd"]);

const rows = computed(() => {
  const keys = [...PANEL_ORDER];
  const elementKey = ELEMENT_STAT[props.element];
  if (elementKey) keys.splice(6, 0, elementKey);
  return keys.map((key) => {
    const line = props.panel[key];
    const shown = props.shown?.[key];
    const shownText = shown === undefined ? null : SCALED.has(key) ? String(shown) : `${(shown * 100).toFixed(1)}%`;
    const total = displayStat(key, line.total);
    return {
      key, name: STAT_NAMES[key], total,
      base: SCALED.has(key) ? displayStat(key, line.base) : null,
      bonus: SCALED.has(key) ? Math.floor(line.total + 1e-9) - Math.floor(line.base + 1e-9) : null,
      sources: line.sources,
      shownText, mismatch: shownText !== null && shownText !== total,
    };
  });
});
const sourceValue = (key: StatKey, value: number): string => (SCALED.has(key) ? `+${(Math.round(value * 10) / 10).toString()}` : `+${(value * 100).toFixed(1)}%`);
</script>

<template>
  <div class="rs-panel">
    <button
      v-for="row in rows" :key="row.key" type="button" class="rs-stat" :class="{ open: open === row.key, bad: row.mismatch }"
      :aria-expanded="open === row.key" @click="open = open === row.key ? null : row.key"
    >
      <span class="rs-stat-name">{{ row.name }}</span>
      <span v-if="row.base !== null" class="rs-stat-base">{{ row.base }}<em v-if="row.bonus">+{{ row.bonus }}</em></span>
      <strong class="rs-stat-total">{{ row.total }}</strong>
      <span v-if="row.shownText !== null" class="rs-stat-shown" :title="row.mismatch ? '和图上不一样' : '和图上一样'">图上 {{ row.shownText }}</span>
      <span v-if="open === row.key" class="rs-stat-sources">
        <span v-if="!row.sources.length" class="muted">没有加成</span>
        <span v-for="(source, i) in row.sources" :key="i">{{ source.label }} <b>{{ sourceValue(row.key, source.value) }}</b></span>
      </span>
    </button>
  </div>
</template>
