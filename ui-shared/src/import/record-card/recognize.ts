/**
 * 战绩分享图 → 统一的内部格式（一张图 = 一个角色和他身上的遗器）。识别引擎由调用方传进来：
 * 页面里用随包的 Tesseract.js，测试里用 node 版，两边走同一套切图和解析。
 *
 * 顺序：面板 → 遗器 → 角色（名字只是线索，最后用「遗器 + 角色算出的面板」和图上的面板对得最好来定，
 * 这样「姬子」和「姬子•启行」、几个开拓者也分得开）→ 光锥 → 星魂、行迹 → 突破。
 * 图上看不到的：副词条档位（速度只显示整数）、突破阶段（只写等级）、属性行迹对应哪个节点（只能数个数）。
 * 这些按估计填，记进 uncertain，页面的确认步骤里给用户看。
 */
import { inferSubAffix } from "../scanner-v4.ts";
import { computePanel, displayStat, inferPromotion } from "../../stats/panel.ts";
import type { CharacterStats, RelicPiece, RosterCharacter, StatData, StatKey } from "../../stats/types.ts";
import { LAYOUT, LOCK_MATCH, LOCK_SIGNATURE, NAME_LINE, PANEL_LEFT, PANEL_RIGHT, TRACE_LIT_LUMA, relicRowTops, relicRows, relicTop, scaleRect } from "./layout.ts";
import { matchName, parseLabel, parseLevelLine, parseStatValue, rankNames } from "./match.ts";
import { cellImage, correlation, findLevelBox, signature, tone, warmBands, whiteTextCell, type Pixels } from "./preprocess.ts";

export interface OcrEngine {
  /** 只认数字、小数点、百分号、加号的格子。 */
  digits(image: Uint8Array): Promise<string>;
  /** 中文格子。 */
  text(image: Uint8Array): Promise<string>;
  /** 另一个字库认数字（可选）：两个字库认错的地方不一样，遗器数值两边都读，按数值表挑对得上的。 */
  digitsAlt?(image: Uint8Array): Promise<string>;
}

export interface CardResult {
  character: RosterCharacter;
  relics: RelicPiece[];
  /** 图上面板的显示值（百分比按小数），给确认页对比用。 */
  shownPanel: Partial<Record<StatKey, number>>;
  /** 估计出来、要用户核对的项，说成人话。 */
  uncertain: string[];
  /** 各格子的识别原文，排查问题用。 */
  raw: Record<string, string>;
}

const ELEMENTS: Record<string, string> = { 物理: "Physical", 火: "Fire", 冰: "Ice", 雷: "Thunder", 风: "Wind", 量子: "Quantum", 虚数: "Imaginary" };
const ELEMENT_STAT: Record<string, StatKey> = {
  Physical: "dmgPhysical", Fire: "dmgFire", Ice: "dmgIce", Thunder: "dmgLightning", Wind: "dmgWind", Quantum: "dmgQuantum", Imaginary: "dmgImaginary",
};
const ELEMENT_TYPE: Record<string, string> = {
  物理: "PhysicalAddedRatio", 火: "FireAddedRatio", 冰: "IceAddedRatio", 雷: "ThunderAddedRatio", 风: "WindAddedRatio", 量子: "QuantumAddedRatio", 虚数: "ImaginaryAddedRatio",
};
const LABEL_TYPES: Record<string, [string, string] | string> = {
  生命值: ["HPDelta", "HPAddedRatio"], 攻击力: ["AttackDelta", "AttackAddedRatio"], 防御力: ["DefenceDelta", "DefenceAddedRatio"],
  速度: "SpeedDelta", 暴击率: "CriticalChanceBase", 暴击伤害: "CriticalDamageBase", 效果命中: "StatusProbabilityBase",
  效果抵抗: "StatusResistanceBase", 击破特攻: "BreakDamageAddedRatioBase", 治疗量加成: "HealRatioBase", 能量恢复效率: "SPRatioBase",
};

/** 属性名 + 是不是百分比 → 资料里的属性。 */
function labelType(label: string, percent: boolean): string | null {
  const element = label.match(/^(.+)属性伤害提高$/);
  if (element) return ELEMENT_TYPE[element[1]] ?? null;
  const entry = LABEL_TYPES[label];
  if (!entry) return null;
  return typeof entry === "string" ? entry : entry[percent ? 1 : 0];
}

const lines = (text: string): string[] => text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

/**
 * 词条名和数值一行对一行配起来。values 是几种读法读出的行（整块读或逐行读、两种识别方式），行数和词条名一样的才用；
 * 每行把各种读法（以及去掉第一个字的读法：数值格子偏左时会带进左边文字的一个笔画，9.1% 认成 92.1%）都留作候选，
 * 后面按数值表挑对得上的。有一行词条名没认出来、或某行一个能用的数都没有，就返回 null。
 */
