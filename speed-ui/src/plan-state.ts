/* 配速查询的状态：要算的配置（state）和输入框里的原文（form）。只有数据，不管界面和计算。 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, reactive } from "vue";
import { CHARACTER_THEMES } from "./themes.ts";
import { CUSTOM_ID, type CharacterItem } from "./types.ts";

/** 外壳存的页面草稿。 */
export interface SpeedDraft {
  state?: any;
  aha?: { err?: number; initialEnergy?: string; rotation?: string };
  tab?: string;
}

export function createPlanState(catalog: any, draft?: SpeedDraft | null) {
  const characters = (catalog.characters ?? []) as CharacterItem[];
  const charById = new Map(characters.map((item) => [String(item.id), item]));

  const state = reactive<any>({
    characterId: characters[0]?.id || null,
    custom: { name: "自定义角色", baseSpeed: 100, traceSpeed: 0 },
    lightconeId: null,
    superimpose: 1,
    eidolon: 0,
    enabled: null, // null = 用默认勾选
    relic: { speedBoots: true, fourPieceId: "", fourPieceUlts: 0, ultTargetsAlly: false, ornamentIds: ["", ""], substatSpeed: 0, customPct: 0, customFlat: 0 },
    advance: { coneUlts: 0, custom: 0, excludeLastUlt: false },
    // 模拟参数：第一次开大发生在自己第几次行动之后（0 = 进战即开大）
    simulation: { firstUltAction: 1 },
    target: { t: 0, actions: 2, customAV: 0, mode: catalog.modes?.[0]?.id || "moc" },
  });
  const restored = draft?.state;
  if (restored && (restored.characterId === CUSTOM_ID || characters.some((c) => String(c.id) === String(restored.characterId)))) {
    for (const key of ["characterId", "lightconeId", "superimpose", "eidolon", "enabled"]) if (Object.hasOwn(restored, key)) state[key] = restored[key];
    for (const key of ["custom", "relic", "advance", "simulation", "target"]) if (restored[key] && typeof restored[key] === "object") Object.assign(state[key], restored[key]);
  }

  // 输入框里的原文。数字框允许暂时为空，计算用的数在 state 里，两边分开存。
  const form = reactive({
    fourUlts: "0", coneUlts: "0", substat: "0", customPct: "0", customFlat: "0", advCustom: "0",
    targetActions: "2", customAV: "0", firstUltAction: "1",
    customName: "自定义角色", customBase: "100", customTrace: "0",
    presetErr: "0", presetEnergy: "", presetRotation: "auto",
    recConeUlts: "1", recFourUlts: "1", recS: "1",
  });

  const isCustom = computed(() => String(state.characterId) === CUSTOM_ID);
  const currentCharacter = computed<any>(() => {
    if (isCustom.value) {
      return {
        id: CUSTOM_ID,
        name: state.custom.name || "自定义角色",
        pathName: "自定义",
        baseSpeed: state.custom.baseSpeed,
        traceSpeed: state.custom.traceSpeed,
        effectiveBaseSpeed: Number(state.custom.baseSpeed) + Number(state.custom.traceSpeed || 0),
      };
    }
    return charById.get(String(state.characterId)) || {};
  });
  const theme = computed(() => CHARACTER_THEMES[String(currentCharacter.value.id)] || "pink");

  /** 把 state 刷到输入框上（预设/推荐套用后调用）。 */
  function syncForm(): void {
    form.fourUlts = String(state.relic.fourPieceUlts ?? 0);
    form.substat = String(state.relic.substatSpeed ?? 0);
    form.customPct = String(state.relic.customPct ?? 0);
    form.customFlat = String(state.relic.customFlat ?? 0);
    form.coneUlts = String(state.advance.coneUlts ?? 0);
    form.advCustom = String(state.advance.custom ?? 0);
    form.customAV = String(state.target.customAV ?? 0);
    form.targetActions = String(state.target.actions ?? 2);
    form.firstUltAction = String(state.simulation.firstUltAction ?? 1);
    if (isCustom.value) {
      form.customName = state.custom.name ?? "";
      form.customBase = Number.isFinite(state.custom.baseSpeed) ? String(state.custom.baseSpeed) : "";
      form.customTrace = String(state.custom.traceSpeed ?? 0);
    }
  }

  return { catalog, characters, state, form, restored, isCustom, currentCharacter, theme, syncForm };
}

export type PlanState = ReturnType<typeof createPlanState>;
/** 页面调后端动作（本地计算和「我的配装」走同一个口子）。 */
export type Call = (action: string, payload?: unknown) => Promise<any>;
