<script setup lang="ts">
import { AnimatePresence, motion } from "motion-v";
import { computed, onBeforeUnmount, reactive, ref, shallowRef, watch } from "vue";
import AxisSwitch from "./AxisSwitch.vue";
import { iconOf, splashOf } from "./assets.ts";
import type { Head } from "./AxisHead.vue";
import { faceCropOf } from "./face-crops.ts";
import { ultClipOf, type UltClip } from "./ult-clips.ts";
import { memberFromBuild, type ResolvedBuild, type SavedBuild } from "./build.ts";
import { memberFromRoster } from "./roster-member.ts";
import type { RelicPiece, RosterCharacter, RosterSave, StatData } from "../../ui-shared/src/stats/types.ts";
import CharacterPicker from "./CharacterPicker.vue";
import DamagePanel from "./DamagePanel.vue";
import ElationPanel from "./ElationPanel.vue";
import ElationSettingsPanel from "./ElationSettingsPanel.vue";
import EventList from "./EventList.vue";
import type { Holder } from "./CardDetail.vue";
import { stateFromLegacy, stateFromRecord, type TeamRecord } from "./legacy-team.ts";
import {
  castsOf,
  computeAxis,
  defaultManualUltimates,
  droppedMembers,
  droppedNotice,
  holdsUltimate,
  MAX_WINDOW_AV,
  modeOf,
  needsLead,
  needsManualUltimate,
  newCustomMember,
  newMember,
  toggleUltMark,
  ultOrderIds,
  windowAV,
  type AxisView,
  type PageData,
  type PageState,
  type Row,
} from "./model.ts";
import { QUICK, SPRING } from "./motion.ts";
import { TEAM_PRESETS } from "./presets.ts";
import TeamCard from "./TeamCard.vue";
import TeamLibrary from "./TeamLibrary.vue";
import ThresholdTool from "./ThresholdTool.vue";

const props = defineProps<{
  data: PageData;
  initial: PageState;
  /** 打开页面时要说的话，比如存档里有角色读不进来。 */
  initialNotice?: string;
  call: (action: string, payload?: unknown) => Promise<unknown>;
  onChange: () => void;
  expose: (getState: () => PageState) => void;
}>();

const SAMPLE_TEAM = ["1313", "1309", "1303", "1407"];

const state = reactive<PageState>(props.initial);
props.expose(() => JSON.parse(JSON.stringify(state)) as PageState);

const presets = ref<Record<string, SavedBuild>>({});
const teams = ref<Record<string, TeamRecord>>({});
props.call("library").then((library) => {
  const result = library as { presets?: Record<string, SavedBuild>; teams?: Record<string, TeamRecord> };
  presets.value = result.presets ?? {};
  teams.value = result.teams ?? {};
}).catch(() => { /* 读不到配装不影响排轴，配置里不显示读取入口就好。 */ });

/** 「角色与遗器」里有哪些角色（显示「实际装配」的读取入口用）。 */
const actual = ref<Record<string, string>>({});
props.call("roster_get").then((roster) => {
  const save = roster as RosterSave | null;
  actual.value = Object.fromEntries(Object.values(save?.characters ?? {}).map((c) => [c.id, `Lv.${c.level} · ${c.eidolon} 魂 · ${save!.relics.filter((r) => r.equippedBy === c.id).length} 件遗器`]));
}).catch(() => { /* 没有存档就不显示入口 */ });

// ---- 计算：同步算完，结果永远跟着输入，失败时不留旧结果。 ---- //
const view = shallowRef<AxisView | null>(null);
const failure = ref("");

const recompute = (): void => {
  if (state.team.length === 0) {
    view.value = null;
    failure.value = "";
    return;
  }
  try {
    view.value = computeAxis(state, props.data);
    failure.value = "";
  } catch (error) {
    view.value = null;
    failure.value = (error as Error).message;
  }
};

const changed = (): void => {
  recompute();
  props.onChange();
};
recompute();

// ---- 目录 ---- //
const byId = computed(() => new Map(props.data.characters.map((item) => [String(item.id), item])));
const caverns = computed(() => props.data.relicSets.filter((set) => (set.desc?.length ?? 0) > 1));
const ornaments = computed(() => props.data.relicSets.filter((set) => (set.desc?.length ?? 0) <= 1));
const mode = computed(() => modeOf(state, props.data));
const icons = computed<Record<number, string>>(() =>
  Object.fromEntries(state.team.map((member, slot) => [slot, iconOf(byId.value.get(member.id))])));
