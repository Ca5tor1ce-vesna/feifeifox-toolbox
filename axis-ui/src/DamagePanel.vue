<script setup lang="ts">
import { formatDamage, type DamageView } from "./damage.ts";

defineProps<{ damage: DamageView }>();
const percent = (share: number): string => `${(share * 100).toFixed(1)}%`;
</script>

<template>
  <section class="axis-damage" aria-label="伤害总览">
    <p v-if="damage.preview" class="axis-damage-preview" role="status">这是看排版用的示例数字，不是真实伤害。</p>
    <div class="axis-damage-main">
      <div class="axis-elation-stat"><span>总伤害</span><b>{{ formatDamage(damage.total) }}</b></div>
      <div class="axis-elation-stat"><span>每 100 AV</span><b>{{ formatDamage(damage.per100AV) }}</b></div>
    </div>
    <div class="axis-damage-bar" aria-hidden="true">
      <i v-for="unit in damage.units" :key="unit.slot" :class="`is-slot-${unit.slot}`" :style="{ width: percent(unit.share) }"></i>
    </div>
    <ul class="axis-damage-units">
      <li v-for="unit in damage.units" :key="unit.slot">
        <i :class="`is-slot-${unit.slot}`" aria-hidden="true"></i>
        <span>{{ unit.name }}</span>
        <small>{{ unit.hits }} 次</small>
        <b>{{ formatDamage(unit.total) }}</b>
        <em>{{ percent(unit.share) }}</em>
      </li>
    </ul>
    <p v-if="damage.noPanel.length" class="axis-damage-note">{{ damage.noPanel.join("、") }}没读实际装配，按默认面板算，读取后才准。</p>
    <p v-if="damage.missing.length" class="axis-damage-note">还没有资料、没算进总数：{{ damage.missing.join("、") }}。</p>
  </section>
</template>
