<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from "vue";
import { focusOnPointerDevice } from "../feature.ts";
import type { PickerItem } from "./picker-item.ts";

// 通用组件：带图、可搜索的下拉。不认识游戏数据，只认 PickerItem；把游戏数据转成选项是业务组件（ui-shared/src/hsr/）的事。
// 按钮显示当前项，点开是可搜索的列表。弹层挂在页面根上（页面 provide 的 popupRoot，没有就挂 body），按按钮位置摆，放不下就朝上。
// 弹层一直在页面里，只切换 hidden；打开是同步的，点开后马上就能选。样式在外壳的 app/style.css（.picker-*），各页面共用。
// buttonClass：按钮要套哪个页面的输入框样式（配速查询 sp-control，行动轴 input）。
const props = defineProps<{ buttonId: string; items: PickerItem[]; value: string; placeholder: string; searchPlaceholder: string; buttonClass?: string }>();
const emit = defineEmits<{ pick: [id: string] }>();
const popupRoot = inject<HTMLElement | string>("popupRoot", "body");

const open = ref(false);
const query = ref("");
const button = ref<HTMLButtonElement | null>(null);
const popup = ref<HTMLDivElement | null>(null);
const search = ref<HTMLInputElement | null>(null);

const current = computed(() => props.items.find((item) => String(item.id) === String(props.value)));
const visible = computed(() => {
  const needle = query.value.trim().toLowerCase();
  return needle ? props.items.filter((item) => `${item.name} ${item.meta || ""}`.toLowerCase().includes(needle)) : props.items;
});

const hideBroken = (event: Event): void => { (event.target as HTMLElement).style.visibility = "hidden"; };

function show(): void {
  const element = button.value;
  const box = popup.value;
  if (!element || !box) return;
  const rect = element.getBoundingClientRect();
  const margin = 8;
  const width = Math.min(Math.max(rect.width, 320), Math.max(240, window.innerWidth - margin * 2));
  const left = Math.min(Math.max(margin, rect.left), Math.max(margin, window.innerWidth - width - margin));
  box.style.left = `${left}px`;
  box.style.width = `${width}px`;
  box.style.top = `${margin}px`;
  query.value = "";
  box.classList.remove("hidden");
  open.value = true;
  const height = box.offsetHeight || 360;
  const spaceBelow = window.innerHeight - rect.bottom - margin;
  let top = rect.bottom + 4;
  if (height > spaceBelow && rect.top - margin > spaceBelow) top = rect.top - height - 4;
  top = Math.min(Math.max(margin, top), Math.max(margin, window.innerHeight - height - margin));
  box.style.top = `${top}px`;
  // 只在有鼠标的设备上自动聚焦搜索框：手机上一聚焦就弹键盘，挡住大半屏（2026-11-04 用户反馈）。
  focusOnPointerDevice(search.value);
}
const close = (): void => {
  popup.value?.classList.add("hidden");
  open.value = false;
};
const toggle = (): void => { if (open.value) close(); else show(); };
const choose = (id: string): void => { close(); emit("pick", id); };
const onKeydown = (event: KeyboardEvent): void => { if (event.key === "Escape") close(); };

onMounted(() => {
  document.addEventListener("click", close);
  document.addEventListener("keydown", onKeydown);
});
onBeforeUnmount(() => {
  document.removeEventListener("click", close);
  document.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <button :id="props.buttonId" ref="button" type="button" class="picker-button" :class="props.buttonClass" @click.stop="toggle">
    <img v-if="current?.icon" :src="current.icon" alt="" loading="lazy" @error="hideBroken" /><span v-else class="picker-noimg"></span>
    <span class="pb-name">{{ current ? current.name : props.placeholder }}</span>
    <span class="pb-caret">▾</span>
  </button>
  <Teleport :to="popupRoot">
    <div ref="popup" class="picker-popup" :class="{ hidden: !open }" @click.stop>
      <input ref="search" v-model="query" class="input picker-search" :placeholder="props.searchPlaceholder" />
      <div class="picker-list">
        <button v-for="item in visible" :key="item.id" type="button" class="picker-item" :class="{ active: String(item.id) === String(props.value) }" :data-id="item.id" :title="item.title || item.meta || ''" @click="choose(item.id)">
          <img v-if="item.icon" :src="item.icon" alt="" loading="lazy" @error="hideBroken" /><span v-else class="picker-noimg"></span>
          <span class="pi-name">{{ item.name }}</span>
          <span class="pi-meta">{{ item.meta || "" }}</span>
        </button>
        <p v-if="!visible.length" class="hint" style="padding: 8px">没有匹配项</p>
      </div>
    </div>
  </Teleport>
</template>
