<script setup lang="ts">
/* 手动新增或修改一件遗器：套装、部位、稀有度、等级、主词条、最多 4 条副词条（词条、次数、档位），数值实时算出来。 */
import { computed, reactive } from "vue";
import { propertyName, propertyValue, SLOT_NAMES } from "../../ui-shared/src/stats/labels.ts";
import type { RelicPiece, Slot, StatData } from "../../ui-shared/src/stats/types.ts";
import type { Catalog } from "./use-roster.ts";

const props = defineProps<{ relic: RelicPiece | null; data: StatData; catalog: Catalog; owners: { id: string; name: string }[] }>();
const emit = defineEmits<{ save: [relic: Partial<RelicPiece>]; cancel: [] }>();

const SLOT_INDEX: Record<Slot, number> = { HEAD: 1, HAND: 2, BODY: 3, FOOT: 4, NECK: 5, OBJECT: 6 };
const start = props.relic ? props.data.pieces.get(props.relic.pieceId) : null;
const form = reactive({
  setId: start?.setId ?? "",
  slot: (start?.slot ?? "HEAD") as Slot,
  rarity: start?.rarity ?? 5,
  level: props.relic?.level ?? 15,
  mainAffix: props.relic?.mainAffix ?? "",
  subs: (props.relic?.subAffixes ?? []).map((s) => ({ ...s })),
  equippedBy: props.relic?.equippedBy ?? "",
});

const sets = computed(() => [...props.catalog.relicSets.values()].sort((a, b) => a.name.localeCompare(b.name, "zh")));
const slots = computed<Slot[]>(() => (form.setId.startsWith("3") ? ["NECK", "OBJECT"] : ["HEAD", "HAND", "BODY", "FOOT"]));
const pieceId = computed(() => `${form.rarity + 1}${form.setId}${SLOT_INDEX[form.slot]}`);
const piece = computed(() => props.data.pieces.get(pieceId.value));
const mains = computed(() => Object.entries(props.data.mainAffixes[piece.value?.mainGroup ?? ""] ?? {}).map(([id, a]) => ({ id, name: propertyName(a.type), value: propertyValue(a.type, a.base + a.step * form.level) })));
const subGroup = computed(() => props.data.subAffixes[piece.value?.subGroup ?? ""] ?? {});
const subOptions = computed(() => Object.entries(subGroup.value).map(([id, a]) => ({ id, name: propertyName(a.type) })));
const subValue = (sub: { affix: string; count: number; step: number }): string => {
  const a = subGroup.value[sub.affix];
  return a ? propertyValue(a.type, a.base * sub.count + a.step * sub.step) : "";
};
function fixSlot(): void {
  if (!slots.value.includes(form.slot)) form.slot = slots.value[0];
  if (!mains.value.some((m) => m.id === form.mainAffix)) form.mainAffix = mains.value[0]?.id ?? "";
}
const problem = computed(() => {
  if (!form.setId) return "先选套装。";
  if (!piece.value) return "这个套装没有这个稀有度的遗器。";
  if (!mains.value.some((m) => m.id === form.mainAffix)) return "选一个主词条。";
  if (form.level < 0 || form.level > form.rarity * 3) return `等级要在 0 到 ${form.rarity * 3} 之间。`;
  const ids = form.subs.map((s) => s.affix);
  if (ids.some((id) => !id)) return "副词条没选完。";
  if (new Set(ids).size !== ids.length) return "副词条不能重复。";
  if (form.subs.some((s) => s.step > s.count * 2)) return "档位不能超过次数的 2 倍。";
  return "";
});
function save(): void {
  if (problem.value) return;
  emit("save", {
    id: props.relic?.id, pieceId: pieceId.value, level: form.level, mainAffix: form.mainAffix,
    subAffixes: form.subs.map((s) => ({ affix: s.affix, count: s.count, step: s.step })), equippedBy: form.equippedBy || null,
  });
}
</script>

<template>
  <div class="rs-modal" role="dialog" aria-modal="true" @click.self="emit('cancel')">
    <form class="rs-modal-box rs-editor" @submit.prevent="save">
      <h3>{{ relic ? "修改遗器" : "新增遗器" }}</h3>
      <div class="rs-fields">
        <label class="field rs-wide"><span>套装</span>
          <select v-model="form.setId" class="input" @change="fixSlot"><option value="">选择套装…</option><option v-for="s in sets" :key="s.id" :value="s.id">{{ s.name }}</option></select></label>
        <label class="field"><span>部位</span>
          <select v-model="form.slot" class="input" @change="fixSlot"><option v-for="s in slots" :key="s" :value="s">{{ SLOT_NAMES[s] }}</option></select></label>
        <label class="field"><span>稀有度</span>
          <select v-model.number="form.rarity" class="input" @change="fixSlot"><option v-for="n in [5, 4, 3, 2]" :key="n" :value="n">{{ n }} 星</option></select></label>
        <label class="field"><span>等级</span><input v-model.number="form.level" class="input" type="number" min="0" :max="form.rarity * 3" /></label>
        <label class="field rs-wide"><span>主词条</span>
          <select v-model="form.mainAffix" class="input"><option v-for="m in mains" :key="m.id" :value="m.id">{{ m.name }} {{ m.value }}</option></select></label>
      </div>
      <h4>副词条</h4>
      <div v-for="(sub, i) in form.subs" :key="i" class="rs-sub-row">
        <select v-model="sub.affix" class="input" aria-label="副词条"><option value="">选择…</option><option v-for="o in subOptions" :key="o.id" :value="o.id">{{ o.name }}</option></select>
        <label>出现<input v-model.number="sub.count" class="input" type="number" min="1" max="6" />次</label>
        <label>档位<input v-model.number="sub.step" class="input" type="number" min="0" :max="sub.count * 2" /></label>
        <b>{{ subValue(sub) }}</b>
        <button type="button" class="btn secondary small" @click="form.subs.splice(i, 1)">删</button>
      </div>
      <button v-if="form.subs.length < 4" type="button" class="btn secondary small" @click="form.subs.push({ affix: '', count: 1, step: 1 })">加一条副词条</button>
      <p class="muted small">「出现几次」= 初始 1 次 + 强化时命中的次数（游戏里词条旁的 »2 就是强化命中 2 次，出现 3 次）。档位是每次 0~2 档的总和，不清楚就填和次数一样的数（平均值）。</p>
      <label class="field"><span>穿在</span>
        <select v-model="form.equippedBy" class="input"><option value="">没穿（放在库里）</option><option v-for="o in owners" :key="o.id" :value="o.id">{{ o.name }}</option></select></label>
      <p v-if="problem" class="error-text small">{{ problem }}</p>
      <div class="rs-modal-actions">
        <button type="button" class="btn secondary" @click="emit('cancel')">取消</button>
        <button type="submit" class="btn" :disabled="!!problem">保存</button>
      </div>
    </form>
  </div>
</template>