const splashes = computed<Record<number, string>>(() =>
  Object.fromEntries(state.team.map((member, slot) => [slot, splashOf(byId.value.get(member.id))])));
// 轴上的头像用透明底立绘按选人头像的取景裁出来。
const heads = computed<Record<number, Head>>(() =>
  Object.fromEntries(state.team.map((member, slot) => [slot, { splash: splashes.value[slot], crop: faceCropOf(member.id) }])));
// 终结技卡片里的大招动画片段；没有片段的角色显示立绘。
const clips = computed<Record<number, UltClip>>(() =>
  Object.fromEntries(state.team.flatMap((member, slot) => { const clip = ultClipOf(member.id); return clip ? [[slot, clip]] : []; })));
const manualIds = computed(() => new Set(state.team.flatMap((member, slot) => (needsManualUltimate(member.id) ? [slot] : []))));
const nameOf = (id: string): string => {
  const member = state.team.find((mate) => mate.id === id);
  return member?.custom?.name || byId.value.get(id)?.name || id;
};
const teamIds = computed(() => state.team.map((member) => member.id));
// 留大的人：卡片里给他们每人一个「在这之后开大」。
const holders = computed<Holder[]>(() =>
  state.team.filter(holdsUltimate).map((member) => ({ id: member.id, name: nameOf(member.id), marks: member.ultAfter ?? [] })));
const showLead = computed(() => needsLead(state));
// 开大顺序：两人及以上才有意义；点名字排到最前。
const ultOrder = computed(() => ultOrderIds(state));
const toFront = (id: string): void => {
  state.ultOrder = [id, ...ultOrder.value.filter((item) => item !== id)];
  changed();
};

const totals = computed(() => {
  const units = view.value?.units ?? [];
  return {
    actions: units.reduce((sum, unit) => sum + unit.actions, 0),
    ultimates: units.reduce((sum, unit) => sum + unit.ultimates, 0),
  };
});
const summary = computed(() =>
  view.value
    ? `${state.customAV === null ? `${mode.value.shortName ?? mode.value.name} ${state.t}T · ` : ""}${view.value.maxAV} AV 内共 ${totals.value.actions} 动、${totals.value.ultimates} 次终结技`
    : "");

// ---- 选人 ---- //
const pickerSlot = ref<number | null>(null);
const takenIds = computed(() => state.team.map((member) => member.id));

const pick = (id: string): void => {
  const slot = pickerSlot.value;
  pickerSlot.value = null;
  if (slot === null) return;
  const member = id === "custom" ? newCustomMember() : newMember(id);
  if (slot >= state.team.length) state.team.push(member);
  else state.team[slot] = member;
  changed();
};

// 卡片退场动画期间按钮还能点，所以这里按角色找人，不信任点击时记下的站位。
const slotOf = (id: string): number => state.team.findIndex((member) => member.id === id);

const replace = (id: string): void => {
  const slot = slotOf(id);
  if (slot >= 0) pickerSlot.value = slot;
};

const remove = (id: string): void => {
  const slot = slotOf(id);
  if (slot < 0) return;
  state.team.splice(slot, 1);
  // 技能目标记的是站位，移走人之后要跟着调整。
  for (const member of state.team) {
    if (member.targetSlot === slot) member.targetSlot = null;
    else if (member.targetSlot !== null && member.targetSlot > slot) member.targetSlot -= 1;
  }
  changed();
};

const applyState = (next: PageState): void => {
  Object.assign(state, next);
  changed();
};

const loadPreset = (key: string): void => {
  const preset = TEAM_PRESETS[key];
  if (!preset) return;
  applyState(stateFromLegacy(preset, props.data));
  say(preset.desc);
};

const loadTeam = (id: string): void => {
  const record = teams.value[id];
  if (!record) return;
  const next = stateFromRecord(record, props.data);
  applyState(next);
  say(`已读取队伍「${record.name}」。${droppedNotice(droppedMembers(record.team, next.team, props.data))}`);
};

const saveTeam = async (name: string, id: string): Promise<void> => {
  try {
    const { team, ...settings } = JSON.parse(JSON.stringify(state)) as PageState;
    const result = await props.call("save_team", { id, name, team, state: settings }) as { teams: Record<string, TeamRecord> };
    teams.value = result.teams;
    say(`队伍「${name.trim()}」已保存。`);
  } catch (error) {
    say((error as Error).message);
  }
};

