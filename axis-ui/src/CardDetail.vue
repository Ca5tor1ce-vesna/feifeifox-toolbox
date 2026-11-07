<script setup lang="ts">
import { computed } from "vue";
import AxisHead, { type Head } from "./AxisHead.vue";
import { formatDamage, type RowDamage } from "./damage.ts";
import { AHA_NAME, cardOverflows, overflowText, TYPE_NAMES, type AxisCard, type Row, type UltMark } from "./model.ts";

// 点开一张卡看到的细节：原来「显示详细」里的说明行、回能和资源都在这里，逐动改普攻/战技、开大也在这里。
const props = defineProps<{ damage: Record<string, RowDamage> | null; card: AxisCard; icons: Record<number, string>; splashes: Record<number, string>; heads: Record<number, Head>; manualIds: Set<number>; holders: Holder[]; ids: string[]; names: string[] }>();
const emit = defineEmits<{ override: [row: Row]; retarget: [row: Row, slot: number]; toggleUltimate: [row: Row]; toggleHold: [row: Row, holder: string] }>();

const main = computed(() => props.card.main);
const title = computed(() => {
  if (props.card.kind === "start") return "开战";
  if (props.card.kind === "aha") return "阿哈时刻";
  return main.value?.name ?? "";
});
const sections = computed(() => [
  { id: "main", title: "这一动", rows: main.value ? [main.value] : [] },
  { id: "follows", title: `同时带出 ${props.card.follows.length} 个`, rows: props.card.follows },
  { id: "notes", title: props.card.kind === "start" ? "秘技和进场效果" : "附带效果", rows: props.card.notes },
].filter((section) => section.rows.length > 0));
// 拉条溢出：行动条剩下的不够拉，多出的作废。开大带来的溢出可以靠留大吃满。
const overflows = computed(() => cardOverflows(props.card));

const faceOf = (row: Row): string => (row.slot === null ? "" : props.icons[row.slot] ?? "");
const headOf = (row: Row): Head | undefined => (row.slot === null ? undefined : props.heads[row.slot]);
const splashOf = (row: Row): string => (row.slot === null ? "" : props.splashes[row.slot] ?? "");
// 右边空白处衬一张这名角色的淡立绘，和配速查询顶部的速度卡一样。
const art = computed(() => (main.value ? splashOf(main.value) : ""));
const typeName = (row: Row): string => TYPE_NAMES[row.type] ?? "机制";
// 类型标签已经说过的就不再说一遍：「星期日 的战技」只留名字，「【阿哈时刻】触发」只留「触发」。
const shortLabel = (row: Row): string => {
  if (row.label === `${row.name} 的${TYPE_NAMES[row.type]}`) return row.name;
  return (row.name === AHA_NAME && row.label.replace(AHA_NAME, "").trim()) || row.label;
};
const chipsOf = (row: Row): string[] => [
  ...(row.energy !== null ? [`${row.energyName} ${row.energy.toFixed(0)}`] : []),
  ...(row.resources ? [row.resources] : []),
];
const swapLabel = (row: Row): string => (row.type === "skill" ? "改普攻" : "改战技");
const canSwap = (row: Row): boolean => row.action !== undefined && row.type !== "enhanced_basic";
// 这一动的技能选了队友（令使、星期日战技这类）：可以逐动改给别的队友，和改普攻/战技一样只管这一动。
const retargetButtons = (row: Row): { slot: number; text: string }[] => {
  if (row.action === undefined || row.target === undefined || row.slot === null) return [];
  return props.names.flatMap((name, slot) => (slot === row.slot || slot === row.target ? [] : [{ slot, text: `第 ${row.action} 动改给 ${name}` }]));
};
const canUltimate = (row: Row): boolean => row.action !== undefined && row.slot !== null && props.manualIds.has(row.slot);
// 留大的人：任何人的这一动都能设成开大点（自己的或队友的）。
const holdButtons = (row: Row): { id: string; text: string; on: boolean }[] => {
  if (row.action === undefined || row.slot === null) return [];
  const owner = props.ids[row.slot];
  return props.holders.map((holder) => {
    const on = holder.marks.some((mark) => mark.id === owner && mark.action === row.action);
    return { id: holder.id, text: on ? `取消 ${holder.name} 的开大点` : `${holder.name} 在这之后开大`, on };
  });
};
</script>

