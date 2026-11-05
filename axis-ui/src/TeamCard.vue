<script setup lang="ts">
import { AnimatePresence, motion } from "motion-v";
import { computed, ref } from "vue";
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
const overrideCount = computed(() => Object.keys(member.value.overrides).length);

const manualText = computed({
  get: () => (member.value.manualUltimates ?? defaultManualUltimates(member.value.id)).join("，"),
  set: (text: string) => {
    const numbers = text.split(/[,，\s]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0);
    member.value.manualUltimates = numbers;
    emit("change");
  },
});

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
const clearOverrides = (): void => {
  member.value.overrides = {};
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
        <span class="axis-member-sub">{{ member.eidolon }} 魂<template v-if="coneName"> · {{ coneName }} 叠{{ member.superimpose }}</template></span>
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
          <label class="axis-field axis-field-wide">
            <span>光锥</span>
            <select v-model="member.lightconeId" class="input" @change="emit('change')">
              <option value="">{{ member.id === "1511" ? "默认：专武《当第一声「阿哈」响起》叠 1" : "不带光锥" }}</option>
              <option v-for="cone in cones" :key="cone.id" :value="String(cone.id)">{{ cone.name }}{{ coneMattersForAxis(String(cone.id)) ? "（影响轴）" : "" }}</option>
            </select>
          </label>
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
          <label class="axis-field axis-field-wide">
            <span>遗器 4 件</span>
            <select v-model="member.cavernId" class="input" @change="emit('change')">
              <option value="">不计</option>
              <option v-for="set in caverns" :key="set.id" :value="String(set.id)">{{ set.name }}{{ setMattersForAxis(String(set.id)) ? "（影响轴）" : "" }}</option>
            </select>
          </label>
          <label class="axis-field axis-field-wide">
            <span>位面饰品</span>
            <select v-model="member.ornamentId" class="input" @change="emit('change')">
              <option value="">不计</option>
              <option v-for="set in ornaments" :key="set.id" :value="String(set.id)">{{ set.name }}{{ setMattersForAxis(String(set.id)) ? "（影响轴）" : "" }}</option>
            </select>
          </label>
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
          <div v-if="overrideCount > 0" class="axis-field axis-field-wide axis-build">
            <span>改过 {{ overrideCount }} 动的出招</span>
            <button class="ghost small" type="button" @click="clearOverrides">恢复自动</button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  </motion.article>
</template>
