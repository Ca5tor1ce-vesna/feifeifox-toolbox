<script setup lang="ts">
import { motion } from "motion-v";
import { computed, onMounted, ref } from "vue";
import { iconOf } from "./assets.ts";
import { vLoad } from "./img-load.ts";
import type { CatalogItem } from "./model.ts";
import { QUICK, SPRING } from "./motion.ts";
import { focusOnPointerDevice } from "../../ui-shared/src/feature.ts";

const props = defineProps<{ characters: CatalogItem[]; taken: string[] }>();
const emit = defineEmits<{ pick: [id: string]; close: [] }>();

const query = ref("");
const path = ref("");
const input = ref<HTMLInputElement | null>(null);

const paths = computed(() => {
  const names = new Map<string, string>();
  for (const item of props.characters) if (item.path && item.pathName) names.set(item.path, item.pathName);
  return [...names.entries()];
});

const shown = computed(() => {
  const text = query.value.trim().toLowerCase();
  return props.characters.filter((item) =>
    (!path.value || item.path === path.value) && (!text || item.name.toLowerCase().includes(text)));
});

const pickFirst = () => {
  const first = shown.value.find((item) => !props.taken.includes(String(item.id)));
  if (first) emit("pick", String(first.id));
};

// 只在有鼠标的设备上自动聚焦搜索框：手机上一聚焦就弹键盘，挡住大半屏（2026-11-04 用户反馈）。
onMounted(() => focusOnPointerDevice(input.value));
</script>

<template>
  <motion.div class="axis-picker-backdrop" :initial="{ opacity: 0 }" :animate="{ opacity: 1 }" :exit="{ opacity: 0 }" :transition="QUICK" @click.self="emit('close')" @keydown.esc="emit('close')">
    <motion.div class="axis-picker" role="dialog" aria-label="选择角色" :initial="{ opacity: 0, y: 14, scale: 0.97 }" :animate="{ opacity: 1, y: 0, scale: 1 }" :exit="{ opacity: 0, y: 8, scale: 0.98, transition: QUICK }" :transition="SPRING">
      <div class="axis-picker-head">
        <input ref="input" v-model="query" class="input" placeholder="搜索角色名" aria-label="搜索角色名" @keydown.enter="pickFirst" />
        <div class="axis-chips" role="group" aria-label="按命途筛选">
          <button class="axis-chip" :class="{ 'is-on': path === '' }" type="button" @click="path = ''">全部</button>
          <button v-for="[key, name] in paths" :key="key" class="axis-chip" :class="{ 'is-on': path === key }" type="button" @click="path = key">{{ name }}</button>
        </div>
        <button class="ghost small" type="button" @click="emit('close')">关闭</button>
      </div>
      <div class="axis-picker-grid">
        <button class="axis-picker-item axis-picker-custom" type="button" title="收录里没有的角色：自己填速度、能量和常见效果" @click="emit('pick', 'custom')">
          <span class="axis-picker-noicon" aria-hidden="true">＋</span>
          <span>自定义角色</span>
        </button>
        <button
          v-for="item in shown"
          :key="item.id"
          class="axis-picker-item"
          type="button"
          :disabled="taken.includes(String(item.id))"
          :title="taken.includes(String(item.id)) ? '已经在队伍里了' : item.name"
          @click="emit('pick', String(item.id))"
        >
          <img v-if="iconOf(item)" v-load :src="iconOf(item)" :alt="item.name" loading="lazy" />
          <span v-else class="axis-picker-noicon" aria-hidden="true">{{ item.name.charAt(0) }}</span>
          <span>{{ item.name }}</span>
        </button>
        <p v-if="shown.length === 0" class="muted">没有找到「{{ query }}」，换个字试试。</p>
      </div>
    </motion.div>
  </motion.div>
</template>
