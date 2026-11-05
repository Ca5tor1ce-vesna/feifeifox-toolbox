/* 配速查询 · 按「角色与遗器」的实际装配算（2026-11-05 群里反馈：导入过数据，遗器和副词条那几块就用不着手填了）。
 *
 * 这个角色在「角色与遗器」里、身上穿着遗器时，默认（state.rosterMode = "auto"）用它身上的遗器：4 件套、外圈、速度鞋、副词条速度，
 * 再用「其它固定速度」补齐两边算法的差额，算出的初始速度就等于面板速度；页面把这几块收成一行。
 * 光锥、叠影、星魂也按实际的填，之后照样可以换着试；用户点「手动改」切到 manual，照常手填；换角色回到 auto。
 * 只动面板相关的几项：开大次数、「其它速度 %」这些是战斗里的条件，保留用户填的。
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ref } from "vue";
import type { Call, PlanState } from "./plan-state.ts";

interface LinkHost {
  call: Call;
  /** 套用后刷新立绘和重算。 */
  updateSplash: () => void;
  run: () => Promise<void>;
}

export function useRosterLink(s: PlanState, host: LinkHost) {
  const { state, isCustom, syncForm } = s;
  /** 正在按实际装配算：面板速度和换算时的说明。 */
  const rosterLinked = ref<{ panelSpeed: number; notes: string[] } | null>(null);
  /** 「角色与遗器」里这个角色有没有穿着遗器（手动模式下决定要不要给「改回实际装配」）。 */
  const rosterHas = ref(false);
  const rosterError = ref("");
  let seq = 0;

  /**
   * 读一次实际装配并按模式套上（换角色、打开页面、点「改回」时）：光锥、叠影、星魂和遗器都按实际的。
   * 效果勾选只在光锥真换了时恢复默认，回到页面不丢勾选。返回有没有套上。
   */
  async function linkRoster(): Promise<boolean> {
    const mine = ++seq;
    rosterError.value = "";
    if (isCustom.value) {
      rosterLinked.value = null;
      rosterHas.value = false;
      return false;
    }
    let filled: any;
    try {
      filled = await host.call("roster_speed_config", { characterId: state.characterId, optional: true });
    } catch (err) {
      if (mine !== seq) return false;
      rosterLinked.value = null;
      rosterHas.value = false;
      rosterError.value = `没能读「角色与遗器」里的装配：${(err as Error).message}`;
      return false;
    }
    if (mine !== seq) return false;
    rosterHas.value = !!filled;
    if (!filled || state.rosterMode === "manual") {
      rosterLinked.value = null;
      return false;
    }
    const config = filled.config;
    if (String(state.lightconeId || "") !== String(config.lightconeId || "")) state.enabled = null;
    state.lightconeId = config.lightconeId || "";
    state.superimpose = config.superimpose ?? 1;
    state.eidolon = config.eidolon ?? 0;
    const { speedBoots, fourPieceId, ornamentIds, substatSpeed, customFlat } = config.relic;
    state.relic = { ...state.relic, speedBoots, fourPieceId, ornamentIds, substatSpeed, customFlat };
    syncForm();
    rosterLinked.value = { panelSpeed: Number(filled.panelSpeed), notes: filled.notes || [] };
    return true;
  }

  /** 「手动改」：保留现在填好的数，展开手填。 */
  function rosterManual(): void {
    state.rosterMode = "manual";
    rosterLinked.value = null;
  }
  /** 套用我的配速、自动推荐时：用户自己选了一套，不再按实际装配。 */
  function leaveRoster(): void {
    if (rosterLinked.value) rosterManual();
  }
  /** 「改回实际装配」。 */
  async function rosterBack(): Promise<void> {
    state.rosterMode = "auto";
    if (await linkRoster()) {
      host.updateSplash();
      await host.run();
    }
  }

  return { rosterLinked, rosterHas, rosterError, linkRoster, rosterManual, leaveRoster, rosterBack };
}
