<script setup lang="ts">
import { AnimatePresence, motion } from "motion-v";
import { computed, ref } from "vue";
import { ENHANCEABLE } from "../../axis-engine/src/battle.ts";
import LightconePicker from "../../ui-shared/src/hsr/LightconePicker.vue";
import RelicSetPicker from "../../ui-shared/src/hsr/RelicSetPicker.vue";
import { iconOf } from "./assets.ts";
import AxisFace from "./AxisFace.vue";
import CustomFields from "./CustomFields.vue";
import {
  coneMattersForAxis,
  defaultManualUltimates,
  needsManualUltimate,
  setMattersForAxis,
  type CatalogItem,
  type PageMember,
  type UnitView,
} from "./model.ts";
import { QUICK, SPRING } from "./motion.ts";

const props = defineProps<{
  member: PageMember;
  slotIndex: number;
  item: CatalogItem | undefined;
  view: UnitView | undefined;
  teammates: { slot: number; name: string }[];
  lightcones: CatalogItem[];
  caverns: CatalogItem[];
  ornaments: CatalogItem[];
  savedBuild: string | null;
  /** 「角色与遗器」里这个角色的概况；没有就是 null。 */
  actualBuild: string | null;
  /** 队里有姬子•启行：显示「助战技」设置（她自己的卡不显示）。 */
  assistTeam: boolean;
}>();
const emit = defineEmits<{ remove: []; change: []; replace: []; readBuild: []; readRoster: []; clearBuild: [] }>();

const open = ref(false);
const member = computed(() => props.member);

const cones = computed(() =>
  props.lightcones
    .filter((cone) => cone.path === props.item?.path)
    .sort((a, b) => (b.rarity ?? 0) - (a.rarity ?? 0) || Number(coneMattersForAxis(String(b.id))) - Number(coneMattersForAxis(String(a.id)))));

const TARGET_LABELS: Record<string, string> = { 1503: "【美学底本】目标", 1511: "【欢愉令使】目标" };
const targetLabel = computed(() => TARGET_LABELS[props.member.id] ?? "技能目标");

const displayName = computed(() => props.member.custom?.name || props.item?.name || props.member.id);

const coneName = computed(() => props.lightcones.find((cone) => String(cone.id) === member.value.lightconeId)?.name);
// 逐动改出招和逐动改目标一起算，「恢复自动」一起清掉。
const overrideCount = computed(() => Object.keys(member.value.overrides).length + Object.keys(member.value.targetOverrides ?? {}).length);

const manualText = computed({
  get: () => (member.value.manualUltimates ?? defaultManualUltimates(member.value.id)).join("，"),
  set: (text: string) => {
    const numbers = text.split(/[,，\s]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0);
    member.value.manualUltimates = numbers;
    emit("change");
  },
});

// 留大：开大点在时间轴卡片上点出来，这里只选方式、看设了几个、一键清空。
const holdCount = computed(() => member.value.ultAfter?.length ?? 0);
// 只在还没设开大点时说怎么设，别的情况旁边已经写着了。
const ultHint = computed(() => (member.value.ultMode === "hold" && holdCount.value === 0 ? "点开时间轴上的卡片，选「在这之后开大」" : ""));
const setUltMode = (event: Event): void => {
  const value = (event.target as HTMLSelectElement).value;
  if (value === "hold") member.value.ultMode = "hold";
  else delete member.value.ultMode;
  emit("change");
};
const clearHolds = (): void => {
  member.value.ultAfter = [];
  emit("change");
};

const numberOr = (value: string, fallback: number): number => {
  const parsed = Number(value);
  return value.trim() === "" || !Number.isFinite(parsed) ? fallback : parsed;
};
const setNumber = (key: "flatSpd" | "err" | "initAdv", event: Event): void => {
  member.value[key] = numberOr((event.target as HTMLInputElement).value, 0);
  emit("change");
};
const setEnergy = (event: Event): void => {
  const text = (event.target as HTMLInputElement).value;
  member.value.initialEnergy = text.trim() === "" ? null : numberOr(text, 0);
  emit("change");
};
/** 带图下拉的小字：会影响行动轴的光锥、套装标「影响轴」（以前写在名字后面的括号里）。 */
const axisNote = (cone: CatalogItem): string | undefined => (coneMattersForAxis(String(cone.id)) ? "影响轴" : undefined);
const setNote = (set: CatalogItem): string | undefined => (setMattersForAxis(String(set.id)) ? "影响轴" : undefined);
const pickGear = (key: "lightconeId" | "cavernId" | "ornamentId", id: string): void => {
  member.value[key] = id;
  emit("change");
};
/** 助战技：「默认」不存字段（老存档、没设过的都按默认）。 */
const setAssist = (event: Event): void => {
  const value = (event.target as HTMLSelectElement).value;
  if (value === "use" || value === "never") member.value.assist = value;
  else delete member.value.assist;
  emit("change");
};
const clearOverrides = (): void => {
  member.value.overrides = {};
  delete member.value.targetOverrides;
  emit("change");
};
</script>

