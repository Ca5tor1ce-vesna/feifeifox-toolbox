/* 配速查询页面：把各部分组装起来（2026-11-04 按职责拆开）。
 *
 * App.vue 调 createSpeedPage(props) 建一份，provide 给各区块组件；区块组件用 useSpeedPage() 取。
 * 每个部分只管一件事，彼此通过 PlanState（数据）和 PlanRun（计算 + 「算完了」通知）联系：
 *   plan-state      要算的配置和输入框原文
 *   use-gear        光锥与遗器选项            use-splash       立绘
 *   use-steps       步骤卡片折叠              use-plan-run     发起计算、防抖、只认最新结果
 *   use-effects     速度效果勾选与明细        use-hero         结论区和数字动画
 *   use-result-tabs 结果页签与各模式表        use-summaries    折叠时的一行摘要
 *   use-inputs      输入框和选择框            use-presets      我的配装
 *   use-recommend   自动推荐              use-roster-link  按「角色与遗器」的实际装配算
 * 这里只负责换角色这种要牵动好几块的操作，以及启动顺序。
 * 计算在 calc.ts（tests/pages/speed-oracle.test.ts 对拍）；页面上的 id 和旧界面一样，浏览器验收脚本靠它们。
 */
import { inject, onBeforeUnmount, onMounted, provide, ref, type InjectionKey } from "vue";
import type CharacterDialog from "./CharacterDialog.vue";
import { stopRolls } from "./motion.ts";
import { createPlanState, type Call, type SpeedDraft } from "./plan-state.ts";
import { useEffects } from "./use-effects.ts";
import { useGear } from "./use-gear.ts";
import { useHero } from "./use-hero.ts";
import { useInputs } from "./use-inputs.ts";
import { usePlanRun } from "./use-plan-run.ts";
import { usePresets } from "./use-presets.ts";
import { useRecommend } from "./use-recommend.ts";
import { useRosterLink } from "./use-roster-link.ts";
import { TABS, useResultTabs } from "./use-result-tabs.ts";
import { useSplash } from "./use-splash.ts";
import { useSteps } from "./use-steps.ts";
import { useSummaries } from "./use-summaries.ts";

export type { SpeedDraft };

export interface SpeedPageProps {
  catalog: unknown;
  call: Call;
  draft?: SpeedDraft | null;
  persistence?: { capture?: () => void; restoreUI?: (root: HTMLElement) => void } | null;
  root: HTMLElement;
  teamLink?: string | null;
  expose: (getState: () => unknown) => void;
}