export function pairLines(labels: ReturnType<typeof parseLabel>[], values: string[][]): { label: NonNullable<ReturnType<typeof parseLabel>>; options: NonNullable<ReturnType<typeof parseStatValue>>[] }[] | null {
  if (!labels.length || !labels.every(Boolean)) return null;
  const usable = values.filter((set) => set.length === labels.length);
  if (!usable.length) return null;
  const rows = labels.map((label, i) => ({
    label: label!,
    options: usable.flatMap((set) => [set[i], set[i]?.slice(1)]).map((text) => (text ? parseStatValue(text) : null)).filter((v): v is NonNullable<typeof v> => !!v),
  }));
  return rows.every((row) => row.options.length) ? rows : null;
}

/** 比最短的分享图（没穿遗器，1895）还短得多，就不是分享图。 */
const MIN_CARD_HEIGHT = 1800;
export const NOT_A_CARD = "这张像是米游社「角色详情」页面的截图，不是分享图：排版不一样，也截不到遗器。请在角色详情页点右上角的分享按钮，保存生成的长图再导入。";

/** 显示值和面板上的一项一样吗（百分比按一位小数）。 */
function sameShown(stat: StatKey, shown: number, value: number): boolean {
  const asText = stat === "hp" || stat === "atk" || stat === "def" || stat === "spd" ? String(shown) : `${(shown * 100).toFixed(1)}%`;
  return displayStat(stat, value) === asText;
}

/**
 * 速度副词条的档位：在每条可能的档位里挑一组，让算出的面板速度和图上一致，多组都行时挑最接近平均值的。
 * 对不上（比如图上速度没认出来）就保持平均值，返回 false。最多 6 条、每条 3 种，穷举就行。
 */
function fitSpeed(character: RosterCharacter, relics: RelicPiece[], choices: { relicIndex: number; subIndex: number; steps: number[]; count: number }[], shown: number | undefined, data: StatData): boolean {
  if (shown === undefined) return false;
  let best: number[] | null = null;
  let bestDistance = Infinity;
  const pick: number[] = [];
  const visit = (i: number): void => {
    if (i === choices.length) {
      choices.forEach((choice, k) => { relics[choice.relicIndex].subAffixes[choice.subIndex].step = pick[k]; });
      if (displayStat("spd", computePanel(character, relics, data).spd.total) !== String(shown)) return;
      const distance = choices.reduce((sum, choice, k) => sum + Math.abs(pick[k] - choice.count), 0);
      if (distance < bestDistance) { bestDistance = distance; best = [...pick]; }
      return;
    }
    for (const step of choices[i].steps) { pick[i] = step; visit(i + 1); }
  };
  const original = choices.map((choice) => relics[choice.relicIndex].subAffixes[choice.subIndex].step);
  visit(0);
  const chosen: number[] = best ?? original;
  choices.forEach((choice, k) => { relics[choice.relicIndex].subAffixes[choice.subIndex].step = chosen[k]; });
  return best !== null;
}