<script lang="ts">
/** 正在留大的角色和他已经设的开大点。 */
export interface Holder {
  id: string;
  name: string;
  marks: UltMark[];
}
</script>

<template>
  <div class="axis-detail" :class="`is-${card.kind}`">
    <img v-if="art" class="axis-detail-art" :src="art" alt="" />
    <header class="axis-detail-head">
      <span v-if="card.kind === 'aha'" class="axis-face axis-face-aha" aria-hidden="true"></span>
      <AxisHead v-else-if="main" :head="headOf(main)" :icon="faceOf(main)" :name="main.name" />
      <div>
        <strong>{{ title }}</strong>
        <span>{{ card.av.toFixed(1) }} AV · 第 {{ card.t + 1 }} 轮<template v-if="main"> · {{ typeName(main) }}</template></span>
      </div>
    </header>

    <section v-if="overflows.length" class="axis-detail-section axis-detail-overflow">
      <h4>拉条溢出</h4>
      <ul>
        <li v-for="(item, index) in overflows" :key="index">{{ overflowText(item) }}</li>
        <li v-if="card.kind === 'ult'">想吃满可以留大，等被拉的人行动完再开</li>
      </ul>
    </section>

    <section v-for="section in sections" :key="section.id" class="axis-detail-section">
      <h4>{{ section.title }}</h4>
      <div v-for="row in section.rows" :key="row.key" class="axis-detail-row">
        <div class="axis-detail-top">
          <span v-if="row.name === AHA_NAME" class="axis-face axis-face-aha" aria-hidden="true"></span>
          <AxisHead v-else-if="row.slot !== null" :head="headOf(row)" :icon="faceOf(row)" :name="row.name" />
          <b>{{ shortLabel(row) }}</b>
          <span class="axis-detail-type">{{ typeName(row) }}</span>
          <span v-if="row.extra" class="axis-card-tag">额外</span>
        </div>
        <ul v-if="row.details.length">
          <li v-for="text in row.details" :key="text">{{ text }}</li>
        </ul>
        <div v-if="damage?.[row.key]" class="axis-detail-damage">
          <b>伤害 {{ formatDamage(damage[row.key].expected) }}</b>
          <span v-for="zone in damage[row.key].zones" :key="zone.zone">{{ zone.zone }} ×{{ zone.factor.toFixed(2) }}</span>
        </div>
        <div v-if="chipsOf(row).length" class="axis-detail-chips">
          <span v-for="chip in chipsOf(row)" :key="chip">{{ chip }}</span>
        </div>
        <div v-if="canSwap(row) || retargetButtons(row).length || canUltimate(row) || holdButtons(row).length" class="axis-detail-actions">
          <button v-if="canSwap(row)" class="ghost small" type="button" :title="`第 ${row.action} 动${swapLabel(row)}`" @click="emit('override', row)">第 {{ row.action }} 动{{ swapLabel(row) }}</button>
          <button v-for="button in retargetButtons(row)" :key="`target-${button.slot}`" class="ghost small" type="button" :title="`${button.text}（只改这一动）`" @click="emit('retarget', row, button.slot)">{{ button.text }}</button>
          <button v-if="canUltimate(row)" class="ghost small" type="button" :title="`第 ${row.action} 动后开大或取消`" @click="emit('toggleUltimate', row)">第 {{ row.action }} 动后开大 / 取消</button>
          <button
            v-for="button in holdButtons(row)"
            :key="button.id"
            class="ghost small"
            :class="{ 'is-on': button.on }"
            type="button"
            :aria-pressed="button.on"
            @click="emit('toggleHold', row, button.id)"
          >{{ button.text }}</button>
        </div>
      </div>
    </section>
  </div>
</template>
