<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import AxisFace from "./AxisFace.vue";
import type { Head } from "./AxisHead.vue";
import type { UltClip } from "./ult-clips.ts";
import CardDetail, { type Holder } from "./CardDetail.vue";
import { buildCards, cardMatches, groupMoments, ROW_FILTERS, type AxisCard, type AxisMoment, type AxisView, type Row, type RowFilter } from "./model.ts";
import { prefersReducedMotion } from "./motion.ts";
import TimelineCard from "./TimelineCard.vue";

const props = defineProps<{ view: AxisView; icons: Record<number, string>; splashes: Record<number, string>; heads: Record<number, Head>; clips: Record<number, UltClip>; manualIds: Set<number>; holders: Holder[]; ids: string[]; activeKey: string | null; revealKey: number }>();
const emit = defineEmits<{ override: [row: Row]; retarget: [row: Row, slot: number]; toggleUltimate: [row: Row]; toggleHold: [row: Row, holder: string]; select: [key: string] }>();
const names = computed(() => props.view.units.map((unit) => unit.name));

const reduced = prefersReducedMotion();

const filter = defineModel<RowFilter>("filter", { required: true });
const slotFilter = ref<number | null>(null);
const collapsed = ref(new Set<number>());

// 机制按队伍出现：没有欢愉角色时不显示阿哈时刻、欢愉技，筛到一半换了队伍就退回全部。
const filters = computed(() => ROW_FILTERS.filter((item) => !item.elationOnly || props.view.elation));
watch(filters, (list) => { if (!list.some((item) => item.id === filter.value)) filter.value = "all"; });
watch(() => props.view.units.length, () => { slotFilter.value = null; });

// ---- 卡片和时刻 ---- //
// 同一时刻的追击、欢愉技并进一张卡；同一 AV 的卡排在一个时刻里，只标一次时间。
const cards = computed(() => buildCards(props.view.rows));
const cycles = computed(() => {
  const list: { t: number; end: number; moments: AxisMoment[]; count: number }[] = [];
  for (const moment of groupMoments(cards.value)) {
    const last = list[list.length - 1];
    if (last && last.t === moment.t) {
      last.moments.push(moment);
      last.count += moment.cards.length;
    } else {
      list.push({ t: moment.t, end: props.view.firstCycleAV + moment.t * props.view.cycleAV, moments: [moment], count: moment.cards.length });
    }
  }
  return list;
});
const moments = computed(() => cycles.value.flatMap((cycle) => cycle.moments));
// 筛选不藏卡，只把不符合的调淡：前后顺序还看得见。
const matched = computed(() => new Set(cards.value.filter((card) => cardMatches(card, filter.value, slotFilter.value)).map((card) => card.key)));
const activeCard = computed(() => cards.value.find((card) => card.key === props.activeKey) ?? null);
const momentKind = (moment: AxisMoment): string => {
  if (moment.cards.some((card) => card.kind === "ult")) return "is-ult";
  if (moment.cards.some((card) => card.kind === "aha")) return "is-aha";
  return "";
};

const toggleCycle = (t: number): void => {
  const next = new Set(collapsed.value);
  if (!next.delete(t)) next.add(t);
  collapsed.value = next;
};

// ---- 详情放哪 ---- //
// 栏够宽时详情固定在轴右边；窄了（手机、窄窗口）就展开在点的那张卡下面。
const root = ref<HTMLElement | null>(null);
const wide = ref(true);
let sizeObserver: ResizeObserver | null = null;
onMounted(() => {
  if (!root.value || typeof ResizeObserver === "undefined") return;
  sizeObserver = new ResizeObserver(([entry]) => { wide.value = entry.contentRect.width >= 640; });
  sizeObserver.observe(root.value);
});

// ---- 大招演出 ---- //
// 立绘从右边冲进卡片、金色光带扫过、名字弹一下。点开大招卡、调配置多开了一次大时演；出轴时跟着卡片浮现演。
const casting = ref(new Set<string>());
const castTimers = new Map<string, number>();
const cast = (key: string): void => {
  if (reduced) return;
  clearTimeout(castTimers.get(key));
  const off = new Set(casting.value);
  off.delete(key);
  casting.value = off;
  // 先摘掉再挂上，同一张卡连点也能重演。
  requestAnimationFrame(() => {
    casting.value = new Set(casting.value).add(key);
    castTimers.set(key, window.setTimeout(() => {
      const next = new Set(casting.value);
      next.delete(key);
      casting.value = next;
    }, 1200));
  });
};
const select = (card: AxisCard): void => {
  emit("select", card.key);
  if (card.kind === "ult" && props.activeKey !== card.key) cast(card.key);
};
// 调整配置后谁多开了一次大，那张卡演一下，告诉用户这次调整换来了什么。换人时有出轴动画，不另外演。
watch(() => props.view, (next, previous) => {
  if (!previous || revealing.value) return;
  if (next.units.map((unit) => unit.id).join() !== previous.units.map((unit) => unit.id).join()) return;
  const before = new Set(previous.rows.filter((row) => row.type === "ultimate").map((row) => row.key));
  for (const unit of next.units) {
    const old = previous.units.find((item) => item.slot === unit.slot);
    if (!old || unit.ultimates <= old.ultimates) continue;
    // 行的键是「这条轨道的第几个动作」，多一次大招后后面的键会顺延，所以只在多开了大的角色里找新出现的那张。
    const ults = next.rows.filter((row) => row.type === "ultimate" && row.slot === unit.slot);
    const fresh = ults.filter((row) => !before.has(row.key));
    for (const row of fresh.length ? fresh : ults.slice(-1)) cast(row.key);
  }
});

