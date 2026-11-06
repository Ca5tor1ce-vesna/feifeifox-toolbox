<script setup lang="ts">
/* 遗器库：按部位、套装、主词条、含某副词条筛选，按速度或等级排序；给角色穿上、修改、删除、手动新增。 */
import { computed, reactive, ref } from "vue";
import { propertyName, SLOT_NAMES, SLOTS } from "../../ui-shared/src/stats/labels.ts";
import { relicStats } from "../../ui-shared/src/stats/relic.ts";
import type { RelicPiece, StatData } from "../../ui-shared/src/stats/types.ts";
import RelicCard from "./RelicCard.vue";
import RelicEditor from "./RelicEditor.vue";
import type { Catalog, Roster } from "./use-roster.ts";

const props = defineProps<{ roster: Roster; data: StatData; catalog: Catalog }>();
const r = props.roster;
const filter = reactive({ slot: "", set: "", main: "", sub: "", owner: "", sort: "speed" });
const editing = ref<RelicPiece | null | "new">(null);
const limit = ref(60);

const stats = (relic: RelicPiece) => {
  try { return relicStats(relic, props.data); } catch { return null; }
};
const speedOf = (relic: RelicPiece): number => {
  const s = stats(relic);
  return s ? [s.main, ...s.subs].filter((p) => p.type === "SpeedDelta").reduce((sum, p) => sum + p.value, 0) : 0;
};
const owners = computed(() => r.characters.value.map((c) => ({ id: c.id, name: props.catalog.characters.get(c.id)?.name ?? c.id })));
const sets = computed(() => [...new Set(r.roster.value.relics.map((x) => props.data.pieces.get(x.pieceId)?.setId ?? ""))].filter(Boolean)
  .map((id) => ({ id, name: props.catalog.relicSets.get(id)?.name ?? id })).sort((a, b) => a.name.localeCompare(b.name, "zh")));
const typeNames = (pick: (s: NonNullable<ReturnType<typeof stats>>) => string[]) => [...new Set(r.roster.value.relics.flatMap((x) => { const s = stats(x); return s ? pick(s) : []; }))].map((t) => ({ type: t, name: propertyName(t) }));
const mainTypes = computed(() => typeNames((s) => [s.main.type]));
const subTypes = computed(() => typeNames((s) => s.subs.map((p) => p.type)));

const list = computed(() => {
  const rows = r.roster.value.relics.filter((relic) => {
    const piece = props.data.pieces.get(relic.pieceId);
    const s = stats(relic);
    if (filter.slot && piece?.slot !== filter.slot) return false;
    if (filter.set && piece?.setId !== filter.set) return false;
    if (filter.main && s?.main.type !== filter.main) return false;
    if (filter.sub && !s?.subs.some((p) => p.type === filter.sub)) return false;
    if (filter.owner === "none" && relic.equippedBy) return false;
    if (filter.owner && filter.owner !== "none" && relic.equippedBy !== filter.owner) return false;
    return true;
  });
  return filter.sort === "speed" ? rows.sort((a, b) => speedOf(b) - speedOf(a)) : rows.sort((a, b) => b.level - a.level);
});
const ownerName = (id: string | null): string | null => (id ? props.catalog.characters.get(id)?.name ?? id : null);

async function save(relic: Partial<RelicPiece>): Promise<void> {
  await r.saveRelic(relic);
  if (!r.error.value) editing.value = null;
}
/**
 * 用外壳自己画的确认框（GT_DIALOG），不用 window.confirm：
 * B站 Toy 的 iframe 不让弹浏览器自带的框，confirm 直接返回 false，看起来就是删不掉（2026-11-06 反馈）。
 */
async function remove(relic: RelicPiece): Promise<void> {
  if (await window.GT_DIALOG("删除这件遗器？删了只能重新导入或手动再加。", true)) await r.deleteRelic(relic.id);
}
</script>

<template>
  <div class="rs-library">
    <div class="card rs-filters">
      <select v-model="filter.slot" class="input" aria-label="部位"><option value="">全部部位</option><option v-for="s in SLOTS" :key="s" :value="s">{{ SLOT_NAMES[s] }}</option></select>
      <select v-model="filter.set" class="input" aria-label="套装"><option value="">全部套装</option><option v-for="s in sets" :key="s.id" :value="s.id">{{ s.name }}</option></select>
      <select v-model="filter.main" class="input" aria-label="主词条"><option value="">任意主词条</option><option v-for="t in mainTypes" :key="t.type" :value="t.type">{{ t.name }}</option></select>
      <select v-model="filter.sub" class="input" aria-label="副词条"><option value="">任意副词条</option><option v-for="t in subTypes" :key="t.type" :value="t.type">含{{ t.name }}</option></select>
      <select v-model="filter.owner" class="input" aria-label="穿戴"><option value="">谁穿都行</option><option value="none">没穿的</option><option v-for="o in owners" :key="o.id" :value="o.id">{{ o.name }}穿着的</option></select>
      <select v-model="filter.sort" class="input" aria-label="排序"><option value="speed">按速度排</option><option value="level">按等级排</option></select>
      <button type="button" class="btn" @click="editing = 'new'">手动新增</button>
    </div>
    <p class="muted small">共 {{ r.roster.value.relics.length }} 件，符合条件 {{ list.length }} 件。</p>
    <div class="rs-relic-grid">
      <RelicCard v-for="relic in list.slice(0, limit)" :key="relic.id" :relic="relic" :data="data" :catalog="catalog" :owner="ownerName(relic.equippedBy)">
        <select class="input small" :value="relic.equippedBy ?? ''" aria-label="穿在谁身上" @change="r.equip(relic.id, ($event.target as HTMLSelectElement).value || null)">
          <option value="">没穿</option><option v-for="o in owners" :key="o.id" :value="o.id">{{ o.name }}</option>
        </select>
        <button type="button" class="ghost small" @click="editing = relic">改</button>
        <button type="button" class="ghost small" @click="remove(relic)">删</button>
      </RelicCard>
    </div>
    <button v-if="list.length > limit" type="button" class="btn secondary rs-more" @click="limit += 60">再显示 60 件</button>
    <RelicEditor
      v-if="editing" :relic="editing === 'new' ? null : editing" :data="data" :catalog="catalog" :owners="owners"
      @save="save" @cancel="editing = null"
    />
  </div>
</template>
