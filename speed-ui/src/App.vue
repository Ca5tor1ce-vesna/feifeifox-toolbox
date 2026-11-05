<script setup lang="ts">
/* 配速查询：左边按步骤配装，右边固定显示结论。
 * 状态和逻辑在 page.ts，各区块是单独的组件；这里只负责摆放。 */
import BonusPanel from "./BonusPanel.vue";
import CharacterPanel from "./CharacterPanel.vue";
import HeroPanel from "./HeroPanel.vue";
import PresetPanel from "./PresetPanel.vue";
import ResultTabs from "./ResultTabs.vue";
import TargetPanel from "./TargetPanel.vue";
import { createSpeedPage, provideSpeedPage, type SpeedDraft } from "./page.ts";

export type { SpeedDraft };

const props = defineProps<{
  catalog: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  call: (action: string, payload?: unknown) => Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  draft?: SpeedDraft | null;
  persistence?: { capture?: () => void; restoreUI?: (root: HTMLElement) => void } | null;
  root: HTMLElement;
  teamLink?: string | null;
  expose: (getState: () => unknown) => void;
}>();

const page = createSpeedPage(props);
provideSpeedPage(page);
const { theme, planError } = page;
</script>

<template>
  <div class="sp" :data-theme="theme">
    <div class="sp-left">
      <CharacterPanel />
      <BonusPanel />
    </div>

    <aside class="sp-right" :class="{ 'has-plan-error': !!planError }">
      <HeroPanel />
      <TargetPanel />
      <PresetPanel />
      <ResultTabs />
    </aside>
  </div>
</template>
