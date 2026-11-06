<script setup lang="ts">
/* 角色与遗器（1.2）：导入或手填玩家实际的角色和遗器，算出和游戏一致的面板。
 * 配速查询按实际装配算（自动套用）和全角色行动轴的「实际装配」读的都是这里的存档（honkai-star-rail/roster）。 */
import { onBeforeUnmount, onMounted, ref } from "vue";
import { fromFreeSr, isFreeSr } from "../../ui-shared/src/import/freesr.ts";
import { fromScannerV4 } from "../../ui-shared/src/import/scanner-v4.ts";
import type { StatData } from "../../ui-shared/src/stats/types.ts";
import CharacterView from "./CharacterView.vue";
import ImportBar from "./ImportBar.vue";
import ImportReview from "./ImportReview.vue";
import type { CardItem, Review } from "./review.ts";
import type { RelicIcons } from "../../ui-shared/src/import/record-card/intl.ts";
import { closeEngine, recognizeFile } from "./ocr.ts";
import RelicLibrary from "./RelicLibrary.vue";
import { useRoster, type Call, type Catalog } from "./use-roster.ts";

const props = defineProps<{ call: Call; data: StatData; catalog: Catalog; isExe: boolean; ocrBase: string; loadIcons: () => Promise<RelicIcons> }>();
const r = useRoster(props.call, props.data);
const tab = ref<"characters" | "relics">("characters");
const review = ref<Review | null>(null);
let pending: { characters: unknown[]; relics: unknown[]; source: string } | null = null;

onMounted(() => { void r.load(); });
onBeforeUnmount(() => { void closeEngine(); });

async function onScan(file: File): Promise<void> {
  r.error.value = "";
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    r.error.value = `「${file.name}」不是 JSON 文件，请选扫描工具导出的 .json。`;
    return;
  }
  let imported;
  try {
    imported = isFreeSr(raw) ? fromFreeSr(raw, props.data) : fromScannerV4(raw, props.data);
  } catch (e) {
    r.error.value = (e as Error).message;
    return;
  }
  pending = { characters: imported.characters, relics: imported.relics, source: isFreeSr(raw) ? "freesr" : "scanner-v4" };
  const diff = await r.previewReplace(pending);
  if (diff) review.value = { kind: "file", diff, skipped: imported.skipped, characters: imported.characters.length, relics: imported.relics.length };
}

async function onImages(files: File[]): Promise<void> {
  r.error.value = "";
  const items: CardItem[] = files.map((file) => ({ name: file.name, status: "waiting", progress: 0, include: true }));
  review.value = { kind: "cards", items };
  const live = (review.value as { items: CardItem[] }).items;
  for (let i = 0; i < files.length; i += 1) {
    if (review.value?.kind !== "cards") return; // 用户放弃了
    live[i].status = "working";
    try {
      live[i].result = await recognizeFile(files[i], props.data, props.ocrBase, props.loadIcons, (p) => { live[i].progress = p; });
      live[i].status = "done";
    } catch (e) {
      live[i].status = "failed";
      live[i].error = (e as Error).message;
      live[i].include = false;
    }
  }
}

async function confirm(): Promise<void> {
  const current = review.value;
  if (!current) return;
  if (current.kind === "file" && pending) {
    await r.replace(pending);
    r.notes.value = current.skipped;
  } else if (current.kind === "cards") {
    const chosen = current.items.filter((item) => item.include && item.result).map((item) => item.result!);
    await r.merge({ characters: chosen.map((c) => c.character), relics: chosen.flatMap((c) => c.relics), source: "record-card", loose: true });
    r.notes.value = [];
    if (chosen[0]) r.selectedId.value = chosen[0].character.id;
  }
  if (!r.error.value) {
    review.value = null;
    pending = null;
    tab.value = "characters";
  }
}
</script>

<template>
  <div class="rs-page">
    <div class="card rs-top">
      <div class="rs-top-text">
        <h2>角色与遗器</h2>
        <p class="muted small">
          {{ r.characters.value.length }} 名角色 · {{ r.roster.value.relics.length }} 件遗器<template v-if="r.roster.value.importedAt"> · 上次导入 {{ r.roster.value.importedAt }}</template>
        </p>
      </div>
      <ImportBar :is-exe="isExe" :busy="r.busy.value" :uid="r.roster.value.uid" @scan="onScan" @images="onImages" @uid="r.showcase" />
    </div>
    <p v-if="r.error.value" class="card error error-text" role="alert">{{ r.error.value }}</p>
    <ul v-if="r.notes.value.length" class="card rs-notes"><li v-for="(line, i) in r.notes.value" :key="i">{{ line }}</li></ul>

    <!-- 没有角色时展开；有了以后收起，需要时点开看 -->
    <details class="card rs-help" :open="!r.characters.value.length">
      <summary>怎么导入</summary>
      <ul>
        <li><b>手机</b>：在米游社的「星穹铁道战绩」里打开角色，生成分享图并保存原图，然后点「识图导入」（国际服战绩页生成的横版角色图也认，英文、繁体中文界面都行），可以一次选多张（在 B站 App 里一次选一张）。点了没弹出相册的话，换手机浏览器或电脑打开工具箱再导。</li>
        <li><b>电脑</b>：用 Reliquary Archiver、GGScanner 等扫描工具导出 v4 格式的 JSON，点「导入扫描文件」；FreeSR 格式的 freesr-data.json 也认，游戏里不可能出现的遗器（手改过的）会跳过。</li>
        <li v-if="isExe"><b>UID</b>：输入 UID，直接读游戏里公开的展柜角色。</li>
        <li v-else><b>UID 查询</b>：只有 exe 能用（网页读不到游戏展柜），网页版请用上面两种方式。</li>
        <li>也可以手动添加角色、在遗器库里手动新增遗器。</li>
      </ul>
    </details>

    <div class="rs-tabs" role="tablist">
      <button type="button" role="tab" :aria-selected="tab === 'characters'" :class="{ active: tab === 'characters' }" @click="tab = 'characters'">角色</button>
      <button type="button" role="tab" :aria-selected="tab === 'relics'" :class="{ active: tab === 'relics' }" @click="tab = 'relics'">遗器库</button>
    </div>
    <CharacterView v-if="tab === 'characters'" :roster="r" :data="data" :catalog="catalog" />
    <RelicLibrary v-else :roster="r" :data="data" :catalog="catalog" />

    <ImportReview v-if="review" :review="review" :data="data" :catalog="catalog" :busy="r.busy.value" @confirm="confirm" @cancel="review = null; pending = null" />
  </div>
</template>
