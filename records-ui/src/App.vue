<script setup lang="ts">
/* 角色顶分：按模式、版本、关卡浏览 The Herta 采集的低配通关阵容，可以按标签、角色和光锥筛选。
 * 最新数据在浏览器里从镜像拉（records.ts），B站 Toy 版读随包数据（snapshot.ts）；往期成绩两边都随包（records_archive）。筛选在 filter.ts。
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { MODES } from "./data.ts";
import { ALL, categoriesOf, charMatches, compareSeason, EIDOLONS, groupsOf, openMode, restoreFilter, rowsOf, seasonsOf, settle, SORTS, stageLabel, stagesOf, tagsOf, termsOf, totalRuns, type RecordsFilter } from "./filter.ts";

export interface RecordsState extends RecordsFilter {
  mode: string | null;
}

/** 一次画多少组，全部版本一起看时不一口气画几百张卡。 */
const PAGE = 60;
const LIMITS = [0, 1, 2, 3, 4, 5, 6, 8, 10];

const props = defineProps<{
  load: (refresh: boolean) => Promise<any>;
  initial?: Partial<RecordsState> | null;
  expose: (getState: () => RecordsState) => void;
}>();

const res = shallowRef<any>(null);
const error = ref("");
const loading = ref(false);
const mode = ref<string | null>(props.initial?.mode || null);
/** 存档里有上次的范围时用它，没有时加载后打开最新版本。 */
const restored = typeof props.initial?.stage === "string";
const filter = ref<RecordsFilter>(restoreFilter(props.initial));
const shown = ref(PAGE);
props.expose(() => ({ mode: mode.value, ...filter.value }));

const targets = computed<any[]>(() => res.value?.data?.targets || []);

let alive = true;
let seq = 0;
let opened = restored;
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
  if (!MODES.includes(mode.value ?? "") || !list.some((t) => t.mode === mode.value)) {
    mode.value = MODES.find((m) => list.some((t) => t.mode === m)) ?? null;
    opened = false;
  }
  filter.value = opened ? settle(filter.value, list, mode.value) : openMode(filter.value, list, mode.value);
  opened = true;
}
onBeforeUnmount(() => { alive = false; });

const tabs = computed(() => MODES.filter((m) => targets.value.some((t) => t.mode === m)).map((m) => ({ mode: m, season: seasonsOf(targets.value, m)[0] ?? "" })));
const pickMode = (m: string): void => {
  if (m === mode.value) return;
  mode.value = m;
  filter.value = openMode(filter.value, targets.value, m);
};
/** 改一项筛选，再把对不上的选项收回来。 */
const change = (patch: Partial<RecordsFilter>): void => { filter.value = settle({ ...filter.value, ...patch }, targets.value, mode.value); };
const valueOf = (event: Event): string => (event.target as HTMLSelectElement).value;
const limitOf = (event: Event): number | null => (valueOf(event) === "" ? null : Number(valueOf(event)));
const onSearch = (event: Event): void => { filter.value = { ...filter.value, query: (event.target as HTMLInputElement).value }; };

