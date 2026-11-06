/* 配速查询 · 输入绑定：每个字段一个控件，改了就写进 state 并安排重算。 */
import { computed } from "vue";
import type { PlanState } from "./plan-state.ts";
import type { PlanRun } from "./use-plan-run.ts";

export const numberOptions = (values: number[], suffix = ""): { value: string; label: string }[] => values.map((n) => ({ value: String(n), label: `${n}${suffix}` }));

export function useInputs(s: PlanState, plan: PlanRun, resetTableView: () => void) {
  const { state, form } = s;
  const { schedule, run } = plan;

  const substatLimit = computed(() => (state.relic.speedBoots ? 78 : 93.6));
  const substatInvalid = computed(() => form.substat !== "" && (Number(form.substat) < 0 || Number(form.substat) > substatLimit.value));

  type FormKey = keyof typeof form;
  function bindNumber(key: FormKey, apply: (value: string) => void) {
    return (value: string): void => {
      form[key] = value;
      apply(value);
      schedule();
    };
  }
  const onFourUlts = bindNumber("fourUlts", (v) => { state.relic.fourPieceUlts = Number(v || 0); });
  const onSubstat = bindNumber("substat", (v) => { state.relic.substatSpeed = Number(v || 0); });
  const onCustomPct = bindNumber("customPct", (v) => { state.relic.customPct = Number(v || 0); });
  const onCustomFlat = bindNumber("customFlat", (v) => { state.relic.customFlat = Number(v || 0); });
  const onConeUlts = bindNumber("coneUlts", (v) => { state.advance.coneUlts = Number(v || 0); });
  const onAdvCustom = bindNumber("advCustom", (v) => { state.advance.custom = Number(v || 0); });
  // 0 = 进战即开大（开大类效果从第 1 次行动起生效）
  const onFirstUlt = bindNumber("firstUltAction", (v) => { state.simulation.firstUltAction = Math.max(0, v === "" ? 1 : Number(v)); });
  const onActions = bindNumber("targetActions", (v) => { state.target.actions = Math.max(1, Number(v || 1)); });
  const onCustomAV = bindNumber("customAV", (v) => { state.target.customAV = Math.max(0, Number(v || 0)); });

  function onCheck(apply: (on: boolean) => void) {
    return (event: Event): void => {
      apply((event.target as HTMLInputElement).checked);
      schedule();
    };
  }
  const onSpeedBoots = onCheck((on) => { state.relic.speedBoots = on; });
  const onUltTargetsAlly = onCheck((on) => { state.relic.ultTargetsAlly = on; });
  const onExcludeLastUlt = onCheck((on) => { state.advance.excludeLastUlt = on; });

  function onSuperimpose(value: string): void { state.superimpose = Number(value); state.enabled = null; schedule(); }
  function onEidolon(value: string): void { state.eidolon = Number(value); state.enabled = null; schedule(); }
  function onEnhanced(value: string): void { state.enhanced = value !== "off"; state.enabled = null; schedule(); }
  function pickCone(id: string): void { state.lightconeId = id; state.enabled = null; schedule(); }
  function pickFourPiece(id: string): void { state.relic.fourPieceId = id; schedule(); }
  function pickOrnament(id: string): void { state.relic.ornamentIds = [id, ""]; schedule(); }
  function onMode(value: string): void {
    state.target.mode = value || state.target.mode;
    state.target.t = 0;
    state.target.customAV = 0;
    form.customAV = "0";
    resetTableView();
    void run();
  }
  function onTargetT(value: string): void {
    state.target.t = Number(value);
    state.target.customAV = 0;
    form.customAV = "0";
    schedule();
  }
  function quickAV(av: number): void {
    state.target.customAV = av;
    form.customAV = String(av);
    schedule();
  }

  return {
    substatLimit, substatInvalid, numberOptions,
    onFourUlts, onSubstat, onCustomPct, onCustomFlat, onConeUlts, onAdvCustom, onFirstUlt, onActions, onCustomAV,
    onSpeedBoots, onUltTargetsAlly, onExcludeLastUlt, onSuperimpose, onEidolon, onEnhanced, pickCone, pickFourPiece, pickOrnament, onMode, onTargetT, quickAV,
  };
}
