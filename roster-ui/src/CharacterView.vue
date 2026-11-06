<script setup lang="ts">
/* 角色：上面一排是已添加的角色（横着滑，「全部角色」看全部），下面是选中角色的设置、面板和身上 6 件遗器（可以换、可以脱）。 */
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { SLOT_NAMES, SLOTS } from "../../ui-shared/src/stats/labels.ts";
import type { RelicPiece, RosterCharacter, Slot, StatData } from "../../ui-shared/src/stats/types.ts";
import { orderCones } from "./cone-order.ts";
import GridPicker, { type GridItem } from "./GridPicker.vue";
import PanelView from "./PanelView.vue";
import RelicCard from "./RelicCard.vue";
import type { Catalog, Roster } from "./use-roster.ts";

const props = defineProps<{ roster: Roster; data: StatData; catalog: Catalog }>();
const r = props.roster;

// 添加角色：带头像的网格，按命途分组，新角色在前
const adding = ref(false);
const addItems = computed<GridItem[]>(() => {
  const all = [...props.catalog.characters.values()].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  const count = new Map<string, number>();
  for (const c of all) count.set(c.name, (count.get(c.name) ?? 0) + 1);
  return all.map((c) => {
    const have = !!r.roster.value.characters[c.id];
    // 同名的（开拓者）用命途区分
    const meta = [count.get(c.name)! > 1 ? c.pathName : "", have ? "已添加" : ""].filter(Boolean).join(" · ");
    return { id: c.id, name: c.name, icon: c.icon, rarity: c.rarity, groups: c.path, disabled: have, hint: have ? "已经添加了" : c.name, meta: meta || undefined };
  });
});
const pathGroups = computed(() => {
  const names = new Map<string, string>();
  for (const c of props.catalog.characters.values()) if (c.path && c.pathName) names.set(c.path, c.pathName);
  return [{ key: "", label: "全部" }, ...[...names].map(([key, label]) => ({ key, label }))];
});
async function add(id: string): Promise<void> {
  adding.value = false;
  await r.addCharacter(id);
}

// 全部角色：角色多了横排里不好找，用和添加角色一样的头像网格挑（2026-11-05 群里建议，手机上尤其需要）
const browsing = ref(false);
const ownedItems = computed<GridItem[]>(() => r.characters.value.map((c) => {
  const info = props.catalog.characters.get(c.id);
  return { id: c.id, name: info?.name ?? c.id, icon: info?.icon, rarity: info?.rarity, groups: info?.path, meta: `Lv.${c.level} · ${c.eidolon} 魂` };
}));
const ownedGroups = computed(() => {
  const names = new Map<string, string>();
  for (const c of r.characters.value) {
    const info = props.catalog.characters.get(c.id);
    if (info?.path && info.pathName) names.set(info.path, info.pathName);
  }
  return [{ key: "", label: "全部" }, ...[...names].map(([key, label]) => ({ key, label }))];
});
const listEl = ref<HTMLElement | null>(null);
/**
 * 选中的角色要在横排里看得见（2026-11-05 用户反馈：横排停在别处，看不到当前是谁）。
 * 只横着滚这一排，不用 scrollIntoView，免得整页跟着上下跳；按排版位置（offsetLeft，这一排是 position: relative）算，
 * 切页签时的入场动画会让屏幕上的位置偏一点。
 */
async function showChip(): Promise<void> {
  await nextTick();
  const list = listEl.value;
  const chip = list?.querySelector<HTMLElement>(".rs-chip.active");
  if (!list || !chip) return;
  const left = chip.offsetLeft;
  const right = left + chip.offsetWidth;
  if (left < list.scrollLeft) list.scrollLeft = left;
  else if (right > list.scrollLeft + list.clientWidth) list.scrollLeft = right - list.clientWidth;
}
// 打开页面、导入或添加后、在「全部角色」里挑了别人，都滚到选中的那个
watch(() => r.selectedId.value, () => void showChip());
onMounted(() => void showChip());
function browse(id: string): void {
  browsing.value = false;
  r.selectedId.value = id;
  void showChip();
}

const info = computed(() => (r.selected.value ? props.catalog.characters.get(r.selected.value.id) : null));
const panel = computed(() => (r.selected.value ? r.panelOf(r.selected.value) : null));
const equipped = computed(() => {
  const id = r.selected.value?.id;
  const bySlot = new Map<Slot, RelicPiece>();
  if (id) for (const relic of r.relicsOf(id)) { const slot = props.data.pieces.get(relic.pieceId)?.slot; if (slot) bySlot.set(slot, relic); }
  return SLOTS.map((slot) => ({ slot, name: SLOT_NAMES[slot], relic: bySlot.get(slot) ?? null }));
});

