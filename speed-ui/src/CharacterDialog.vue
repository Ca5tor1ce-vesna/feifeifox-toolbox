<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { fix, motionOff } from "./motion.ts";
import { CUSTOM_ID, type CharacterItem } from "./types.ts";
import { focusOnPointerDevice } from "../../ui-shared/src/feature.ts";

// 选角色的弹窗：搜索角色名、命途或属性。先显示小头像，只给看得见的头像换高清版（同时最多 3 张）。

const props = defineProps<{ characters: CharacterItem[]; selected: string }>();
const emit = defineEmits<{ pick: [id: string] }>();

const dialog = ref<HTMLDialogElement | null>(null);
const grid = ref<HTMLDivElement | null>(null);
const searchBox = ref<HTMLInputElement | null>(null);
const query = ref("");

const list = computed(() => {
  const needle = query.value.trim().toLowerCase();
  return props.characters.filter((item) => !needle || `${item.name} ${item.pathName || ""} ${item.elementName || ""}`.toLowerCase().includes(needle));
});
const showCustom = computed(() => {
  const needle = query.value.trim().toLowerCase();
  return !needle || "自定义角色 custom".includes(needle);
});
const tileTitle = (item: CharacterItem): string => {
  const trace = Number(item.traceSpeed || 0);
  const speed = item.effectiveBaseSpeed ?? item.baseSpeed;
  return `${item.pathName} · ${item.rarity}★ · ${fix(speed, 0)} 速${trace ? `（含行迹 +${fix(trace, 0)}）` : ""}`;
};
const hdOf = (item: CharacterItem): string | undefined => (item.iconLarge && item.iconLarge !== item.icon ? item.iconLarge : undefined);
const hideBroken = (event: Event): void => { (event.target as HTMLElement).style.visibility = "hidden"; };

// ---- 高清头像 ---- //
let alive = true;
let loads = 0;
const queue: HTMLImageElement[] = [];
function loadVisible(): void {
  while (alive && loads < 3 && queue.length) {
    const target = queue.shift()!;
    if (!target.isConnected || !target.dataset.hd) continue;
    const highRes = target.dataset.hd;
    const probe = new Image();
    loads++;
    const finish = (): void => { loads--; loadVisible(); };
    probe.onload = () => {
      if (alive && target.isConnected && target.dataset.hd && probe.naturalWidth > target.naturalWidth) {
        target.src = highRes;
        target.style.visibility = "visible";
      }
      finish();
    };
    probe.onerror = finish;
    probe.src = highRes;
  }
}
let observer: IntersectionObserver | null = null;
function watchImages(): void {
  if (!grid.value) return;
  if (!observer && typeof IntersectionObserver === "function") {
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer?.unobserve(entry.target);
        queue.push(entry.target as HTMLImageElement);
      }
      loadVisible();
    }, { root: grid.value, rootMargin: "80px" });
  }
  grid.value.querySelectorAll<HTMLImageElement>("img[data-hd]").forEach((img) => {
    if (observer) observer.observe(img);
    else { queue.push(img); loadVisible(); }
  });
}
watch(list, () => nextTick(watchImages));

// ---- 打开 / 关闭 ---- //
let closeTimer = 0;
async function openDialog(): Promise<void> {
  const element = dialog.value;
  if (!element) return;
  clearTimeout(closeTimer);
  element.classList.remove("is-closing");
  if (!element.open) element.showModal();
  await nextTick();
  watchImages();
  // 只在有鼠标的设备上自动聚焦搜索框：手机上一聚焦就弹键盘，挡住大半屏（2026-11-04 用户反馈）。
  focusOnPointerDevice(searchBox.value);
}
// 定时收尾而不是等 animationend：后台标签页不派发动画事件，弹窗不能因此关不掉。
function closeDialog(): void {
  const element = dialog.value;
  if (!element || !element.open || element.classList.contains("is-closing")) return;
  if (motionOff()) { element.close(); return; }
  element.classList.add("is-closing");
  closeTimer = window.setTimeout(() => {
    element.classList.remove("is-closing");
    element.close();
  }, 160);
}
const onBackdrop = (event: MouseEvent): void => { if (event.target === dialog.value) closeDialog(); };
const onCancel = (event: Event): void => { event.preventDefault(); closeDialog(); };
const pick = (id: string): void => { closeDialog(); emit("pick", id); };

onBeforeUnmount(() => {
  alive = false;
  observer?.disconnect();
  queue.length = 0;
  clearTimeout(closeTimer);
});
defineExpose({ open: openDialog });
</script>

<template>
  <dialog id="character-dialog" ref="dialog" class="sp-character-dialog" aria-labelledby="character-dialog-title" @click="onBackdrop" @cancel="onCancel">
    <button id="close-character" type="button" class="sp-dialog-close" aria-label="关闭" @click="closeDialog">×</button>
    <h3 id="character-dialog-title">选择角色</h3>
    <p class="sp-dialog-sub">搜索角色、命途或属性，选择后返回配装页面</p>
    <label class="sp-dialog-search"><span aria-hidden="true">⌕</span><input id="char-search" ref="searchBox" v-model="query" type="search" placeholder="搜索角色 / 命途 / 属性…（越新推出的越靠前）" autocomplete="off" aria-label="搜索角色" /></label>
    <div id="char-grid" ref="grid" class="sp-char-grid" role="listbox" aria-label="角色">
      <button v-if="showCustom" type="button" class="sp-char" :class="{ active: props.selected === CUSTOM_ID }" :data-char="CUSTOM_ID" title="空白角色：自己填基础速度和行迹速度" role="option" :aria-selected="props.selected === CUSTOM_ID" @click="pick(CUSTOM_ID)">
        <span class="sp-custom-icon">＋</span><span class="sp-char-name">自定义角色</span>
      </button>
      <button v-for="item in list" :key="item.id" type="button" class="sp-char" :class="{ active: props.selected === String(item.id) }" :data-char="item.id" :title="tileTitle(item)" role="option" :aria-selected="props.selected === String(item.id)" @click="pick(String(item.id))">
        <img v-if="item.icon" :src="item.icon" :data-hd="hdOf(item)" alt="" loading="lazy" @error="hideBroken" /><span v-else class="sp-noimg"></span>
        <span class="sp-char-name">{{ item.name }}</span>
      </button>
      <p v-if="!list.length && !showCustom" class="hint">没有匹配的角色</p>
    </div>
    <div class="sp-dialog-foot"><span>按角色、命途或属性筛选</span><button id="cancel-character" type="button" @click="closeDialog">取消</button></div>
  </dialog>
</template>