<template>
  <motion.article class="axis-member" layout :initial="{ opacity: 0, y: 12, scale: 0.97 }" :animate="{ opacity: 1, y: 0, scale: 1 }" :exit="{ opacity: 0, scale: 0.96, transition: QUICK }" :transition="SPRING">
    <div class="axis-member-head">
      <button class="axis-avatar" type="button" :title="`更换${displayName}`" @click="emit('replace')">
        <AxisFace :src="iconOf(item)" :name="displayName" />
      </button>
      <div class="axis-member-main">
        <strong>{{ displayName }}</strong>
        <span v-if="view" class="axis-member-stats">
          <span><b>{{ view.openingSpeed.toFixed(1) }}</b> 速</span>
          <span><b>{{ view.actions }}</b> 动</span>
          <span><b>{{ view.ultimates }}</b> 大</span>
          <span v-if="view.extraTurns"><b>{{ view.extraTurns }}</b> 额外</span>
        </span>
        <span class="axis-member-sub">{{ member.eidolon }} 魂<template v-if="ENHANCEABLE.has(member.id) && member.enhanced === false"> · 原版</template><template v-if="coneName"> · {{ coneName }} 叠{{ member.superimpose }}</template></span>
      </div>
      <button class="ghost small" type="button" :aria-expanded="open" @click="open = !open">{{ open ? "收起" : "配置" }}</button>
      <button class="ghost small axis-remove" type="button" :aria-label="`移除${displayName}`" title="移出队伍" @click="emit('remove')">✕</button>
    </div>

    <AnimatePresence :initial="false">
      <motion.div v-if="open" class="axis-member-body" :initial="{ height: 0, opacity: 0 }" :animate="{ height: 'auto', opacity: 1 }" :exit="{ height: 0, opacity: 0, transition: QUICK }" :transition="SPRING">
        <CustomFields v-if="member.custom" :custom="member.custom" @change="emit('change')" />
        <div class="axis-fields">
          <div v-if="savedBuild !== null" class="axis-field axis-field-wide axis-build">
            <span>我的配装：{{ savedBuild }}<template v-if="member.buildName && member.buildName === savedBuild">（已读取）</template></span>
            <!-- 读过以后一直显示「已读取」，按钮换成清空（2026-11-05 用户要求） -->
            <button v-if="member.buildName && member.buildName === savedBuild" class="ghost small" type="button" title="去掉读取的装配，恢复成默认设置" @click="emit('clearBuild')">清空</button>
            <button v-else class="btn secondary small" type="button" @click="emit('readBuild')">读取</button>
          </div>
          <div v-if="actualBuild !== null" class="axis-field axis-field-wide axis-build">
            <span>实际装配：{{ actualBuild }}<template v-if="member.buildName === '实际装配'">（已读取）</template></span>
            <button v-if="member.buildName === '实际装配'" class="ghost small" type="button" title="去掉读取的装配，恢复成默认设置" @click="emit('clearBuild')">清空</button>
            <button v-else class="btn secondary small" type="button" title="用「角色与遗器」里的真实属性：速度、能量恢复效率按面板，看属性的条件按真实值判断" @click="emit('readRoster')">读取</button>
          </div>
          <label class="axis-field">
            <span>星魂</span>
            <select v-model.number="member.eidolon" class="input" @change="emit('change')">
              <option v-for="n in 7" :key="n" :value="n - 1">{{ n - 1 }} 魂</option>
            </select>
          </label>
          <label v-if="ENHANCEABLE.has(member.id)" class="axis-field" title="3.4 版本的老角色加强，游戏里可以不强化">
            <span>角色强化</span>
            <select class="input" :value="member.enhanced === false ? 'off' : 'on'" @change="member.enhanced = ($event.target as HTMLSelectElement).value !== 'off'; emit('change')">
              <option value="on">已强化</option>
              <option value="off">没强化（原版）</option>
            </select>
          </label>
          <label v-if="assistTeam && member.id !== '1510'" class="axis-field" title="默认只让能白用的队友（开拓同行，E2 起所有人）里第一个用的那位用；不是开拓同行的人用了会少一动">
            <span>助战技</span>
            <select class="input" :value="member.assist ?? 'auto'" @change="setAssist($event)">
              <option value="auto">默认</option>
              <option value="use">有次数就用</option>
              <option value="never">不用</option>
            </select>
          </label>
          <label class="axis-field">
            <span>额外速度 <small>副词条和鞋子</small></span>
            <input class="input" type="number" step="0.1" :value="member.flatSpd" @input="setNumber('flatSpd', $event)" />
          </label>
          <label class="axis-field">
            <span>能量恢复效率 <small>%</small></span>
            <input class="input" type="number" step="0.1" :value="member.err" title="绳子和副词条，光锥和套装给的不用填" @input="setNumber('err', $event)" />
          </label>
          <label class="axis-field">
            <span>开局能量 <small>留空按默认</small></span>
            <input class="input" type="number" min="0" :value="member.initialEnergy ?? ''" placeholder="默认" @input="setEnergy" />
          </label>
          <label class="axis-field axis-field-wide">
            <span>开局拉条 <small>%，光锥和套装给的不用填</small></span>
            <input class="input" type="number" min="0" max="100" :value="member.initAdv" @input="setNumber('initAdv', $event)" />
          </label>
          <div class="axis-field axis-field-wide">
            <span>光锥</span>
            <LightconePicker :button-id="`axis-cone-${slotIndex}`" button-class="input" :cones="cones" :value="member.lightconeId" :empty-label="member.id === '1511' ? '默认：专武《当第一声「阿哈」响起》叠 1' : '不带光锥'" :note="axisNote" @pick="pickGear('lightconeId', $event)" />
          </div>
          <label class="axis-field">
            <span>叠影</span>
            <select v-model.number="member.superimpose" class="input" :disabled="!member.lightconeId" @change="emit('change')">
              <option v-for="n in 5" :key="n" :value="n">叠 {{ n }}</option>
            </select>
          </label>
          <label class="axis-field">
            <span>默认出招</span>
            <select v-model="member.rotation" class="input" @change="emit('change')">
              <option :value="null">自动</option>
              <option value="skill">优先战技</option>
              <option value="basic">优先普攻</option>
            </select>
          </label>
          <div class="axis-field axis-field-wide">
            <span>遗器 4 件</span>
            <RelicSetPicker :button-id="`axis-cavern-${slotIndex}`" button-class="input" kind="four" :sets="caverns" :value="member.cavernId" empty-label="不计" :describe="setNote" @pick="pickGear('cavernId', $event)" />
          </div>
          <div class="axis-field axis-field-wide">
            <span>位面饰品</span>
            <RelicSetPicker :button-id="`axis-ornament-${slotIndex}`" button-class="input" kind="ornament" :sets="ornaments" :value="member.ornamentId" empty-label="不计" :describe="setNote" @pick="pickGear('ornamentId', $event)" />
          </div>
          <label v-if="teammates.length > 0" class="axis-field axis-field-wide">
            <span>{{ targetLabel }} <small>给队友放技能时指定谁</small></span>
            <select v-model="member.targetSlot" class="input" @change="emit('change')">
              <option :value="null">自动</option>
              <option v-for="mate in teammates" :key="mate.slot" :value="mate.slot">{{ mate.name }}</option>
            </select>
          </label>
          <label v-if="needsManualUltimate(member.id)" class="axis-field axis-field-wide">
            <span>第几动后开大 <small>算不出开大时点，按实际填，多次用逗号隔开</small></span>
            <input v-model.lazy="manualText" class="input" />
          </label>
          <label v-else class="axis-field axis-field-wide">
            <span>开大 <small v-if="ultHint">{{ ultHint }}</small></span>
            <select :value="member.ultMode === 'hold' ? 'hold' : 'auto'" class="input" @change="setUltMode">
              <option value="auto">有大就开</option>
              <option value="hold">留大，到开大点再开</option>
            </select>
          </label>
          <div v-if="member.ultMode === 'hold' && holdCount > 0" class="axis-field axis-field-wide axis-build">
            <span>{{ holdCount }} 个开大点</span>
            <button class="ghost small" type="button" @click="clearHolds">清空</button>
          </div>
          <div v-if="overrideCount > 0" class="axis-field axis-field-wide axis-build">
            <span>改过 {{ overrideCount }} 处出招或目标</span>
            <button class="ghost small" type="button" @click="clearOverrides">恢复自动</button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  </motion.article>
</template>