const deleteTeam = async (id: string): Promise<void> => {
  try {
    const result = await props.call("delete_team", { id }) as { teams: Record<string, TeamRecord> };
    teams.value = result.teams;
    say("队伍存档已删除。");
  } catch (error) {
    say((error as Error).message);
  }
};

// 轮数选「自定义」时手动填模拟到多少 AV。
const windowChoice = computed({
  get: () => (state.customAV === null ? String(state.t) : "custom"),
  set: (value: string) => {
    if (value === "custom") {
      state.customAV = windowAV({ ...state, customAV: null }, mode.value);
    } else {
      state.customAV = null;
      state.t = Number(value);
    }
    changed();
  },
});
const setCustomAV = (event: Event): void => {
  const parsed = Number((event.target as HTMLInputElement).value);
  if (!Number.isFinite(parsed) || parsed < 1) return;
  state.customAV = Math.min(MAX_WINDOW_AV, parsed);
  changed();
};

const useSample = (): void => {
  state.team = SAMPLE_TEAM.filter((id) => byId.value.has(id)).map(newMember);
  changed();
};

// ---- 提示 ---- //
const notice = ref("");
let noticeTimer = 0;
const say = (text: string): void => {
  notice.value = text;
  clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => { notice.value = ""; }, 6000);
};

if (props.initialNotice) say(props.initialNotice);

const readBuild = async (id: string): Promise<void> => {
  try {
    const resolved = await props.call("resolve_build", { characterId: id }) as ResolvedBuild;
    const slot = slotOf(id);
    if (slot < 0) return; // 等待期间这个人被移走了，这份结果作废。
    state.team[slot] = memberFromBuild(id, resolved, props.data.game, { lightcones: props.data.lightcones, relicSets: props.data.relicSets });
    changed();
    say(`已读取「${resolved.entry.name}」。累计拉条只记开局部分，勾选的条件效果记在额外速度里，和轴上的效果重复时请手动减掉。`);
  } catch (error) {
    say((error as Error).message);
  }
};

const readRoster = async (id: string): Promise<void> => {
  try {
    const found = await props.call("resolve_roster", { characterId: id }) as { character: RosterCharacter; relics: RelicPiece[]; stats: StatData };
    const slot = slotOf(id);
    if (slot < 0) return;
    state.team[slot] = memberFromRoster(found.character, found.relics, found.stats, props.data.game, { lightcones: props.data.lightcones, relicSets: props.data.relicSets });
    changed();
    say("已读取实际装配：速度和能量恢复效率按「角色与遗器」的面板；翁瓦克、神的瞬息欢愉按真实属性判断。");
  } catch (error) {
    say((error as Error).message);
  }
};

/** 清空读取的装配：恢复成刚加进队伍时的默认设置（读取时也是从默认设置开始填的）。 */
const clearBuild = (id: string): void => {
  const slot = slotOf(id);
  if (slot < 0) return;
  state.team[slot] = newMember(id);
  changed();
  say("已清空读取的装配，恢复成默认设置。");
};

// ---- 逐动覆盖 ---- //
const override = (row: Row): void => {
  if (row.slot === null || row.action === undefined || !view.value) return;
  const member = state.team[row.slot];
  const before = castsOf(view.value, row.slot, row.action);
  const key = String(row.action);
  const previous = member.overrides[key];
  member.overrides[key] = row.type === "skill" ? "basic" : "skill";
  recompute();
  const after = view.value ? castsOf(view.value, row.slot, row.action) : [];
  if (view.value && before.join() === after.join()) {
    // 这一动由角色机制决定（比如强制普攻的状态），改了也没用，别留一个假的覆盖。
    if (previous) member.overrides[key] = previous;
    else delete member.overrides[key];
    recompute();
    say(`${member.id && byId.value.get(member.id)?.name} 的第 ${row.action} 动由角色机制决定，改不了。`);
    return;
  }
  props.onChange();
};

/** 逐动改目标：这一动的技能改给另一位队友。机制定死目标的（改了也没变）不留假的覆盖。 */
const retarget = (row: Row, slot: number): void => {
  if (row.slot === null || row.action === undefined || !view.value) return;
  const member = state.team[row.slot];
  const target = state.team[slot];
  if (!member || !target) return;
  const key = String(row.action);
  const previous = member.targetOverrides?.[key];
  member.targetOverrides = { ...member.targetOverrides, [key]: target.id };
  recompute();
  const after = view.value?.rows.find((item) => item.slot === row.slot && item.action === row.action);
  if (view.value && after?.target !== slot) {
    if (previous) member.targetOverrides[key] = previous;
    else delete member.targetOverrides[key];
    if (Object.keys(member.targetOverrides).length === 0) delete member.targetOverrides;
    recompute();
    say(`${nameOf(member.id)} 的第 ${row.action} 动目标由角色机制决定，改不了。`);
    return;
  }
  props.onChange();
};

