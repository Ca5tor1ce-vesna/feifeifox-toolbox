/* 配速查询 · 我的配装：存、读、删、套用（存在外壳的存档里，全角色行动轴读同一份），
 * 以及跟着配装一起存的「队伍模拟补充参数」。 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, nextTick, ref, type Ref } from "vue";
import type { Call, PlanState } from "./plan-state.ts";

interface PresetHost {
  call: Call;
  root: HTMLElement;
  cones: Ref<any[]>;
  /** 套用后刷新立绘和重算。 */
  updateSplash: () => void;
  run: () => Promise<void>;
}

// 队伍模拟补充参数以输入框里的实际内容为准（和以前一样直接读控件），套用时再写回控件。
const AHA_FIELDS = [["preset-err", "presetErr"], ["preset-energy", "presetEnergy"], ["preset-rotation", "presetRotation"]] as const;

export function usePresets(s: PlanState, host: PresetHost) {
  const { state, form, isCustom, syncForm } = s;
  const presets = ref<Record<string, any>>({});
  const presetOverride = ref<{ text: string; error: boolean } | null>(null);
  const savingPreset = ref(false);
  const savedPreset = computed(() => presets.value[String(state.characterId)]);
  const presetStatus = computed(() => (savedPreset.value ? `已存 ${savedPreset.value.savedAt}` : "这个角色还没存过"));
  const presetNote = computed(() => {
    if (presetOverride.value) return presetOverride.value;
    const saved = savedPreset.value;
    if (!saved) return { text: "", error: false };
    const coneName = host.cones.value.find((cone) => String(cone.id) === String(saved.config?.lightconeId))?.name || "无";
    return { text: `光锥 ${coneName}　叠影 ${saved.config?.superimpose ?? "-"}　星魂 ${saved.config?.eidolon ?? "-"}（存在 userdata，升级不丢）`, error: false };
  });
  const refreshPresets = (): void => { presetOverride.value = null; };

  const fieldOf = (id: string): HTMLInputElement | HTMLSelectElement | null => host.root.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`);
  /** 只读不改：保存页面草稿时也会调到这里，不能顺手改掉 form，否则套用时写回控件会被跳过。 */
  function readAhaFields(): Record<(typeof AHA_FIELDS)[number][1], string> {
    const values = { presetErr: form.presetErr, presetEnergy: form.presetEnergy, presetRotation: form.presetRotation };
    for (const [id, key] of AHA_FIELDS) {
      const element = fieldOf(id);
      if (element) values[key] = element.value;
    }
    return values;
  }
  function writeAhaFields(): void {
    void nextTick(() => {
      for (const [id, key] of AHA_FIELDS) {
        const element = fieldOf(id);
        if (element && element.value !== form[key]) element.value = form[key];
      }
    });
  }
  function currentConfig(): any {
    const aha = readAhaFields();
    const config: any = {
      simulation: state.simulation,
      aha: { err: Number(aha.presetErr), initialEnergy: aha.presetEnergy, rotation: aha.presetRotation },
      lightconeId: state.lightconeId,
      superimpose: state.superimpose,
      eidolon: state.eidolon,
      enabledEffects: state.enabled,
      relic: state.relic,
      advance: state.advance,
      target: state.target,
    };
    if (isCustom.value) config.customCharacter = { ...state.custom };
    return config;
  }

  async function loadPresets(): Promise<void> {
    try {
      presets.value = (await host.call("presets")).presets || {};
    } catch {
      presets.value = {};
    }
    refreshPresets();
  }
  const fieldValid = (id: string): boolean => host.root.querySelector<HTMLInputElement>(`#${id}`)?.checkValidity() ?? true;
  async function savePreset(): Promise<void> {
    savingPreset.value = true;
    try {
      if (!fieldValid("preset-err") || !fieldValid("preset-energy")) throw new Error("充能效率与开局资源需要填写非负数，开局资源也可以留空。");
      const res = await host.call("save_preset", { characterId: state.characterId, config: JSON.parse(JSON.stringify(currentConfig())) });
      await loadPresets();
      presetOverride.value = { text: `已保存（共 ${res.count} 个角色的配装）。`, error: false };
    } catch (err) {
      presetOverride.value = { text: (err as Error).message, error: true };
    } finally {
      savingPreset.value = false;
    }
  }
  async function deletePreset(): Promise<void> {
    try {
      await host.call("delete_preset", { characterId: state.characterId });
      await loadPresets();
    } catch (err) {
      presetOverride.value = { text: (err as Error).message, error: true };
    }
  }
  function applyPreset(): void {
    const saved = savedPreset.value;
    if (!saved?.config) return;
    const config = saved.config;
    form.presetErr = String(config.aha?.err ?? 0);
    form.presetEnergy = String(config.aha?.initialEnergy ?? "");
    form.presetRotation = config.aha?.rotation ?? "auto";
    writeAhaFields();
    state.simulation = { ...state.simulation, ...(config.simulation || {}) };
    state.lightconeId = config.lightconeId || "";
    state.superimpose = config.superimpose ?? 1;
    state.eidolon = config.eidolon ?? 0;
    state.enabled = config.enabledEffects ?? null;
    state.relic = { ...state.relic, ...(config.relic || {}) };
    state.advance = { ...state.advance, ...(config.advance || {}) };
    state.target = { ...state.target, ...(config.target || {}) };
    if (isCustom.value && config.customCharacter) state.custom = { ...state.custom, ...config.customCharacter };
    syncForm();
    host.updateSplash();
    void host.run();
  }

  /** 「用实际装配填入」：读「角色与遗器」里这个角色的实际装配，换算成配速查询的配置填进来（只填入，不改「我的配速」）。 */
  async function fillFromRoster(): Promise<void> {
    try {
      const filled = await host.call("roster_speed_config", { characterId: state.characterId });
      const config = filled.config;
      state.lightconeId = config.lightconeId || "";
      state.superimpose = config.superimpose ?? 1;
      state.eidolon = config.eidolon ?? 0;
      state.enabled = null;
      state.relic = { ...state.relic, ...config.relic };
      syncForm();
      host.updateSplash();
      await host.run();
      const notes = (filled.notes || []).join("");
      presetOverride.value = { text: `已按「角色与遗器」里的实际装配填入：面板速度 ${Number(filled.panelSpeed).toFixed(1)}。${notes}`, error: false };
    } catch (err) {
      presetOverride.value = { text: (err as Error).message, error: true };
    }
  }

  return { presetStatus, savedPreset, presetNote, savingPreset, refreshPresets, writeAhaFields, currentConfig, loadPresets, savePreset, deletePreset, applyPreset, fillFromRoster };
}
