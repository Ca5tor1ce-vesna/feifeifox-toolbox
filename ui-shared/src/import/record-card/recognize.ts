/**
 * 战绩分享图 → 统一的内部格式（一张图 = 一个角色和他身上的遗器）。识别引擎由调用方传进来：
 * 页面里用随包的 Tesseract.js，测试里用 node 版，两边走同一套切图和解析。
 *
 * 两种图：米游社「星穹铁道战绩」的中文竖版长图（这个文件），国际服战绩页的英文横图（intl.ts）。按宽高比分开：
 * 竖版长图高宽比 2.6 以上，横图 0.9 左右。读出来以后的认遗器、认角色、收尾都走 card-common.ts。
 *
 * 顺序：面板 → 遗器 → 角色（名字只是线索，最后用「遗器 + 角色算出的面板」和图上的面板对得最好来定，
 * 这样「姬子」和「姬子•启行」、几个开拓者也分得开）→ 光锥 → 星魂、行迹 → 突破。
 * 图上看不到的：副词条档位（速度只显示整数）、突破阶段（只写等级）、属性行迹对应哪个节点（只能数个数）。
 * 这些按估计填，记进 uncertain，页面的确认步骤里给用户看。
 */
import type { RelicPiece, RosterCharacter, StatData, StatKey } from "../../stats/types.ts";
import { buildRelic, coneFromLevel, finishCharacter, lines, pairLines, pickCharacter, type CardResult, type OcrEngine, type SubChoice } from "./card-common.ts";
import { recognizeIntlCard, type IntlOptions } from "./intl.ts";
import { LAYOUT, LOCK_MATCH, LOCK_SIGNATURE, NAME_LINE, PANEL_LEFT, PANEL_RIGHT, TRACE_LIT_LUMA, relicRowTops, relicRows, relicTop, scaleRect } from "./layout.ts";
import { matchName, parseLabel, parseLevelLine, parseStatValue, rankNames } from "./match.ts";
import { cellImage, correlation, findLevelBox, signature, tone, warmBands, whiteTextCell, type Pixels } from "./preprocess.ts";

export { pairLines, type CardResult, type OcrEngine } from "./card-common.ts";

const ELEMENTS: Record<string, string> = { 物理: "Physical", 火: "Fire", 冰: "Ice", 雷: "Thunder", 风: "Wind", 量子: "Quantum", 虚数: "Imaginary" };
const ELEMENT_STAT: Record<string, StatKey> = {
  Physical: "dmgPhysical", Fire: "dmgFire", Ice: "dmgIce", Thunder: "dmgLightning", Wind: "dmgWind", Quantum: "dmgQuantum", Imaginary: "dmgImaginary",
};

/** 比最短的分享图（没穿遗器，1895）还短得多，就不是分享图。 */
const MIN_CARD_HEIGHT = 1800;
/** 高宽比低于这个的是国际服的英文横图。 */
const LANDSCAPE_RATIO = 1.3;
export const NOT_A_CARD = "这张像是米游社「角色详情」页面的截图，不是分享图：排版不一样，也截不到遗器。请在角色详情页点右上角的分享按钮，保存生成的长图再导入。";