const seasons = computed(() => seasonsOf(targets.value, mode.value));
const stages = computed(() => stagesOf(targets.value, mode.value, filter.value.season));
const categories = computed(() => categoriesOf(targets.value, mode.value, filter.value.season, filter.value.stage));
const groups = computed(() => groupsOf(targets.value, mode.value, filter.value));
const rows = computed(() => rowsOf(targets.value, mode.value, filter.value));
const runs = computed(() => totalRuns(targets.value, mode.value, filter.value));
const terms = computed(() => termsOf(filter.value.query));
const visible = computed(() => rows.value.slice(0, shown.value));
const hasOlder = computed(() => seasons.value.some((season) => compareSeason(season, seasons.value[0]) > 0));
watch(filter, () => { shown.value = PAGE; });
/** 手机上阵容组、限定这些收起来，不把成绩挤到一屏以外。 */
const moreOpen = ref(false);
const moreCount = computed(() => {
  const { group, ltdMax, stdMax, eidolon, sort } = filter.value;
  return [group !== ALL, ltdMax !== null, stdMax !== null, eidolon !== "any", sort !== "default"].filter(Boolean).length;
});
const searchEverywhere = (): void => change({ season: ALL, stage: ALL, category: ALL });

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
        <input class="hr-search" type="search" placeholder="角色或光锥，空格分开，如 爻光 绯英" aria-label="按角色或光锥筛选" :value="filter.query" @input="onSearch" />
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
      <div class="hr-filters" :class="{ 'is-open': moreOpen }">
        <label class="hr-field"><span>版本</span>
          <select class="hr-stage" :value="filter.season" @change="change({ season: valueOf($event) })">
            <option :value="ALL">全部版本</option>
            <option v-for="season in seasons" :key="season" :value="season">{{ season }}{{ hasOlder && season === seasons[0] ? "（当期）" : "" }}</option>
          </select>
        </label>
        <label class="hr-field hr-field-wide"><span>关卡</span>
          <select class="hr-stage" :value="filter.stage" @change="change({ stage: valueOf($event) })">
            <option :value="ALL">全部关卡</option>
            <option v-for="stage in stages" :key="stage" :value="stage">{{ stageLabel(mode, stage) }}</option>
          </select>
        </label>
        <label class="hr-field hr-field-more"><span>阵容组</span>
          <select class="hr-stage" :value="filter.group" @change="change({ group: valueOf($event) })">
            <option :value="ALL">全部阵容</option>
            <option v-for="item in groups" :key="item.group" :value="item.group">{{ item.group }}（{{ item.count }}）</option>
          </select>
        </label>
        <label class="hr-field hr-field-more"><span>限定</span>
          <select class="hr-stage" :value="filter.ltdMax ?? ''" @change="change({ ltdMax: limitOf($event) })">
            <option value="">不限</option>
            <option v-for="limit in LIMITS" :key="limit" :value="limit">{{ limit }} 个以内</option>
          </select>
        </label>
        <label class="hr-field hr-field-more"><span>常驻</span>
          <select class="hr-stage" :value="filter.stdMax ?? ''" @change="change({ stdMax: limitOf($event) })">
            <option value="">不限</option>
            <option v-for="limit in LIMITS" :key="limit" :value="limit">{{ limit }} 个以内</option>
          </select>
        </label>
        <label class="hr-field hr-field-more"><span>星魂</span>
          <select class="hr-stage" :value="filter.eidolon" @change="change({ eidolon: valueOf($event) as RecordsFilter['eidolon'] })">
            <option v-for="item in EIDOLONS" :key="item.id" :value="item.id">{{ item.label }}</option>
          </select>
        </label>
        <label class="hr-field hr-field-more"><span>排序</span>
          <select class="hr-stage" :value="filter.sort" @change="change({ sort: valueOf($event) as RecordsFilter['sort'] })">
            <option v-for="item in SORTS" :key="item.id" :value="item.id">{{ item.label }}</option>
          </select>
        </label>
      </div>
      <div class="hr-stagebar">
        <div class="hr-cats" role="group" aria-label="分类">
          <button class="hr-cat" :class="{ 'is-active': filter.category === ALL }" type="button" @click="change({ category: ALL })">全部</button>
          <button v-for="category in categories" :key="category" class="hr-cat" :class="{ 'is-active': filter.category === category }" type="button" @click="change({ category })">{{ category }}</button>
        </div>
        <button class="hr-cat hr-more-filters" :class="{ 'is-active': moreCount > 0 }" type="button" :aria-expanded="moreOpen" @click="moreOpen = !moreOpen">{{ moreOpen ? "收起筛选" : "更多筛选" }}{{ moreCount ? `（${moreCount}）` : "" }}</button>
        <span class="hr-meta">共 {{ runs }} 条记录 · 显示 {{ rows.length }} 组</span>
        <button v-if="terms.length && (filter.season !== ALL || filter.stage !== ALL)" class="hr-cat" type="button" @click="searchEverywhere">在全部版本里找</button>
      </div>
      <div v-if="res.offline" class="hr-note">{{ res.note }}</div>
      <div v-if="rows.length" class="hr-grid">
        <div class="hr-grid-head" aria-hidden="true"><span>队伍 / 同组</span><span>上阵角色</span><span>限定</span><span>常驻</span><span>成绩</span><span>记录时间</span></div>
        <div v-for="(row, index) in visible" :key="index" class="hr-card">
          <div class="hr-card-head">
            <span class="hr-group">{{ row.record.group }}</span>
            <span class="hr-runs">{{ row.record.runs_in_group }} 条同组</span>
            <span class="hr-tags"><span v-for="tag in tagsOf(row, filter.stage === ALL)" :key="tag" class="hr-tag">{{ tag }}</span></span>
          </div>
          <div class="hr-lineup">
            <div v-for="(c, ci) in row.record.lineup || []" :key="ci" class="hr-char" :class="{ 'is-match': charMatches(c, terms) }" :title="charTitle(c)">
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
            <span class="hr-pill hr-ltd" title="限定">{{ row.record.ltd }}</span>
            <span class="hr-pill hr-std" title="常驻">{{ row.record.std }}</span>
            <span class="hr-pill hr-result">{{ resultText(row.record) }}</span>
          </div>
          <div class="hr-date">{{ row.record.date }}</div>
        </div>
      </div>
      <div v-else class="hr-empty">没有符合条件的记录</div>
      <button v-if="rows.length > shown" class="hr-more" type="button" @click="shown += PAGE">再显示 {{ Math.min(PAGE, rows.length - shown) }} 组（还有 {{ rows.length - shown }} 组）</button>
      <div class="hr-footer">{{ footer }}</div>
    </template>
  </div>
</template>
