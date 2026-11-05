<script setup lang="ts">
import { computed } from "vue";
import { hasKit } from "../../axis-engine/src/characters/index.ts";
import AxisSwitch from "./AxisSwitch.vue";
import type { ElationSettings, PageMember } from "./model.ts";

const props = defineProps<{ settings: ElationSettings; team: PageMember[] }>();
const emit = defineEmits<{ change: [] }>();

const hasAha = computed(() => props.team.some((member) => member.id === "1511"));
const hasSand = computed(() => props.team.some((member) => member.id === "1513"));

type NumberKey = "ultAdvanceAha" | "ultSpdPct" | "ahaSpdPct" | "ahaAdvancePct";
const setNumber = (key: NumberKey, event: Event): void => {
  const text = (event.target as HTMLInputElement).value;
  const parsed = Number(text);
  props.settings[key] = text.trim() === "" || !Number.isFinite(parsed) ? 0 : parsed;
  emit("change");
};
// 留空按升格等级：阿哈 2 魂起是 25%，否则 15%。
const setSandu = (event: Event): void => {
  const text = (event.target as HTMLInputElement).value;
  const parsed = Number(text);
  props.settings.sanduTeamSpdPct = text.trim() === "" || !Number.isFinite(parsed) ? null : parsed;
  emit("change");
};
const sanduAuto = computed(() => ((props.team.find((member) => member.id === "1511")?.eidolon ?? 0) >= 2 ? 25 : 15));
</script>

<template>
  <details class="axis-more">
    <summary>欢愉队设置</summary>
    <div class="axis-fields">
      <AxisSwitch v-if="!hasAha && hasKit('1511')" v-model="settings.useAeonAha" class="axis-field-wide" label="阿哈时刻按星神★阿哈的底速算" @update:model-value="emit('change')" />
      <AxisSwitch v-if="hasAha" v-model="settings.trace3Advance" class="axis-field-wide" label="行迹【盒中蕴藏的世界】开局提前 30%" @update:model-value="emit('change')" />
      <label v-if="hasAha" class="axis-field">
        <span>阿哈开大拉条 <small>%</small></span>
        <input class="input" type="number" step="5" :value="settings.ultAdvanceAha" @input="setNumber('ultAdvanceAha', $event)" />
      </label>
      <label v-if="hasSand" class="axis-field">
        <span>戏浪开大提速 <small>%</small></span>
        <input class="input" type="number" step="3" :value="settings.ultSpdPct" @input="setNumber('ultSpdPct', $event)" />
      </label>
      <label v-if="hasAha && hasSand" class="axis-field">
        <span>【三赌牌局】全队提速 <small>%，留空按星魂</small></span>
        <input class="input" type="number" step="5" :value="settings.sanduTeamSpdPct ?? ''" :placeholder="String(sanduAuto)" @input="setSandu" />
      </label>
      <label class="axis-field">
        <span>阿哈时刻额外速度 <small>%</small></span>
        <input class="input" type="number" step="1" :value="settings.ahaSpdPct" @input="setNumber('ahaSpdPct', $event)" />
      </label>
      <label class="axis-field">
        <span>开局拉条阿哈时刻 <small>%</small></span>
        <input class="input" type="number" step="5" :value="settings.ahaAdvancePct" @input="setNumber('ahaAdvancePct', $event)" />
      </label>
    </div>
  </details>
</template>
