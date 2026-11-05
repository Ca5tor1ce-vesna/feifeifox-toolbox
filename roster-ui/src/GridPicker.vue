<script setup lang="ts">
/* 带图的网格选择（光锥、添加角色）：搜索框 + 分组小标签 + 图片格子。搜索时不看分组，名字对上就列出来。 */
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { focusOnPointerDevice } from "../../ui-shared/src/feature.ts";

export interface GridItem {
  id: string;
  name: string;
  icon?: string;
  meta?: string;
  /** 角标，例如「专武」「推荐」。 */
  badge?: string;
  /** 所在分组，空格分开；分组标签选中时只列这些。 */
  groups?: string;
  rarity?: number;
  disabled?: boolean;
  hint?: string;
}
const props = defineProps<{ title: string; items: GridItem[]; value?: string; groups?: { key: string; label: string }[]; group?: string; search: string }>();
const emit = defineEmits<{ pick: [id: string]; close: [] }>();

const query = ref("");
const group = ref(props.group ?? "");
const input = ref<HTMLInputElement | null>(null);
const shown = computed(() => {
  const text = query.value.trim().toLowerCase();
  if (text) return props.items.filter((item) => item.name.toLowerCase().includes(text));
  return group.value ? props.items.filter((item) => item.groups?.split(" ").includes(group.value)) : props.items;
});
const pickFirst = (): void => {
  const first = shown.value.find((item) => !item.disabled);
  if (first) emit("pick", first.id);
};
const hideBroken = (event: Event): void => { (event.target as HTMLElement).style.visibility = "hidden"; };
const onKey = (event: KeyboardEvent): void => { if (event.key === "Escape") emit("close"); };
// 只在有鼠标的设备上自动聚焦搜索框：手机上一聚焦就弹键盘，挡住大半屏。
onMounted(() => { focusOnPointerDevice(input.value); document.addEventListener("keydown", onKey); });
onBeforeUnmount(() => document.removeEventListener("keydown", onKey));
</script>

<template>
  <div class="rs-modal" role="dialog" aria-modal="true" :aria-label="title" @click.self="emit('close')">
    <div class="rs-modal-box rs-gp">
      <header class="rs-gp-head">
        <h3>{{ title }}</h3>
        <button type="button" class="ghost small" @click="emit('close')">关闭</button>
      </header>
      <input ref="input" v-model="query" class="input" :placeholder="search" :aria-label="search" @keydown.enter="pickFirst" />
      <div v-if="groups?.length" class="rs-gp-chips" role="group" aria-label="筛选" :class="{ dim: query }">
        <button v-for="g in groups" :key="g.key" type="button" class="rs-gp-chip" :class="{ on: group === g.key }" @click="group = g.key; query = ''">{{ g.label }}</button>
      </div>
      <div class="rs-gp-grid">
        <button
          v-for="item in shown" :key="item.id" type="button" class="rs-gp-item" :class="[{ current: item.id === value }, item.rarity ? `r${item.rarity}` : '']"
          :disabled="item.disabled" :title="item.hint || item.name" @click="emit('pick', item.id)"
        >
          <span class="rs-gp-pic">
            <img v-if="item.icon" :src="item.icon" alt="" loading="lazy" @error="hideBroken" />
            <span v-else class="rs-gp-noicon" aria-hidden="true">{{ item.id ? item.name.charAt(0) : "—" }}</span>
            <em v-if="item.badge" class="rs-gp-badge" :class="{ hot: item.badge === '专武' }">{{ item.badge }}</em>
          </span>
          <span class="rs-gp-name">{{ item.name }}</span>
          <small v-if="item.meta" class="rs-gp-meta">{{ item.meta }}</small>
        </button>
      </div>
      <p v-if="!shown.length" class="muted">没有找到「{{ query }}」，换个字试试。</p>
    </div>
  </div>
</template>