export async function recognizeCard(px: Pixels, data: StatData, ocr: OcrEngine, onProgress?: (done: number) => void): Promise<CardResult> {
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
  /** 速度副词条可能的档位（图上只显示整数），最后按面板总速度挑一组。 */
  const speedChoices: { relicIndex: number; subIndex: number; steps: number[]; count: number }[] = [];
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
      const [main, ...subs] = parsed;
      const mainType = labelType(main.label.stat, main.options.some((v) => v.percent));
      // 同名的遗器有几种稀有度：用主词条在这个等级的数值对上图上的那件（优先 5 星）。
      const options = [...data.pieces.entries()].filter(([, piece]) => piece.name === title.name).sort((a, b) => b[1].rarity - a[1].rarity);
      let picked: RelicPiece | null = null;
      for (const [pieceId, piece] of options) {
        const mainAffix = Object.entries(data.mainAffixes[piece.mainGroup] ?? {}).find(([, affix]) => affix.type === mainType);
        if (!mainAffix) continue;
        const mainValue = mainAffix[1].base + mainAffix[1].step * relicLevel;
        const mainOk = main.options.some((v) => Math.abs(mainValue - v.value) < (v.percent ? 0.0015 : 1.5));
        if (!mainOk) continue;
        const subGroup = data.subAffixes[piece.subGroup] ?? {};
        const subAffixes: RelicPiece["subAffixes"] = [];
        for (const sub of subs) {
          let done = false;
          for (const value of sub.options) {
            const type = labelType(sub.label.stat, value.percent);
            const found = Object.entries(subGroup).find(([, affix]) => affix.type === type);
            const shown = value.percent ? value.value * 100 : value.value;
            const guess = found && inferSubAffix(found[1].base, found[1].step, shown, value.percent, type === "SpeedDelta", sub.label.rolls ? sub.label.rolls + 1 : undefined);
            if (!found || !guess) continue;
            subAffixes.push({ affix: found[0], count: guess.count, step: guess.step });
            if (type === "SpeedDelta" && guess.steps.length > 1) speedChoices.push({ relicIndex: relics.length, subIndex: subAffixes.length - 1, steps: guess.steps, count: guess.count });
            done = true;
            break;
          }
          if (!done) break;
        }
        if (subAffixes.length !== subs.length) continue;
        picked = { id: `card-${index}`, pieceId, level: relicLevel, mainAffix: mainAffix[0], subAffixes, equippedBy: null };
        break;
      }
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

  // 角色：名字只是线索（两个字的名字常认错）。同属性的所有角色都试一遍，按「算出的面板和图上对得上几项」
  // 加上名字的相似度来选；没穿遗器、行迹没点的角色，靠白值就能唯一确定。
  const characters = [...data.characters.values()].filter((c) => !element || c.element === element);
  const names = new Map(rankNames(nameText, characters.map((c) => c.name)).map((r) => [r.name, r.score]));
  const fit = (info: CharacterStats): number => {
    let best = 0;
    for (const traces of [Object.keys(info.statTraces), []]) {
      const trial: RosterCharacter = { id: info.id, level: level ?? 80, promotion: 6, eidolon: 0, lightcone: null, traces, defaults: [] };
      trial.promotion = inferPromotion(trial, relics, shownPanel, data).promotion;
      const panel = computePanel(trial, relics, data);
      best = Math.max(best, (Object.entries(shownPanel) as [StatKey, number][]).filter(([stat, shown]) => sameShown(stat, shown, panel[stat].total)).length);
    }
    return best + 2 * (names.get(info.name) ?? 0);
  };
  const nonZeroFits = (info: CharacterStats): boolean => {
    const trial: RosterCharacter = { id: info.id, level: level ?? 80, promotion: 6, eidolon: 0, lightcone: null, traces: Object.keys(info.statTraces), defaults: [] };
    trial.promotion = inferPromotion(trial, relics, shownPanel, data).promotion;
    const panel = computePanel(trial, relics, data);
    const shown = (Object.entries(shownPanel) as [StatKey, number][]).filter(([, value]) => value > 0);
    return shown.filter(([stat, value]) => sameShown(stat, value, panel[stat].total)).length * 2 >= shown.length;
  };
  const scored = characters.map((c) => ({ c, score: fit(c) })).sort((a, b) => b.score - a.score);
  const notFound = new Error(`认不出这是哪个角色（识别到「${nameText.replace(/\s/g, "")}」），请确认是米游社的「星穹铁道战绩」生成的分享图。`);
  if (!scored.length || scored[0].score < 2) throw notFound;
  const info = scored[0].c;
  // 名字没认出来、全靠面板猜的时候，看图上不为 0 的那些面板项对上了几项（0.0% 的项谁都对得上，不算数）。
  // 不到一半就明说可能认错了（那张截图被认成了星神★阿哈）；不直接拦下，因为跳过一件遗器时面板本来也会对不上几项。
  if ((names.get(info.name) ?? 0) < 0.5) {
    uncertain.push(nonZeroFits(info)
      ? `角色名没认清，按面板数值认成了${info.name}。`
      : `角色名没认清，面板也对不上几项，认成${info.name}很可能不对。请确认图是米游社「星穹铁道战绩」的分享图，不对就别导入。`);
  }
  for (const relic of relics) relic.equippedBy = info.id;
  progress(0.7);

  // 光锥
  let lightcone: RosterCharacter["lightcone"] = null;
  const coneText = await read("coneName", "text", cell(LAYOUT.coneName));
  const cone = matchName(coneText, [...data.lightcones.values()].map((c) => c.name));
  if (cone) {
    const coneInfo = [...data.lightcones.values()].find((c) => c.name === cone.name)!;
    const line = parseLevelLine(await read("coneLine", "text", cell(LAYOUT.coneLine)));
    const coneLevel = line?.level ?? 80;
    const exact = coneLevel <= 20 ? 0 : Math.ceil((coneLevel - 20) / 10);
    const boundary = coneLevel > 20 && coneLevel < 80 && (coneLevel - 20) % 10 === 0;
    lightcone = { id: coneInfo.id, level: coneLevel, promotion: Math.min(6, boundary ? exact + 1 : exact), superimpose: line?.superimpose ?? 1 };
    if (!line) uncertain.push("光锥的等级和叠影没认出来，按 80 级、叠影 1 算。");
    if (boundary) uncertain.push(`光锥 ${coneLevel} 级可能还没突破，按已突破算。`);
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
  const promotion = inferPromotion(character, relics, shownPanel, data);
  character.promotion = promotion.promotion;
  if (speedChoices.length) {
    const fitted = fitSpeed(character, relics, speedChoices, shownPanel.spd, data);
    uncertain.push(fitted ? "速度副词条图上只显示整数，小数部分按面板总速度反推，可能差零点几。" : "速度副词条图上只显示整数，小数部分按平均值估计。");
  }
  if (!promotion.certain) {
    character.defaults.push("promotion");
    uncertain.push(`${character.level} 级可能还没突破，按已突破算。`);
  }
  progress(1);
  return { character, relics, shownPanel, uncertain, raw };
}
