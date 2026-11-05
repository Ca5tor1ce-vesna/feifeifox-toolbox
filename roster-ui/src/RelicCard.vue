<script setup lang="ts">
/* 一件遗器：名字、等级、主词条、副词条（带强化次数）。按钮由外面传进来（插槽）。 */
import { computed } from "vue";
import { propertyName, propertyValue, SLOT_NAMES } from "../../ui-shared/src/stats/labels.ts";
import { relicStats } from "../../ui-shared/src/stats/relic.ts";
import type { RelicPiece, StatData } from "../../ui-shared/src/stats/types.ts";
import type { Catalog } from "./use-roster.ts";

const props = defineProps<{ relic: RelicPiece; data: StatData; catalog: Catalog; owner?: string | null }>();

const view = computed(() => {
  const piece = props.data.pieces.get(props.relic.pieceId);
  try {
    const { main, subs } = relicStats(props.relic, props.data);
    return {
      name: piece?.name || `遗器 ${props.relic.pieceId}`,
      set: props.catalog.relicSets.get(piece?.setId ?? "")?.name ?? "",
      icon: props.catalog.relicSets.get(piece?.setId ?? "")?.icon,
      slot: piece ? SLOT_NAMES[piece.slot] : "",
      rarity: piece?.rarity ?? 5,
      main: { name: propertyName(main.type), value: propertyValue(main.type, main.value) },
      subs: subs.map((sub, i) => ({ name: propertyName(sub.type), value: propertyValue(sub.type, sub.value), rolls: props.relic.subAffixes[i].count - 1 })),
      error: "",
    };
  } catch (e) {
    return { name: piece?.name || props.relic.pieceId, set: "", icon: undefined, slot: "", rarity: 5, main: null, subs: [], error: (e as Error).message };
  }
});
</script>

<template>
  <article class="rs-relic" :class="`r${view.rarity}`">
    <header class="rs-relic-head">
      <span class="rs-relic-icon"><img v-if="view.icon" :src="view.icon" alt="" loading="lazy" /></span>
      <div class="rs-relic-title">
        <strong>{{ view.name }}</strong>
        <span class="muted small">{{ view.slot }} · +{{ relic.level }}<template v-if="owner"> · {{ owner }}</template></span>
      </div>
    </header>
    <p v-if="view.error" class="error-text small">{{ view.error }}</p>
    <template v-else-if="view.main">
      <div class="rs-relic-main"><span>{{ view.main.name }}</span><b>{{ view.main.value }}</b></div>
      <ul class="rs-relic-subs">
        <li v-for="(sub, i) in view.subs" :key="i"><span>{{ sub.name }}<em v-if="sub.rolls">»{{ sub.rolls }}</em></span><b>{{ sub.value }}</b></li>
      </ul>
    </template>
    <footer v-if="$slots.default"><slot /></footer>
  </article>
</template>
