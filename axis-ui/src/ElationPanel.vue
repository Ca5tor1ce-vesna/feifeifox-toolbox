<script setup lang="ts">
import { computed } from "vue";
import type { ElationView } from "./model.ts";

const props = defineProps<{ elation: ElationView }>();
const changed = computed(() => Math.abs(props.elation.finalSpeed - props.elation.speed) > 0.05);
</script>

<template>
  <section class="axis-elation" aria-label="阿哈时刻">
    <div class="axis-elation-main">
      <div class="axis-elation-stat">
        <span>阿哈时刻速度</span>
        <b>{{ elation.speed.toFixed(1) }}</b>
        <small v-if="changed">最后 {{ elation.finalSpeed.toFixed(1) }}</small>
      </div>
      <div class="axis-elation-stat">
        <span>单次间隔</span>
        <b>{{ elation.singleAV.toFixed(1) }} <em>AV</em></b>
      </div>
      <div class="axis-elation-stat">
        <span>触发</span>
        <b>{{ elation.triggers }} <em>次</em></b>
        <small v-if="elation.extraTriggers">另有额外回合 {{ elation.extraTriggers }} 次</small>
      </div>
      <div class="axis-elation-stat">
        <span>笑点 产出 / 消耗</span>
        <b>{{ elation.punchlineGranted.toFixed(0) }} <em>/ {{ elation.punchlineConsumed.toFixed(0) }}</em></b>
      </div>
    </div>
    <div class="axis-elation-counts">
      <span v-for="item in elation.counts" :key="item.label" class="axis-event-chip">{{ item.label }}前 {{ item.count }} 次</span>
    </div>
    <p class="axis-elation-formula" title="速度构成">{{ elation.formula }}</p>
  </section>
</template>