/** 改一项就存一次；改过的项不再算「按默认」。 */
function update(patch: Partial<RosterCharacter>, field: string): void {
  const current = r.selected.value;
  if (!current) return;
  void r.saveCharacter({ ...current, ...patch, defaults: current.defaults.filter((d) => d !== field) });
}
const promotions = computed(() => {
  const level = r.selected.value?.level ?? 80;
  const exact = level <= 20 ? 0 : Math.ceil((level - 20) / 10);
  const boundary = level < 80 && level >= 20 && (level - 20) % 10 === 0;
  return boundary ? [exact, exact + 1] : [Math.min(6, exact)];
});
function setLevel(value: string): void {
  const level = Math.max(1, Math.min(80, Math.round(Number(value) || 1)));
  const exact = level <= 20 ? 0 : Math.ceil((level - 20) / 10);
  const boundary = level < 80 && level >= 20 && (level - 20) % 10 === 0;
  update({ level, promotion: Math.min(6, boundary ? exact + 1 : exact) }, "level");
}
// 光锥：带图的网格。专武第一，游戏推荐的跟着，默认只看同命途
const conePicking = ref(false);
const coneItems = computed<GridItem[]>(() => {
  if (!info.value) return [];
  const rows = orderCones(info.value, props.catalog.lightcones.values()).map(({ cone, badge, samePath }) => ({
    id: cone.id, name: cone.name, icon: cone.icon, rarity: cone.rarity, badge: badge || undefined,
    groups: samePath || badge ? "mine" : "",
    meta: samePath ? undefined : `${cone.pathName ?? "别的命途"} · 被动不生效`,
  }));
  return [{ id: "", name: "不穿光锥", groups: "mine" }, ...rows];
});
// 别的命途的光锥也能选：被动不生效，但白值（生命、攻击、防御）照算（2026-11-06 群里问「能不能带高白值光锥」，原来就能选，只是不好找）
const coneGroups = computed(() => [{ key: "mine", label: `${info.value?.pathName ?? "同命途"}和推荐` }, { key: "", label: "全部光锥（别的命途只算白值）" }]);
const cone = computed(() => {
  const id = r.selected.value?.lightcone?.id;
  const c = id ? props.catalog.lightcones.get(id) : null;
  if (!c || !info.value) return null;
  return { ...c, signature: c.id === info.value.signatureCone, recommended: info.value.recommendedCones?.includes(c.id) ?? false, otherPath: c.path !== info.value.path };
});
function pickCone(id: string): void {
  conePicking.value = false;
  setCone(id);
}
function setCone(id: string): void {
  update({ lightcone: id ? { id, level: 80, promotion: 6, superimpose: r.selected.value?.lightcone?.superimpose ?? 1 } : null }, "lightcone");
}
function setConeField(field: "level" | "superimpose", value: string): void {
  const cone = r.selected.value?.lightcone;
  if (!cone) return;
  const n = Math.round(Number(value) || 1);
  if (field === "superimpose") return update({ lightcone: { ...cone, superimpose: Math.max(1, Math.min(5, n)) } }, "lightcone");
  const level = Math.max(1, Math.min(80, n));
  update({ lightcone: { ...cone, level, promotion: level <= 20 ? 0 : Math.min(6, Math.ceil((level - 20) / 10)) } }, "lightcone");
}
const allTraces = computed(() => Object.keys(props.data.characters.get(r.selected.value?.id ?? "")?.statTraces ?? {}));
const tracesFull = computed(() => (r.selected.value?.traces.length ?? 0) === allTraces.value.length);

// 换一件：按部位列出库里的遗器
const picking = ref<Slot | null>(null);
const pickable = computed(() => {
  if (!picking.value) return [];
  return r.roster.value.relics
    .filter((relic) => props.data.pieces.get(relic.pieceId)?.slot === picking.value && relic.equippedBy !== r.selected.value?.id)
    .sort((a, b) => Number(!!a.equippedBy) - Number(!!b.equippedBy));
});
const ownerName = (id: string | null): string | null => (id ? props.catalog.characters.get(id)?.name ?? id : null);
/**
 * 角色排成一行横着滑，滚动条藏起来了：电脑上用鼠标滚轮也能左右滚。
 * 只在这一排能横滚、又不能竖滚时接管；滚到头了就放给页面，免得页面滚不动。
 */
