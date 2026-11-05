<script setup lang="ts">
import { computed, ref } from "vue";
import type { TeamRecord } from "./legacy-team.ts";
import { TEAM_PRESETS } from "./presets.ts";

const props = defineProps<{ teams: Record<string, TeamRecord>; teamSize: number }>();
const emit = defineEmits<{
  loadPreset: [key: string];
  loadTeam: [id: string];
  save: [name: string, id: string];
  remove: [id: string];
}>();

const selected = ref("");
const name = ref("");
const savedList = computed(() => Object.entries(props.teams));
const hasSelected = computed(() => Boolean(selected.value && props.teams[selected.value]));

const load = (): void => {
  if (!hasSelected.value) return;
  name.value = props.teams[selected.value].name;
  emit("loadTeam", selected.value);
};
const remove = (): void => {
  if (!hasSelected.value) return;
  emit("remove", selected.value);
  selected.value = "";
};
</script>

<template>
  <details class="axis-more axis-library">
    <summary>预设和我的队伍<span v-if="savedList.length" class="axis-more-count">已存 {{ savedList.length }} 队</span></summary>
    <div class="axis-library-presets">
      <button v-for="(preset, key) in TEAM_PRESETS" :key="key" class="axis-chip" type="button" :title="preset.desc" @click="emit('loadPreset', String(key))">{{ preset.short }}</button>
    </div>
    <div class="axis-library-row">
      <select v-model="selected" class="input" aria-label="已保存的队伍">
        <option value="">选择已保存的队伍</option>
        <option v-for="[id, team] in savedList" :key="id" :value="id">{{ team.name }}</option>
      </select>
      <button class="ghost small" type="button" :disabled="!hasSelected" @click="load">读取</button>
      <button class="ghost small" type="button" :disabled="!hasSelected" @click="remove">删除</button>
    </div>
    <div class="axis-library-row">
      <input v-model="name" class="input" maxlength="80" placeholder="给队伍起个名字" aria-label="队伍名称" />
      <button class="btn secondary small" type="button" :disabled="teamSize === 0" @click="emit('save', name, '')">另存</button>
      <button class="ghost small" type="button" :disabled="teamSize === 0 || !hasSelected" @click="emit('save', name, selected)">覆盖</button>
    </div>
  </details>
</template>