const toggleUltimate = (row: Row): void => {
  if (row.slot === null || row.action === undefined) return;
  const member = state.team[row.slot];
  const list = member.manualUltimates ?? defaultManualUltimates(member.id);
  member.manualUltimates = list.includes(row.action) ? list.filter((n) => n !== row.action) : [...list, row.action].sort((a, b) => a - b);
  changed();
};

const toggleHold = (row: Row, holderId: string): void => {
  const holder = state.team.find((member) => member.id === holderId);
  const owner = row.slot === null ? undefined : state.team[row.slot];
  if (!holder || !owner || row.action === undefined) return;
  toggleUltMark(holder, { id: owner.id, action: row.action });
  changed();
};

// ---- 出轴动画 ---- //
// 队伍换人（含第一次出轴、读预设和队伍）时，事件按时间一条条浮现，浮到终结技播大招演出。
// 只改数值不重播：列表原地更新，动画不能拖慢调参。打开页面恢复上次的队伍也不播。
const revealKey = ref(0);
watch(() => state.team.map((member) => member.id).join(","), () => { revealKey.value += 1; });

// ---- 事件列表 ---- //
const activeKey = ref<string | null>(null);
const showUnsupported = ref(false);

const selectRow = (key: string): void => {
  activeKey.value = activeKey.value === key ? null : key;
};

onBeforeUnmount(() => {
  clearTimeout(noticeTimer);
});
</script>