function wheelSideways(event: WheelEvent): void {
  const el = event.currentTarget as HTMLElement;
  if (event.deltaY === 0 || el.scrollWidth <= el.clientWidth || el.scrollHeight > el.clientHeight) return;
  const atStart = el.scrollLeft <= 0 && event.deltaY < 0;
  const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 && event.deltaY > 0;
  if (atStart || atEnd) return;
  event.preventDefault();
  el.scrollLeft += event.deltaY;
}

async function pick(relic: RelicPiece): Promise<void> {
  if (!r.selected.value) return;
  await r.equip(relic.id, r.selected.value.id);
  picking.value = null;
}
</script>

<template>
  <div class="rs-characters">
    <aside class="card rs-list">
      <div ref="listEl" class="rs-list-items" @wheel="wheelSideways">
        <button
          v-for="c in r.characters.value" :key="c.id" type="button" class="rs-chip" :class="{ active: r.selectedId.value === c.id }"
          @click="r.selectedId.value = c.id"
        >
          <img v-if="catalog.characters.get(c.id)?.icon" :src="catalog.characters.get(c.id)?.icon" alt="" loading="lazy" />
          <span>{{ catalog.characters.get(c.id)?.name ?? c.id }}</span>
          <small>Lv.{{ c.level }} · {{ c.eidolon }} 魂</small>
        </button>
      </div>
      <div class="rs-list-actions">
        <button v-if="r.characters.value.length > 1" type="button" class="rs-add rs-all" @click="browsing = true">全部角色 · {{ r.characters.value.length }}</button>
        <button type="button" class="rs-add" title="按默认值添加（80 级、行迹全点），之后可以改" @click="adding = true">＋ 添加角色</button>
      </div>
    </aside>

    <section v-if="r.selected.value && info" class="rs-detail">
      <div class="card rs-head">
        <div class="rs-unit">
          <span class="rs-unit-pic rs-splash" :class="`r${info.rarity ?? 5}`"><img v-if="info.splashHd || info.splash || info.icon" :src="info.splashHd || info.splash || info.icon" alt="" /></span>
          <div class="rs-unit-body">
            <div class="rs-unit-title">
              <h2>{{ info.name }}</h2>
              <span v-if="info.pathName" class="rs-tag">{{ info.pathName }}</span>
              <span v-if="info.elementName" class="rs-tag">{{ info.elementName }}</span>
            </div>
            <div class="rs-fields">
              <label class="field"><span>等级<em v-if="r.selected.value.defaults.includes('level')" class="rs-default">按默认</em></span>
                <input class="input" type="number" min="1" max="80" :value="r.selected.value.level" @change="setLevel(($event.target as HTMLInputElement).value)" /></label>
              <label v-if="promotions.length > 1" class="field"><span>突破<em v-if="r.selected.value.defaults.includes('promotion')" class="rs-default">按默认</em></span>
                <select class="input compact" :value="r.selected.value.promotion" @change="update({ promotion: Number(($event.target as HTMLSelectElement).value) }, 'promotion')">
                  <option v-for="p in promotions" :key="p" :value="p">{{ p === promotions[0] ? "还没突破" : "已突破" }}</option>
                </select></label>
              <label class="field"><span>星魂</span>
                <select class="input compact" :value="r.selected.value.eidolon" @change="update({ eidolon: Number(($event.target as HTMLSelectElement).value) }, 'eidolon')">
                  <option v-for="e in 7" :key="e" :value="e - 1">{{ e - 1 }} 魂</option>
                </select></label>
            </div>
            <label class="check rs-traces">
              <input type="checkbox" :checked="tracesFull" @change="update({ traces: ($event.target as HTMLInputElement).checked ? allTraces : [] }, 'traces')" />
              <span>属性行迹全点<em v-if="r.selected.value.defaults.includes('traces')" class="rs-default">按默认</em><small v-if="!tracesFull && r.selected.value.traces.length" class="muted">（已点 {{ r.selected.value.traces.length }}/{{ allTraces.length }}）</small></span>
            </label>
          </div>
        </div>

        <div class="rs-unit rs-cone">
          <button type="button" class="rs-unit-pic" :class="cone ? `r${cone.rarity}` : 'empty'" :aria-label="cone ? '换光锥' : '选光锥'" :title="cone ? '点图换光锥' : '选光锥'" @click="conePicking = true">
            <img v-if="cone?.portrait || cone?.icon" :src="cone.portrait || cone.icon" :class="{ 'rs-cone-art': cone.portrait }" alt="" />
            <span v-else aria-hidden="true">＋</span>
          </button>
          <div class="rs-unit-body">
            <div class="rs-unit-title">
              <h3 :class="{ muted: !cone }">{{ cone ? cone.name : "没穿光锥" }}</h3>
              <em v-if="cone?.signature" class="rs-badge hot">专武</em><em v-else-if="cone?.recommended" class="rs-badge">推荐</em>
            </div>
            <div v-if="r.selected.value.lightcone" class="rs-fields">
              <label class="field"><span>光锥等级</span><input class="input" type="number" min="1" max="80" :value="r.selected.value.lightcone.level" @change="setConeField('level', ($event.target as HTMLInputElement).value)" /></label>
              <label class="field"><span>叠影</span>
                <select class="input compact" :value="r.selected.value.lightcone.superimpose" @change="setConeField('superimpose', ($event.target as HTMLSelectElement).value)">
                  <option v-for="n in 5" :key="n" :value="n">{{ n }} 阶</option>
                </select></label>
            </div>
            <small v-if="cone?.otherPath" class="rs-warn">命途不同，光锥被动不生效</small>
            <small v-else-if="!cone" class="muted">点左边的框选光锥{{ info.signatureCone ? "，专武排在第一个" : "" }}</small>
          </div>
        </div>
      </div>

      <div class="card">
        <h3>面板</h3>
        <PanelView v-if="panel" :panel="panel" :element="info.element" />
        <p v-else class="error-text">面板算不出来：这个角色或身上的遗器有数据里没有的东西，请更新工具箱。</p>
      </div>

      <div class="card">
        <h3>身上的遗器</h3>
        <div class="rs-slots">
          <div v-for="item in equipped" :key="item.slot" class="rs-slot">
            <RelicCard v-if="item.relic" :relic="item.relic" :data="data" :catalog="catalog">
              <button type="button" class="ghost small" @click="picking = item.slot">换一件</button>
              <button type="button" class="ghost small" @click="r.equip(item.relic.id, null)">脱下</button>
            </RelicCard>
            <button v-else type="button" class="rs-relic rs-empty" @click="picking = item.slot">
              <span class="rs-relic-head"><span class="rs-relic-icon" aria-hidden="true">＋</span><span class="rs-relic-title"><strong>{{ item.name }}</strong><span class="muted small">空着</span></span></span>
              <span class="rs-empty-cta">从遗器库挑一件</span>
            </button>
          </div>
        </div>
      </div>
    </section>

    <section v-else class="card rs-detail rs-blank">
      <p class="muted">还没有角色。用上面的「识图导入」「导入扫描文件」把角色和遗器导进来，或者点「＋ 添加角色」手动添加。</p>
    </section>

    <GridPicker
      v-if="browsing" title="全部角色" search="搜索角色名" :items="ownedItems" :groups="ownedGroups" :value="r.selectedId.value ?? ''"
      @pick="browse" @close="browsing = false"
    />
    <GridPicker v-if="adding" title="添加角色" search="搜索角色名" :items="addItems" :groups="pathGroups" @pick="add" @close="adding = false" />
    <GridPicker
      v-if="conePicking && info" :title="`给${info.name}选光锥`" search="搜索光锥名（搜全部光锥）" :items="coneItems" :value="r.selected.value?.lightcone?.id ?? ''"
      :groups="coneGroups" group="mine" @pick="pickCone" @close="conePicking = false"
    />

    <div v-if="picking" class="rs-modal" role="dialog" aria-modal="true" @click.self="picking = null">
      <div class="rs-modal-box">
        <h3>换一件{{ SLOT_NAMES[picking] }}</h3>
        <p v-if="!pickable.length" class="muted">遗器库里没有别的{{ SLOT_NAMES[picking] }}。</p>
        <div class="rs-pick-list">
          <RelicCard v-for="relic in pickable" :key="relic.id" :relic="relic" :data="data" :catalog="catalog" :owner="ownerName(relic.equippedBy)">
            <button type="button" class="btn small" @click="pick(relic)">{{ relic.equippedBy ? "换过来" : "穿上" }}</button>
          </RelicCard>
        </div>
        <div class="rs-modal-actions"><button type="button" class="btn secondary" @click="picking = null">关闭</button></div>
      </div>
    </div>
  </div>
</template>
