<script setup lang="ts">
/* 角色顶分：按模式/关卡浏览 The Herta 采集的低配通关阵容，支持按角色名筛选。
 * 数据在浏览器里从镜像拉（records.ts），B站 Toy 版读随包数据（snapshot.ts）；元素 class 和以前一样，样式文件不用改。
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, onBeforeUnmount, ref, shallowRef } from "vue";
import { MODES } from "./data.ts";

export interface RecordsState {
  mode: string | null;
  selIdx: number;
  query: string;
}

const props = defineProps<{
  load: (refresh: boolean) => Promise<any>;
  initial?: Partial<RecordsState> | null;
  expose: (getState: () => RecordsState) => void;
}>();

const res = shallowRef<any>(null);
const error = ref("");
const loading = ref(false);
const mode = ref<string | null>(props.initial?.mode || null);
const selIdx = ref(Number(props.initial?.selIdx) || 0);
const query = ref(String(props.initial?.query || ""));
props.expose(() => ({ mode: mode.value, selIdx: selIdx.value, query: query.value }));

const targets = computed<any[]>(() => res.value?.data?.targets || []);
const firstIdxOfMode = (m: string | null): number => targets.value.findIndex((t) => t.mode === m);

let alive = true;
let seq = 0;
async function doLoad(refresh: boolean): Promise<void> {
  const my = ++seq;
  loading.value = true;
  let next;
  try {
    next = await props.load(refresh);
  } catch (err) {
    if (!alive || my !== seq) return;
    loading.value = false;
    error.value = (err as Error)?.message != null ? (err as Error).message : String(err);
    res.value = null;
    return;
  }
  if (!alive || my !== seq) return;
  loading.value = false;
  error.value = "";
  res.value = next;
  const list = targets.value;
  if (!MODES.includes(mode.value ?? "") || !list.some((t) => t.mode === mode.value)) mode.value = MODES.find((m) => list.some((t) => t.mode === m)) ?? null;
  if (list[selIdx.value]?.mode !== mode.value) selIdx.value = mode.value == null ? 0 : firstIdxOfMode(mode.value);
}
onBeforeUnmount(() => { alive = false; });

const tabs = computed(() => MODES.filter((m) => targets.value.some((t) => t.mode === m)).map((m) => ({ mode: m, season: targets.value.find((t) => t.mode === m)?.season ?? "" })));
const stages = computed(() => targets.value.map((t, index) => ({ t, index })).filter(({ t }) => t.mode === mode.value));
const pickMode = (m: string): void => {
  if (m === mode.value) return;
  mode.value = m;
  selIdx.value = firstIdxOfMode(m);
};
const onSearch = (event: Event): void => { query.value = (event.target as HTMLInputElement).value.replace(/\s+/g, ""); };

const target = computed(() => targets.value[selIdx.value]);
const q = computed(() => query.value.toLowerCase());
const list = computed<any[]>(() => {
  const records = target.value?.records || [];
  return q.value ? records.filter((r: any) => (r.lineup || []).some((c: any) => String(c.name ?? "").toLowerCase().includes(q.value))) : records;
});

const status = computed(() => {
  const r = res.value;
  if (!r) return { cls: "hr-status", text: "", title: "" };
  return {
    cls: r.offline ? "hr-status is-offline" : "hr-status is-ok",
    text: r.snapshot ? `随包数据 · 抓取于 ${r.fetched_at ?? ""}` : r.offline ? `离线缓存 · ${r.fetched_at ?? ""}` : `已连接：${r.mirror ?? ""} · ${r.fetched_at ?? ""}`,
    title: (r.attempts || []).map((a: any) => `${a.name} ${a.ok ? "✓" : "✗"} ${a.ms}ms ${a.error ?? ""}`).join("\n"),
  };
});
const footer = computed(() => {
  const data = res.value?.data || {};
  // B站 Toy 版的数据是打包时抓的，跟着工具箱更新，不是每天更新。
  const cadence = res.value?.snapshot ? "随工具箱更新" : "每天 12 点更新";
  return `数据来自 The Herta（theherta.com），${cadence} · 采集于 ${data.collected_at ?? ""} · ${data.selection_rule ?? ""}`;
});

// 末日幻影没有轮次只有积分，异相仲裁部分记录只有 AV：有什么显示什么
function resultText(r: any): string {
  const has = (v: unknown): boolean => v != null && v !== "";
  const parts: string[] = [];
  if (has(r.cycle)) parts.push(`${r.cycle} 轮`);
  if (has(r.score)) parts.push(`${r.score} 分`);
  if (has(r.av)) parts.push(`AV ${r.av}`);
  return parts.length ? parts.join(" · ") : String(r.tag ?? "—");
}
const charTitle = (c: any): string => `${c.name ?? ""} · E${c.eidolon}${c.lightcone ? ` · ${c.lightcone}` : ""} S${c.superimposition}`;
const firstChar = (name: unknown): string => [...String(name ?? "")][0] ?? "";
const avatarOf = (c: any): string | undefined => res.value?.avatars?.[String(c.name ?? "")];
const lcIconOf = (c: any): string | undefined => (c.lightcone ? res.value?.lightcone_icons?.[String(c.lightcone)] : undefined);
// 头像加载失败退回首字；光锥图标加载失败直接去掉。
const brokenAvatars = ref(new Set<string>());
const brokenIcons = ref(new Set<string>());
const breakAvatar = (src: string): void => { brokenAvatars.value = new Set(brokenAvatars.value).add(src); };
const breakIcon = (src: string): void => { brokenIcons.value = new Set(brokenIcons.value).add(src); };

void doLoad(false);
</script>

<template>
  <div class="hr-wrap">
    <div v-if="!res && !error" class="hr-loading" role="status"><span class="hr-spinner"></span>正在加载数据…</div>
    <template v-else-if="!res">
      <div class="hr-note">加载失败：{{ error }}</div>
      <button class="hr-refresh" type="button" @click="doLoad(true)">重试</button>
    </template>
    <template v-else>
      <div class="hr-head">
        <div class="hr-title"><h1>角色顶分</h1><p>队伍记录与角色配置</p></div>
        <input class="hr-search" type="search" placeholder="按角色名筛选，如 爻光" aria-label="按角色名筛选" :value="query" @input="onSearch" />
      </div>
      <div class="hr-top">
        <div class="hr-tabs">
          <button v-for="tab in tabs" :key="tab.mode" class="hr-tab" :class="{ 'is-active': tab.mode === mode }" type="button" :data-mode="tab.mode" @click="pickMode(tab.mode)">{{ tab.mode }}<span class="hr-season">{{ tab.season }}</span></button>
        </div>
        <div class="hr-tools">
          <span v-if="loading" class="hr-status"><span class="hr-spinner"></span>加载中…</span>
          <span v-else :class="status.cls" :title="status.title">{{ status.text }}</span>
          <button v-if="!res.snapshot" class="hr-refresh" type="button" :disabled="loading" @click="doLoad(true)">{{ loading ? "刷新中…" : "刷新" }}</button>
        </div>
      </div>
      <div class="hr-stagebar">
        <label class="hr-label">关卡</label>
        <select class="hr-stage" :value="String(selIdx)" @change="selIdx = Number(($event.target as HTMLSelectElement).value)">
          <option v-for="stage in stages" :key="stage.index" :value="String(stage.index)">{{ stage.t.stage }} · {{ stage.t.category }}</option>
        </select>
        <span class="hr-chip">{{ target ? target.category ?? "" : "" }}</span>
        <span class="hr-meta">{{ target ? `共 ${target.total_runs} 条记录 · 显示 ${list.length} 组` : "共 0 条记录 · 显示 0 组" }}</span>
      </div>
      <div v-if="res.offline" class="hr-note">{{ res.note }}</div>
      <div v-if="list.length" class="hr-grid">
        <div class="hr-grid-head" aria-hidden="true"><span>队伍 / 同组</span><span>上阵角色</span><span>限定</span><span>常驻</span><span>轮次</span><span>记录时间</span></div>
        <div v-for="(r, index) in list" :key="index" class="hr-card">
          <div class="hr-card-head"><span class="hr-group">{{ r.group }}</span><span class="hr-runs">{{ r.runs_in_group }} 条同组</span></div>
          <div class="hr-lineup">
            <div v-for="(c, ci) in r.lineup || []" :key="ci" class="hr-char" :class="{ 'is-match': q && String(c.name ?? '').toLowerCase().includes(q) }" :title="charTitle(c)">
              <div class="hr-avatar">
                <img v-if="avatarOf(c) && !brokenAvatars.has(avatarOf(c)!)" class="hr-avatar-img" :src="avatarOf(c)" alt="" @error="breakAvatar(avatarOf(c)!)" />
                <template v-else>{{ firstChar(c.name) }}</template>
              </div>
              <div class="hr-char-text">
                <div class="hr-name">{{ c.name ?? "" }}</div>
                <div class="hr-cons" :class="{ 'is-up': c.eidolon > 0 }">E{{ c.eidolon }} · S{{ c.superimposition }}</div>
                <div class="hr-lc" :title="c.lightcone ? `${c.lightcone} S${c.superimposition}` : undefined">
                  <img v-if="lcIconOf(c) && !brokenIcons.has(lcIconOf(c)!)" class="hr-lc-img" :src="lcIconOf(c)" alt="" @error="breakIcon(lcIconOf(c)!)" />
                  <span v-if="c.lightcone" class="hr-lc-name">{{ c.lightcone }}</span>
                  <span class="hr-lc-s">S{{ c.superimposition }}</span>
                </div>
              </div>
            </div>
          </div>
          <div class="hr-stats">
            <span class="hr-pill hr-ltd" title="限定">{{ r.ltd }}</span>
            <span class="hr-pill hr-std" title="常驻">{{ r.std }}</span>
            <span class="hr-pill hr-result">{{ resultText(r) }}</span>
          </div>
          <div class="hr-date">{{ r.date }}</div>
        </div>
      </div>
      <div v-else class="hr-empty">没有符合条件的记录</div>
      <div class="hr-footer">{{ footer }}</div>
    </template>
  </div>
</template>
