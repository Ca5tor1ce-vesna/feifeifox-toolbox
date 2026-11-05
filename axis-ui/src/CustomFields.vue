<script setup lang="ts">
import type { CustomCharacter } from "../../axis-engine/src/battle.ts";
import AxisSwitch from "./AxisSwitch.vue";

const props = defineProps<{ custom: CustomCharacter }>();
const emit = defineEmits<{ change: [] }>();

type NumberKey = "baseSpd" | "maxEnergy" | "skillAllyAdvance" | "skillAllyEnergy" | "ultSelfAdvance" | "ultTeamAdvance" | "ultSpeedPct" | "ultSpeedTurns";
const FIELDS: { key: NumberKey; label: string; hint?: string; min: number; step: number }[] = [
  { key: "baseSpd", label: "基础速度", min: 1, step: 1 },
  { key: "maxEnergy", label: "能量上限", min: 1, step: 10 },
  { key: "skillAllyAdvance", label: "战技：目标行动提前", hint: "%", min: 0, step: 5 },
  { key: "skillAllyEnergy", label: "战技：目标回能", hint: "固定", min: 0, step: 5 },
  { key: "ultSelfAdvance", label: "终结技：自身行动提前", hint: "%", min: 0, step: 5 },
  { key: "ultTeamAdvance", label: "终结技：全队行动提前", hint: "%", min: 0, step: 5 },
  { key: "ultSpeedPct", label: "终结技：自身提速", hint: "%", min: 0, step: 5 },
  { key: "ultSpeedTurns", label: "提速持续", hint: "回合", min: 1, step: 1 },
];

// 数字框清空时不当成 0：留着原值，等用户填完。
const setNumber = (key: NumberKey, event: Event): void => {
  const text = (event.target as HTMLInputElement).value.trim();
  const parsed = Number(text);
  if (text === "" || !Number.isFinite(parsed)) return;
  props.custom[key] = parsed;
  emit("change");
};
const setEnergy = (kind: "basic" | "skill" | "ultimate", event: Event): void => {
  const text = (event.target as HTMLInputElement).value.trim();
  const parsed = Number(text);
  if (text === "" || !Number.isFinite(parsed)) return;
  props.custom.energy[kind] = parsed;
  emit("change");
};
const setName = (event: Event): void => {
  props.custom.name = (event.target as HTMLInputElement).value;
  emit("change");
};
</script>

<template>
  <div class="axis-fields axis-custom">
    <label class="axis-field axis-field-wide">
      <span>名字 <small>自定义角色只算这里填的数值和效果</small></span>
      <input class="input" maxlength="20" :value="custom.name" @input="setName" />
    </label>
    <label v-for="field in FIELDS" :key="field.key" class="axis-field">
      <span>{{ field.label }} <small v-if="field.hint">{{ field.hint }}</small></span>
      <input class="input" type="number" :min="field.min" :step="field.step" :value="custom[field.key]" @input="setNumber(field.key, $event)" />
    </label>
    <label class="axis-field">
      <span>普攻回能</span>
      <input class="input" type="number" min="0" step="5" :value="custom.energy.basic" @input="setEnergy('basic', $event)" />
    </label>
    <label class="axis-field">
      <span>战技回能</span>
      <input class="input" type="number" min="0" step="5" :value="custom.energy.skill" @input="setEnergy('skill', $event)" />
    </label>
    <label class="axis-field">
      <span>终结技返还</span>
      <input class="input" type="number" min="0" step="5" :value="custom.energy.ultimate" @input="setEnergy('ultimate', $event)" />
    </label>
    <AxisSwitch v-model="custom.ultExtraTurn" class="axis-field" label="终结技后获得额外回合" @update:model-value="emit('change')" />
  </div>
</template>