/** 要在组件 setup 里调用（里面注册了 onMounted / onBeforeUnmount）。 */
export function createSpeedPage(props: SpeedPageProps) {
  const s = createPlanState(props.catalog, props.draft);
  const gear = useGear(s, props.call);
  const splash = useSplash(s);
  const steps = useSteps();
  const plan = usePlanRun(s, props);
  // 订阅顺序就是算完后的处理顺序：先对齐效果勾选，再滚动结论区的数字
  const effects = useEffects(s, plan, props.root);
  const hero = useHero(plan);
  const tabs = useResultTabs(s, plan, props.root);
  const inputs = useInputs(s, plan, tabs.resetTableView);
  const presets = usePresets(s, { call: props.call, root: props.root, cones: gear.cones, updateSplash: splash.updateSplash, run: plan.run });
  const recommend = useRecommend(s, props.call, plan.run);
  const roster = useRosterLink(s, { call: props.call, updateSplash: splash.updateSplash, run: plan.run });
  const { summaries } = useSummaries(s, gear, plan, tabs.tables, roster.rosterLinked);

  // ---------------- 换角色：牵动装备、配装、立绘和计算 ---------------- //
  const characterDialog = ref<InstanceType<typeof CharacterDialog> | null>(null);
  const openCharacters = (): void => { void characterDialog.value?.open(); };
  async function pickCharacter(id: string): Promise<void> {
    s.state.characterId = id;
    s.state.rosterMode = "auto";
    s.form.presetErr = "0";
    s.form.presetEnergy = "";
    s.form.presetRotation = "auto";
    presets.writeAhaFields();
    s.state.enabled = null;
    await gear.loadCones();
    await roster.linkRoster();
    presets.refreshPresets();
    splash.updateSplash();
    void plan.run();
  }
  function onCustomInput(): void {
    s.state.custom.name = s.form.customName;
    s.state.custom.baseSpeed = s.form.customBase === "" ? NaN : Number(s.form.customBase);
    s.state.custom.traceSpeed = s.form.customTrace === "" ? 0 : Number(s.form.customTrace);
    splash.updateSplash();
    plan.schedule();
  }

  // ---------------- 状态保存与启动 ---------------- //
  props.expose(() => ({ state: JSON.parse(JSON.stringify(s.state)), aha: presets.currentConfig().aha, tab: tabs.activeTab.value }));

  onMounted(async () => {
    splash.updateSplash();
    const restoredCone = s.state.lightconeId;
    await gear.loadCones();
    if (s.restored && (restoredCone === "" || gear.cones.value.some((c) => String(c.id) === String(restoredCone)))) s.state.lightconeId = restoredCone;
    s.syncForm();
    await roster.linkRoster();
    const draft = props.draft;
    if (draft?.aha) {
      s.form.presetErr = String(draft.aha.err ?? 0);
      s.form.presetEnergy = String(draft.aha.initialEnergy ?? "");
      s.form.presetRotation = draft.aha.rotation || "auto";
      presets.writeAhaFields();
    }
    if (draft?.tab) await tabs.selectTab(TABS.includes(draft.tab) ? draft.tab : "detail");
    tabs.observeTabs();
    await presets.loadPresets();
    await plan.run();
    tabs.moveTabInk();
  });
  onBeforeUnmount(() => {
    plan.dispose();
    splash.dispose();
    tabs.dispose();
    stopRolls();
  });

  // 区块组件按名字取用；新加的东西放进对应的部分，再在这里列出来。
  return {
    theme: s.theme, state: s.state, form: s.form, characters: s.characters, currentCharacter: s.currentCharacter, isCustom: s.isCustom,
    coneItems: gear.coneItems, fourPieceItems: gear.fourPieceItems, ornamentItems: gear.ornamentItems, relicNote: gear.relicNote, charInfo: gear.charInfo,
    splash: splash.splash, splashMeta: splash.splashMeta, splashSrc: splash.splashSrc, splashBroken: splash.splashBroken, heroArtBroken: splash.heroArtBroken,
    onSplashLoad: splash.onSplashLoad, charSpeed: splash.charSpeed, charTrace: splash.charTrace, markSplashBroken: splash.markSplashBroken, markHeroArtBroken: splash.markHeroArtBroken,
    collapsedSteps: steps.collapsedSteps, charBody: steps.charBody, toggleStep: steps.toggleStep,
    result: plan.result, planError: plan.planError, modeOptions: plan.modeOptions, tOptions: plan.tOptions,
    ...effects,
    ...hero,
    tabsBox: tabs.tabsBox, tabInk: tabs.tabInk, activeTab: tabs.activeTab, selectTab: tabs.selectTab, tables: tabs.tables, viewId: tabs.viewId,
    viewTable: tabs.viewTable, viewTableMode: tabs.viewTableMode, KIND_TEXT: tabs.KIND_TEXT,
    summaries,
    ...inputs,
    presetStatus: presets.presetStatus, savedPreset: presets.savedPreset, presetNote: presets.presetNote, savingPreset: presets.savingPreset,
    savePreset: presets.savePreset, deletePreset: presets.deletePreset,
    // 套用我的配速、自动推荐是用户自己选了一套遗器，不再按实际装配
    applyPreset: () => { roster.leaveRoster(); presets.applyPreset(); },
    ...recommend,
    applyRecommend: (item: unknown) => { roster.leaveRoster(); recommend.applyRecommend(item); },
    rosterLinked: roster.rosterLinked, rosterHas: roster.rosterHas, rosterError: roster.rosterError, rosterManual: roster.rosterManual, rosterBack: roster.rosterBack,
    currentCone: gear.currentCone, nameIn: gear.nameIn,
    characterDialog, openCharacters, pickCharacter, onCustomInput,
    teamLink: props.teamLink ?? null,
  };
}

export type SpeedPage = ReturnType<typeof createSpeedPage>;
const PAGE: InjectionKey<SpeedPage> = Symbol("speed-page");
export const provideSpeedPage = (page: SpeedPage): void => provide(PAGE, page);
export function useSpeedPage(): SpeedPage {
  const page = inject(PAGE);
  if (!page) throw new Error("配速查询的区块组件要放在 App.vue 里用");
  return page;
}
