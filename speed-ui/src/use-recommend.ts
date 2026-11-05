/* 配速查询 · 自动推荐配装：在能用的光锥和遗器里穷举，套用时连同推荐的假设一起写回。 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { shallowRef } from "vue";
import type { Call, PlanState } from "./plan-state.ts";

export function useRecommend(s: PlanState, call: Call, run: () => Promise<void>) {
  const { state, form, isCustom, syncForm } = s;
  const recommend = shallowRef<{ loading?: boolean; error?: string; data?: any } | null>(null);

  async function runRecommend(): Promise<void> {
    recommend.value = { loading: true };
    try {
      const payload: any = {
        characterId: state.characterId,
        target: state.target,
        relic: { speedBoots: state.relic.speedBoots },
        superimpose: Number(form.recS || 1),
        coneUlts: Number(form.recConeUlts || 0),
        fourPieceUlts: Number(form.recFourUlts || 0),
        excludeLastUlt: !!state.advance.excludeLastUlt,
        maxResults: 10,
      };
      if (isCustom.value) payload.customCharacter = { ...state.custom };
      recommend.value = { data: await call("recommend", payload) };
    } catch (err) {
      recommend.value = { error: (err as Error).message };
    }
  }
  function applyRecommend(item: any): void {
    const assumptions = recommend.value?.data?.assumptions || {};
    state.lightconeId = item.coneId || "";
    state.relic.fourPieceId = item.fourPieceId || "";
    state.relic.ornamentIds = [...item.ornamentIds];
    state.relic.speedBoots = !!assumptions.speedBoots;
    // 推荐按它自己的假设算（叠影、风套/光锥开大次数），套用时一起同步
    state.superimpose = Number(assumptions.superimpose || state.superimpose);
    state.relic.fourPieceUlts = Number(assumptions.fourPieceUlts || 0);
    state.advance.coneUlts = Number(assumptions.coneUlts || 0);
    syncForm();
    void run();
  }

  return { recommend, runRecommend, applyRecommend };
}