<template>
  <div class="axis-page">
    <section class="card axis-setup">
      <header class="axis-setup-head">
        <h2>全角色行动轴</h2>
        <p class="muted">选角色就能出轴，配置都可以不填。只模拟我方{{ view?.damage ? "" : "，不算伤害" }}。</p>
      </header>

      <div class="axis-battle-config">
        <label class="axis-field">
          <span>模式</span>
          <select v-model="state.modeId" class="input" @change="state.t = Math.min(state.t, mode.maxT); changed()">
            <option v-for="item in data.modes" :key="item.id" :value="item.id">{{ item.name }}</option>
          </select>
        </label>
        <label class="axis-field">
          <span>轮数</span>
          <select v-model="windowChoice" class="input">
            <option v-for="n in mode.maxT + 1" :key="n" :value="String(n - 1)">{{ n - 1 }}T（{{ mode.firstCycleAV + (n - 1) * mode.cycleAV }} AV）</option>
            <option value="custom">自定义 AV</option>
          </select>
        </label>
        <label v-if="state.customAV !== null" class="axis-field">
          <span>模拟到 <small>AV，最多 {{ MAX_WINDOW_AV }}</small></span>
          <input class="input" type="number" min="1" :max="MAX_WINDOW_AV" step="50" :value="state.customAV" @change="setCustomAV" />
        </label>
        <label class="axis-field">
          <span>敌人数量</span>
          <select v-model.number="state.enemyCount" class="input" @change="changed">
            <option v-for="n in 5" :key="n" :value="n">{{ n }} 个</option>
          </select>
        </label>
        <AxisSwitch v-model="state.useTechnique" class="axis-field-switch" label="开战前用秘技" @update:model-value="changed" />
        <label v-if="showLead" class="axis-field">
          <span>进场角色</span>
          <select v-model="state.leadId" class="input" @change="changed">
            <option :value="null">不指定</option>
            <option v-for="id in teamIds" :key="id" :value="id">{{ nameOf(id) }}</option>
          </select>
        </label>
        <div v-if="state.team.length > 1" class="axis-field axis-ult-order">
          <span>同时能开大时</span>
          <div class="axis-ult-order-list">
            <button v-for="(id, index) in ultOrder" :key="id" class="ghost small" type="button" :title="`${nameOf(id)} 排到最前`" @click="toFront(id)">
              <b>{{ index + 1 }}</b>{{ nameOf(id) }}
            </button>
          </div>
        </div>
      </div>

      <div class="axis-team">
        <AnimatePresence :initial="false">
          <TeamCard
            v-for="(member, slot) in state.team"
            :key="member.id"
            :member="member"
            :slot-index="slot"
            :item="byId.get(member.id)"
            :view="view?.units[slot]"
            :teammates="state.team.flatMap((mate, index) => index === slot ? [] : [{ slot: index, name: mate.custom?.name || byId.get(mate.id)?.name || mate.id }])"
            :assist-team="state.team.some((mate) => mate.id === '1510')"
            :lightcones="data.lightcones"
            :caverns="caverns"
            :ornaments="ornaments"
            :saved-build="presets[member.id]?.name ?? null"
            :actual-build="actual[member.id] ?? null"
            @remove="remove(member.id)"
            @change="changed"
            @replace="replace(member.id)"
            @read-build="readBuild(member.id)"
            @read-roster="readRoster(member.id)"
            @clear-build="clearBuild(member.id)"
          />
        </AnimatePresence>
        <motion.button v-if="state.team.length < 4" layout class="axis-add" type="button" :transition="SPRING" @click="pickerSlot = state.team.length">
          ＋ 添加角色<small>{{ state.team.length }}/4</small>
        </motion.button>
      </div>

      <template v-if="view">
        <ElationPanel v-if="view.elation" :elation="view.elation" />

        <div v-if="view.warnings.length" class="axis-warnings" role="status">
          <p v-for="text in view.warnings" :key="text">{{ text }}</p>
        </div>

        <div v-if="view.unsupported.length" class="axis-unsupported">
          <button class="ghost small" type="button" :aria-expanded="showUnsupported" @click="showUnsupported = !showUnsupported">
            有 {{ view.unsupported.length }} 条效果没算进来{{ showUnsupported ? "（收起）" : "（看看是哪些）" }}
          </button>
          <AnimatePresence :initial="false">
            <motion.ul v-if="showUnsupported" :initial="{ height: 0, opacity: 0 }" :animate="{ height: 'auto', opacity: 1 }" :exit="{ height: 0, opacity: 0, transition: QUICK }" :transition="SPRING">
              <li v-for="item in view.unsupported" :key="item.unit + item.mechanic"><b>{{ item.unit }}</b>：{{ item.mechanic }}</li>
            </motion.ul>
          </AnimatePresence>
        </div>
      </template>

      <ElationSettingsPanel v-if="view?.elation" :settings="state.elation" :team="state.team" @change="changed" />
      <TeamLibrary :teams="teams" :team-size="state.team.length" @load-preset="loadPreset" @load-team="loadTeam" @save="saveTeam" @remove="deleteTeam" />
      <ThresholdTool v-if="view" :first-cycle-a-v="mode.firstCycleAV" :cycle-a-v="mode.cycleAV" :max-t="mode.maxT" />
    </section>

    <section class="card axis-result">
      <AnimatePresence :initial="false">
        <motion.p v-if="notice" key="notice" class="axis-notice" role="status" :initial="{ opacity: 0, y: -6 }" :animate="{ opacity: 1, y: 0 }" :exit="{ opacity: 0, transition: QUICK }" :transition="SPRING">{{ notice }}</motion.p>
      </AnimatePresence>

      <div v-if="failure" class="axis-empty axis-failure" role="alert">
        <strong>这组配置算不出来</strong>
        <p>{{ failure }}</p>
      </div>

      <div v-else-if="!view" class="axis-empty">
        <strong>先选一名角色</strong>
        <p>左边添加角色后这里立刻出轴。</p>
        <div class="axis-empty-actions">
          <button class="btn secondary" type="button" @click="useSample">用示例队伍看看</button>
          <button v-for="(preset, key) in TEAM_PRESETS" :key="key" class="axis-chip" type="button" :title="preset.desc" @click="loadPreset(String(key))">{{ preset.short }}</button>
        </div>
      </div>

      <template v-else>
        <div class="axis-result-head">
          <h3>行动轴</h3>
          <span class="axis-result-summary">{{ summary }}</span>
        </div>
        <DamagePanel v-if="view.damage" :damage="view.damage" />
        <EventList v-model:filter="state.rowFilter" @update:filter="onChange" :view="view" :icons="icons" :splashes="splashes" :heads="heads" :clips="clips" :manual-ids="manualIds" :holders="holders" :ids="teamIds" :active-key="activeKey" :reveal-key="revealKey" @override="override" @retarget="retarget" @toggle-ultimate="toggleUltimate" @toggle-hold="toggleHold" @select="selectRow" />
      </template>
    </section>

    <AnimatePresence>
      <CharacterPicker v-if="pickerSlot !== null" key="picker" :characters="data.characters" :taken="takenIds" @pick="pick" @close="pickerSlot = null" />
    </AnimatePresence>
  </div>
</template>