// ---- 出轴：时刻按时间依次浮现 ---- //
// 换人、读队伍时要快：每个时刻晚 32 毫秒，最多排 36 个，后面的同时出现，整段一秒多。
const PACE = { step: 32, cap: 36 };
const revealing = ref(false);
let revealTimer = 0;
const finish = (): void => {
  clearTimeout(revealTimer);
  revealing.value = false;
};
// revealKey 为 0 是刚打开页面、恢复上次的队伍：不播。列表在空队伍时不存在，第一次出轴挂上来时已经是 1。
watch(() => props.revealKey, (key) => {
  if (key === 0) return;
  clearTimeout(revealTimer);
  if (reduced) {
    finish();
    return;
  }
  revealing.value = true;
  // 最后一个时刻浮现完，还要等它的大招演完。
  revealTimer = window.setTimeout(finish, PACE.step * Math.min(moments.value.length, PACE.cap) + 900);
}, { immediate: true });
onBeforeUnmount(() => {
  clearTimeout(revealTimer);
  for (const timer of castTimers.values()) clearTimeout(timer);
  sizeObserver?.disconnect();
});
const order = computed(() => new Map(moments.value.map((moment, index) => [moment.key, Math.min(index, PACE.cap) * PACE.step])));
const revealStyle = (moment: AxisMoment) => (revealing.value ? { "--axis-delay": `${order.value.get(moment.key) ?? 0}ms` } : undefined);
</script>

<template>
  <div ref="root" class="axis-timeline" :class="{ 'is-wide': wide }">
    <div class="axis-filters" role="group" aria-label="筛选行动轴">
      <button v-for="item in filters" :key="item.id" class="axis-chip" :class="{ 'is-on': filter === item.id }" type="button" :title="item.title" :aria-pressed="filter === item.id" @click="filter = item.id">{{ item.label }}</button>
      <template v-if="view.units.length > 1">
        <span class="axis-filter-gap" aria-hidden="true"></span>
        <button
          v-for="unit in view.units"
          :key="unit.id"
          class="axis-chip-face"
          :class="{ 'is-on': slotFilter === unit.slot }"
          type="button"
          :title="`只看${unit.name}（点开卡片能看到逐次回能）`"
          :aria-pressed="slotFilter === unit.slot"
          @click="slotFilter = slotFilter === unit.slot ? null : unit.slot"
        ><AxisFace :src="icons[unit.slot]" :name="unit.name" /></button>
      </template>
    </div>

    <div class="axis-timeline-body">
      <div class="axis-strip">
        <section v-for="cycle in cycles" :key="cycle.t" class="axis-cycle">
          <button class="axis-cycle-banner" type="button" :aria-expanded="!collapsed.has(cycle.t)" @click="toggleCycle(cycle.t)">
            <span><b>第 {{ cycle.t + 1 }} 轮</b>（{{ cycle.t }}T）<small>{{ cycle.count }} 张</small></span>
            <span class="axis-cycle-end">到 {{ cycle.end }} AV<svg class="axis-cycle-caret" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></span>
          </button>
          <div class="axis-cycle-body" :class="{ 'is-collapsed': collapsed.has(cycle.t) }" :inert="collapsed.has(cycle.t)">
            <div class="axis-cycle-rows">
              <div
                v-for="moment in cycle.moments"
                :key="`${revealKey}-${moment.key}`"
                class="axis-moment"
                :class="[momentKind(moment), { 'is-revealing': revealing }]"
                :style="revealStyle(moment)"
                :data-av="moment.av"
              >
                <span class="axis-moment-av">{{ moment.av.toFixed(1) }}<small v-if="moment.cards.length > 1">同时 {{ moment.cards.length }}</small></span>
                <span class="axis-moment-node" aria-hidden="true"></span>
                <div class="axis-moment-cards">
                  <template v-for="card in moment.cards" :key="card.key">
                    <TimelineCard
                      :damage="view.damage?.rows ?? null"
                      :card="card"
                      :icons="icons"
                      :splashes="splashes"
                      :heads="heads"
                      :clips="clips"
                      :active="card.key === activeKey"
                      :class="{ 'is-active': card.key === activeKey, 'is-dim': !matched.has(card.key), 'is-casting': casting.has(card.key) }"
                      :aria-pressed="card.key === activeKey"
                      @click="select(card)"
                    />
                    <CardDetail v-if="!wide && card.key === activeKey" :key="card.key" :damage="view.damage?.rows ?? null" :card="card" :icons="icons" :splashes="splashes" :heads="heads" :manual-ids="manualIds" :holders="holders" :ids="ids" :names="names" @override="emit('override', $event)" @retarget="(row, slot) => emit('retarget', row, slot)" @toggle-ultimate="emit('toggleUltimate', $event)" @toggle-hold="(row, holder) => emit('toggleHold', row, holder)" />
                  </template>
                </div>
              </div>
            </div>
          </div>
        </section>
        <p class="axis-events-end">模拟到 {{ view.maxAV }} AV · {{ view.rows.length }} 条事件归成 {{ cards.length }} 张卡</p>
      </div>

      <aside v-if="wide" class="axis-detail-side" aria-live="polite">
        <CardDetail v-if="activeCard" :key="activeCard.key" :damage="view.damage?.rows ?? null" :card="activeCard" :icons="icons" :splashes="splashes" :heads="heads" :manual-ids="manualIds" :holders="holders" :ids="ids" :names="names" @override="emit('override', $event)" @retarget="(row, slot) => emit('retarget', row, slot)" @toggle-ultimate="emit('toggleUltimate', $event)" @toggle-hold="(row, holder) => emit('toggleHold', row, holder)" />
        <p v-else class="axis-detail-hint">点轴上的卡片，这里显示那一刻的细节：回能、资源、触发了什么，也能把这一动改成普攻或战技。</p>
      </aside>
    </div>
  </div>
</template>
