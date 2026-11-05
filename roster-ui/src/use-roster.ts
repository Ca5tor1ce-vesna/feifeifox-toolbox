/** 「角色与遗器」的页面状态：存档、数据查表、和后端动作的往来。组件只管显示和收输入。 */
import { computed, ref, shallowRef } from "vue";

import { defaultCharacter } from "../../ui-shared/src/stats/defaults.ts";
import { computePanel, type Panel } from "../../ui-shared/src/stats/panel.ts";
import { emptyRoster, type RelicPiece, type RosterCharacter, type RosterSave, type StatData } from "../../ui-shared/src/stats/types.ts";
import type { LibraryDiff } from "../../ui-shared/src/import/merge.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Call = (action: string, payload?: unknown) => Promise<any>;

/** 页面上要显示的名字和图标（数据文件里的原样字段）。 */
export interface Catalog {
  characters: Map<string, {
    id: string; name: string; icon?: string; iconHd?: string; splash?: string; splashHd?: string; element: string; elementName?: string; path: string; pathName?: string; rarity?: number; order?: number;
    /** 专武（限定五星才有）和游戏里的推荐光锥，按游戏里的顺序。 */
    signatureCone?: string; recommendedCones?: string[];
  }>;
  lightcones: Map<string, { id: string; name: string; icon?: string; portrait?: string; path: string; pathName?: string; rarity?: number }>;
  relicSets: Map<string, { id: string; name: string; icon?: string }>;
}

export function useRoster(call: Call, data: StatData) {
  const roster = shallowRef<RosterSave>(emptyRoster());
  const busy = ref(false);
  const error = ref("");
  const notes = ref<string[]>([]);
  const selectedId = ref<string | null>(null);

  const characters = computed(() => Object.values(roster.value.characters));
  const selected = computed<RosterCharacter | null>(() => (selectedId.value ? roster.value.characters[selectedId.value] ?? null : null));
  const relicsOf = (id: string): RelicPiece[] => roster.value.relics.filter((r) => r.equippedBy === id);
  const panelOf = (character: RosterCharacter): Panel | null => {
    try {
      return computePanel(character, relicsOf(character.id), data);
    } catch {
      return null;
    }
  };

  /** 包一层：忙的时候不重复点，出错时把后端的中文错误显示出来。 */
  async function run<T>(task: () => Promise<T>): Promise<T | undefined> {
    if (busy.value) return undefined;
    busy.value = true;
    error.value = "";
    try {
      return await task();
    } catch (e) {
      error.value = (e as Error)?.message ?? String(e);
      return undefined;
    } finally {
      busy.value = false;
    }
  }
  const apply = (save: RosterSave | undefined): void => {
    if (!save) return;
    roster.value = save;
    if (!selectedId.value || !save.characters[selectedId.value]) selectedId.value = Object.keys(save.characters)[0] ?? null;
  };

  return {
    roster, busy, error, notes, selectedId, characters, selected, relicsOf, panelOf,
    load: () => run(async () => apply(await call("get"))),
    previewReplace: (payload: object) => run(async () => (await call("preview_replace", payload)) as LibraryDiff),
    replace: (payload: object) => run(async () => apply(await call("replace", payload))),
    merge: (payload: object) => run(async () => apply(await call("merge", payload))),
    showcase: (uid: string) => run(async () => {
      const result = await call("showcase", { uid });
      apply(result.roster);
      notes.value = result.skipped ?? [];
      return result;
    }),
    addCharacter: (id: string) => run(async () => {
      apply(await call("save_character", { character: defaultCharacter(id, data) }));
      selectedId.value = id;
    }),
    saveCharacter: (character: RosterCharacter) => run(async () => apply(await call("save_character", { character }))),
    saveRelic: (relic: Partial<RelicPiece>) => run(async () => apply(await call("save_relic", { relic }))),
    deleteRelic: (id: string) => run(async () => apply(await call("delete_relic", { id }))),
    equip: (relicId: string, characterId: string | null) => run(async () => apply(await call("equip", { relicId, characterId }))),
  };
}

export type Roster = ReturnType<typeof useRoster>;
