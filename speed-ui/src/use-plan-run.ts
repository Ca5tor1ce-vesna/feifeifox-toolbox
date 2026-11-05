/* 配速查询 · 发起计算：约 200ms 防抖，只认最新一次的结果；算完通知订阅者（效果勾选、结论动画），
 * 自己不碰其他区块。失败时保留上一次的结果，错误交给结论区显示。 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ref, shallowRef } from "vue";
import type { Call, PlanState } from "./plan-state.ts";

export type ResultListener = (res: any) => void | Promise<void>;
interface RunHost {
  call: Call;
  persistence?: { capture?: () => void; restoreUI?: (root: HTMLElement) => void } | null;
  root: HTMLElement;
}

export function usePlanRun(s: PlanState, host: RunHost) {
  const { state, isCustom } = s;
  const result = shallowRef<any>(null);
  const planError = ref("");
  const listeners: ResultListener[] = [];
  /** 订阅「算完了」：按注册顺序依次执行，前一个的异步做完才轮到下一个。 */
  const onResult = (listener: ResultListener): void => { listeners.push(listener); };
  let timer = 0;
  let runSeq = 0;
  let disposed = false;

  function schedule(): void {
    clearTimeout(timer);
    timer = window.setTimeout(() => void run(), 200);
  }
  function buildPlanPayload(): any {
    const payload: any = {
      characterId: state.characterId,
      lightconeId: state.lightconeId || null,
      superimpose: state.superimpose,
      eidolon: state.eidolon,
      enabledEffects: state.enabled,
      relic: state.relic,
      advance: state.advance,
      target: state.target,
      simulation: state.simulation,
    };
    if (isCustom.value) payload.customCharacter = { ...state.custom };
    return payload;
  }

  const modeOptions = ref<{ value: string; label: string }[]>([]);
  const tOptions = ref<{ value: string; label: string; title: string }[]>([]);
  /** 模式下拉第一次算完才有选项；T 数跟着模式变，选不到就退回第一个。 */
  function applyTargetOptions(res: any): void {
    const tables = res.tables || [];
    if (!modeOptions.value.length) modeOptions.value = tables.map((table: any) => ({ value: table.id, label: table.name }));
    const known = new Set(tables.map((table: any) => table.id));
    state.target.mode = state.target.mode && known.has(state.target.mode) ? state.target.mode : tables[0]?.id;
    const table = tables.find((item: any) => item.id === state.target.mode) || tables[0];
    const firstAV = Number(table?.firstCycleAV ?? 150);
    const stepAV = Number(table?.cycleAV ?? 100);
    const values: number[] = table?.tValues || [0];
    tOptions.value = values.map((t) => ({ value: String(t), label: `${t} T`, title: `${firstAV + t * stepAV} AV` }));
    if (!values.some((t) => String(t) === String(state.target.t))) state.target.t = values[0] ?? 0;
  }

  async function run(): Promise<void> {
    if (disposed) return;
    const seq = ++runSeq;
    let res: any;
    try {
      host.persistence?.capture?.();
      res = await host.call("plan", buildPlanPayload());
    } catch (err) {
      if (disposed || seq !== runSeq) return;
      // 和以前一样保留上一次算出的结果：右栏的数字和页签由样式藏起来，左栏的效果列表照常显示。
      planError.value = (err as Error).message;
      return;
    }
    if (disposed || seq !== runSeq) return;
    planError.value = "";
    state.enabled = res.effects.enabled;
    applyTargetOptions(res);
    result.value = res;
    for (const listener of listeners) await listener(res);
    host.persistence?.restoreUI?.(host.root);
  }

  function dispose(): void {
    disposed = true;
    runSeq++;
    clearTimeout(timer);
  }

  return { result, planError, schedule, run, onResult, modeOptions, tOptions, dispose };
}

export type PlanRun = ReturnType<typeof usePlanRun>;