export async function recognizeCard(px: Pixels, data: StatData, ocr: OcrEngine, onProgress?: (done: number) => void, options: IntlOptions = {}): Promise<CardResult> {
  if (px.height / px.width < LANDSCAPE_RATIO) return recognizeIntlCard(px, data, ocr, onProgress, options);
  const unit = px.width / LAYOUT.width;
  // 最短的分享图（没穿遗器）也有 1895 高（702 宽单位）。比这还短的多半是米游社「角色详情」页的手机截图：排版不一样，也截不到遗器
  // （2026-11-05 用户导入了一张这样的截图，被认成了别的角色）。
  if (px.height / unit < MIN_CARD_HEIGHT) throw new Error(NOT_A_CARD);
  const cell = (r: typeof LAYOUT.name, dx = 0, dy = 0, factor = 2) => cellImage(px, scaleRect(r, unit, dx, dy), factor);
  const uncertain: string[] = [];
  const raw: Record<string, string> = {};
  const progress = (value: number) => onProgress?.(Math.min(1, value));
  const read = async (key: string, kind: "digits" | "text", image: Uint8Array) => (raw[key] = (await ocr[kind](image)).trim());

  // 面板
  const left = lines(await read("panelLeft", "digits", cell(LAYOUT.panelLeft))).map(parseStatValue);
  const right = lines(await read("panelRight", "digits", cell(LAYOUT.panelRight))).map(parseStatValue);
  // 速度（左列第 4 行）读出离谱的数（「94」认成「924」）时，用另一个识别方式再读一次；还不对就当没认出来，别拿错数去对比。
  const spdOk = (v: { value: number } | null | undefined) => !!v && v.value >= 60 && v.value <= 400;
  if (left[3] && !spdOk(left[3])) {
    const again = ocr.digitsAlt ? lines((raw.panelLeft2 = (await ocr.digitsAlt(cell(LAYOUT.panelLeft))).trim())).map(parseStatValue) : [];
    left[3] = spdOk(again[3]) ? again[3] : null;
  }
  const elementText = (await read("element", "text", cell(LAYOUT.elementLabel))).replace(/\s/g, "");
  const elementName = Object.keys(ELEMENTS).find((name) => elementText.startsWith(name)) ?? null;
  const element = elementName ? ELEMENTS[elementName] : null;
  const shownPanel: Partial<Record<StatKey, number>> = {};
  PANEL_LEFT.forEach((stat, i) => {
    const value = left[i];
    if (!value) return;
    if (stat !== "element") shownPanel[stat] = value.value;
    else if (element) shownPanel[ELEMENT_STAT[element]] = value.value;
  });
  PANEL_RIGHT.forEach((stat, i) => {
    if (right[i]) shownPanel[stat] = right[i]!.value;
  });
  if (left.filter(Boolean).length < 7 || right.filter(Boolean).length < 6) uncertain.push("面板有几项没认出来，对比时会少几项。");
  progress(0.1);

  // 遗器（先不定穿在谁身上）
  const relics: RelicPiece[] = [];
  /** 看不清的副词条（速度只显示整数、读歪一个字的）可能的认法，最后按面板挑。 */
  const choices: SubChoice[] = [];
  const pieceNames = [...new Set([...data.pieces.values()].map((p) => p.name ?? "").filter(Boolean))];
  const rows = relicRows(px.height, unit);
  const firstTop = relicTop(px.height, unit, rows);
  const estimated = Array.from({ length: rows }, (_, row) => firstTop + row * LAYOUT.relics.rowHeight);
  const scanFrom = Math.max(0, firstTop - 120);
  const bars = LAYOUT.relics.columns.flatMap((column) => warmBands(px, unit, column + 10, column + 160, scanFrom, scanFrom + rows * LAYOUT.relics.rowHeight + 240));
  const tops = relicRowTops(estimated, bars);
  let index = 0;
  outer: for (let row = 0; row < rows; row += 1) {
    for (const column of LAYOUT.relics.columns) {
      const top = tops[row];
      index += 1;
      const titleText = await read(`relic${index}.title`, "text", cell(LAYOUT.relics.title, column, top));
      const title = matchName(titleText, pieceNames);
      if (!title) {
        if (index === 1) {
          // 第一张卡都认不出：多半是没穿遗器（「暂未装备遗器」，图短，估计只有 1 行）；图够长却还认不出，就说一声，别悄悄变成 0 件。
          if (rows >= 2) uncertain.push("图上的遗器没认出来，这次只导入角色；遗器可以在遗器库里手动添加。");
          break outer;
        }
        uncertain.push(`第 ${index} 件遗器的名字没认出来，已跳过。`);
        continue;
      }
      const relicLevel = Number(titleText.match(/\+\s*(\d{1,2})/)?.[1] ?? 15);
      // 先整块读：词条名一块，数值用两种识别方式各读一块，哪种的行数和词条名对得上就用哪种。
      const labels = lines(await read(`relic${index}.labels`, "text", cell(LAYOUT.relics.labels, column, top))).map(parseLabel);
      const valueLines = lines(await read(`relic${index}.values`, "digits", cell(LAYOUT.relics.values, column, top)));
      const altLines = ocr.digitsAlt ? lines((raw[`relic${index}.values2`] = (await ocr.digitsAlt(cell(LAYOUT.relics.values, column, top))).trim())) : [];
      let parsed = pairLines(labels, [valueLines, altLines]);
      if (!parsed) {
        // 整块读漏了一行（只有一个字的「4」常被跳过）：一行一行切开再读。空行说明副词条到头了（低等级遗器只有 2~3 条）。
        const { line } = LAYOUT.relics;
        const rowLabels: ReturnType<typeof parseLabel>[] = [];
        const rowValues: string[][] = [];
        for (let k = 0; k < line.count; k += 1) {
          const dy = top + line.top + k * line.step;
          const labelText = await read(`relic${index}.label${k}`, "text", cell({ x: line.label.x, y: 0, w: line.label.w, h: line.height }, column, dy));
          if (!labelText) break;
          const valueCell = cell({ x: line.value.x, y: 0, w: line.value.w, h: line.height }, column, dy);
          const first = await read(`relic${index}.value${k}`, "digits", valueCell);
          const second = ocr.digitsAlt ? (raw[`relic${index}.value${k}b`] = (await ocr.digitsAlt(valueCell)).trim()) : "";
          rowLabels.push(parseLabel(labelText));
          rowValues.push([first, second]);
        }
        parsed = pairLines(rowLabels, [rowValues.map((pair) => pair[0]), rowValues.map((pair) => pair[1])]);
      }
      if (!parsed || parsed.length < 2) {
        uncertain.push(`第 ${index} 件遗器（${title.name}）的词条没认全，已跳过。`);
        continue;
      }
      // 同名的遗器有几种稀有度：用主词条在这个等级的数值对上图上的那件（优先 5 星）。
      const options = [...data.pieces.entries()].filter(([, piece]) => piece.name === title.name).sort((a, b) => b[1].rarity - a[1].rarity);
      const picked = buildRelic(options, relicLevel, parsed, `card-${index}`, relics.length, data, choices);
      if (!picked) {
        uncertain.push(`第 ${index} 件遗器（${title.name}）的数值和数值表对不上，已跳过。`);
        continue;
      }
      relics.push(picked);
      progress(0.1 + (0.5 * index) / (rows * 2));
    }
  }

  // 名字行：先找「Lv.xx」米色框，左边是名字（白字），框里是等级。
  const boxStart = findLevelBox(px, unit);
  const nameRect = { x: NAME_LINE.left * unit, y: NAME_LINE.top * unit, w: Math.max(20, boxStart - 6 - NAME_LINE.left) * unit, h: NAME_LINE.height * unit };
  const nameText = await read("name", "text", whiteTextCell(px, nameRect));
  // 只切框里面：框外是深色背景，混进来二值化会把字和框当成一类。但角色立绘偏浅色时框找得偏右，切窄了会把「80」的 0 切掉（2026-11-05 昔涟读成 8 级），
  // 所以切两种宽度各读一次，取位数多的。
  const levelReads = [];
  for (const [key, width] of [["level", 56], ["level2", 64]] as const) {
    const text = await read(key, "digits", cellImage(px, { x: (boxStart - 2) * unit, y: 485 * unit, w: width * unit, h: 19 * unit }, 3));
    const parsed = parseLevelLine(text)?.level;
    if (parsed) levelReads.push(parsed);
  }
  const level = levelReads.sort((a, b) => String(b).length - String(a).length || b - a)[0];
  if (!level) uncertain.push("等级没认出来，按 80 级算。");

  // 角色：同属性的所有角色都试一遍，按面板对得上几项加名字相似度来选（见 pickCharacter）。
  const characters = [...data.characters.values()].filter((c) => !element || c.element === element);
  const byName = new Map(rankNames(nameText, characters.map((c) => c.name)).map((r) => [r.name, r.score]));
  const nameScores = new Map(characters.map((c) => [c.id, byName.get(c.name) ?? 0]));
  const info = pickCharacter(characters, nameScores, level ?? 80, relics, shownPanel, data, uncertain,
    () => new Error(`认不出这是哪个角色（识别到「${nameText.replace(/\s/g, "")}」），请确认是米游社的「星穹铁道战绩」生成的分享图。`));
  for (const relic of relics) relic.equippedBy = info.id;
  progress(0.7);

  // 光锥
  let lightcone: RosterCharacter["lightcone"] = null;
  const coneText = await read("coneName", "text", cell(LAYOUT.coneName));
  const cone = matchName(coneText, [...data.lightcones.values()].map((c) => c.name));
  if (cone) {
    const coneInfo = [...data.lightcones.values()].find((c) => c.name === cone.name)!;
    const line = parseLevelLine(await read("coneLine", "text", cell(LAYOUT.coneLine)));
    lightcone = coneFromLevel(coneInfo.id, line?.level ?? 80, line?.superimpose ?? 1, uncertain);
    if (!line) uncertain.push("光锥的等级和叠影没认出来，按 80 级、叠影 1 算。");
  }
  progress(0.85);

  // 星魂：从左数，到第一把锁为止；属性行迹：数点亮的个数。
  const spot = (s: { x: number; y: number }, r: number) => ({ x: (s.x - r) * unit, y: (s.y - r) * unit, w: r * 2 * unit, h: r * 2 * unit });
  const firstLock = LAYOUT.eidolons.findIndex((s) => correlation(signature(px, spot(s, 11)), LOCK_SIGNATURE as number[]) > LOCK_MATCH);
  const eidolon = firstLock < 0 ? 6 : firstLock;
  const nodes = Object.keys(info.statTraces).sort();
  const lit = LAYOUT.traces.slice(0, nodes.length).filter((s) => tone(px, spot(s, 8)).luma > TRACE_LIT_LUMA).length;
  const traces = nodes.slice(0, lit);
  if (lit > 0 && lit < nodes.length) uncertain.push(`属性行迹点亮了 ${lit} 个，图上分不清是哪几个，按解锁顺序算。`);

  const character: RosterCharacter = { id: info.id, level: level ?? 80, promotion: 6, eidolon, lightcone, traces, defaults: level ? [] : ["level"] };
  finishCharacter(character, relics, choices, shownPanel, data, uncertain);
  progress(1);
  return { character, relics, shownPanel, uncertain, raw };
}
