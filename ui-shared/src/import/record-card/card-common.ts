/**
 * 两种战绩分享图（米游社中文长图、国际服英文横图）共用的部分：词条和数值配对、按数值表认遗器、
 * 按「算出的面板和图上对得上几项」挑角色和图上看不清的数（速度小数、读歪的副词条），以及收尾。
 * 排版各管各的（在哪儿读、读成什么词条名），读出来以后都走这里。
 */
import { inferSubAffix } from "../scanner-v4.ts";
import { computePanel, displayStat, inferPromotion } from "../../stats/panel.ts";
import type { CharacterStats, PieceInfo, RelicPiece, RosterCharacter, StatData, StatKey } from "../../stats/types.ts";
import { parseStatValue, type parseLabel } from "./match.ts";

export interface OcrEngine {
  /** 只认数字、小数点、百分号、加号的格子。 */
  digits(image: Uint8Array): Promise<string>;
  /** 中文格子。 */
  text(image: Uint8Array): Promise<string>;
  /** 另一个字库认数字（可选）：两个字库认错的地方不一样，遗器数值两边都读，按数值表挑对得上的。 */
  digitsAlt?(image: Uint8Array): Promise<string>;
  /** 英文格子（国际服的英文战绩图用；可选，没有就认不了英文图）。 */
  textEn?(image: Uint8Array): Promise<string>;
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

const ELEMENT_TYPE: Record<string, string> = {
  物理: "PhysicalAddedRatio", 火: "FireAddedRatio", 冰: "IceAddedRatio", 雷: "ThunderAddedRatio", 风: "WindAddedRatio", 量子: "QuantumAddedRatio", 虚数: "ImaginaryAddedRatio",
};
const LABEL_TYPES: Record<string, [string, string] | string> = {
  生命值: ["HPDelta", "HPAddedRatio"], 攻击力: ["AttackDelta", "AttackAddedRatio"], 防御力: ["DefenceDelta", "DefenceAddedRatio"],
  速度: "SpeedDelta", 暴击率: "CriticalChanceBase", 暴击伤害: "CriticalDamageBase", 效果命中: "StatusProbabilityBase",
  效果抵抗: "StatusResistanceBase", 击破特攻: "BreakDamageAddedRatioBase", 治疗量加成: "HealRatioBase", 能量恢复效率: "SPRatioBase",
};

/** 属性名（中文）+ 是不是百分比 → 资料里的属性。 */
export function labelType(label: string, percent: boolean): string | null {
  const element = label.match(/^(.+)属性伤害提高$/);
  if (element) return ELEMENT_TYPE[element[1]] ?? null;
  const entry = LABEL_TYPES[label];
  if (!entry) return null;
  return typeof entry === "string" ? entry : entry[percent ? 1 : 0];
}

export const lines = (text: string): string[] => text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

type Label = NonNullable<ReturnType<typeof parseLabel>>;
type Value = NonNullable<ReturnType<typeof parseStatValue>>;
export interface PairedLine { label: Label; options: Value[]; spare: Value[] }

/**
 * 少读或多读了一个字时可能的原文：去掉任意一个字（「9.1%」读成「92.1%」、「15.5%」读成「15.57%」），
 * 以及漏了小数点（「9.1%」读成「91%」）。只在原文怎么都对不上数值表时才用，见 buildRelic。
 */
function oneOffReads(text: string): string[] {
  const compact = text.replace(/\s/g, "");
  const out = new Set<string>();
  for (let i = 0; i < compact.length; i += 1) out.add(compact.slice(0, i) + compact.slice(i + 1));
  const noDot = compact.match(/^(\d+)(\d)%$/);
  if (noDot) out.add(`${noDot[1]}.${noDot[2]}%`);
  out.delete(compact);
  return [...out];
}

/**
 * 词条名和数值一行对一行配起来。values 是几种读法读出的行（整块读或逐行读、两种识别方式），行数和词条名一样的才用；
 * 每行把各种读法（以及去掉第一个字的读法：数值格子偏左时会带进左边文字的一个笔画）都留作候选，
 * 再把「少读或多读一个字」的读法另外留着（spare），原文对不上数值表时再试。有一行词条名没认出来、或某行一个能用的数都没有，就返回 null。
 */
export function pairLines(labels: ReturnType<typeof parseLabel>[], values: string[][]): PairedLine[] | null {
  if (!labels.length || !labels.every(Boolean)) return null;
  const usable = values.filter((set) => set.length === labels.length);
  if (!usable.length) return null;
  const parse = (texts: (string | undefined)[]): Value[] => texts.map((text) => (text ? parseStatValue(text) : null)).filter((v): v is Value => !!v);
  const rows = labels.map((label, i) => ({
    label: label!,
    options: parse(usable.flatMap((set) => [set[i], set[i]?.slice(1)])),
    spare: parse(usable.flatMap((set) => (set[i] ? oneOffReads(set[i]) : []))),
  }));
  return rows.every((row) => row.options.length || row.spare.length) ? rows : null;
}

/** 一条副词条有几种对得上数值表的认法，最后按面板挑（见 fitChoices）。 */
export interface SubChoice { relicIndex: number; subIndex: number; options: RelicPiece["subAffixes"][number][] }

/**
 * 按数值表把一件遗器认出来：pieceOptions 是可能的单件（按优先顺序），主词条数值要对得上这个等级，
 * 每条副词条要对得上次数和档位。速度只显示整数、读歪了一个字的副词条有几种可能，记进 choices，最后按面板挑。
 */
export function buildRelic(
  pieceOptions: [string, PieceInfo][], relicLevel: number, parsed: PairedLine[], id: string, relicIndex: number, data: StatData, choices: SubChoice[],
): RelicPiece | null {
  const [main, ...subs] = parsed;
  const mainValues = [...main.options, ...main.spare];
  for (const [pieceId, piece] of pieceOptions) {
    for (const value of mainValues) {
      const mainType = labelType(main.label.stat, value.percent);
      const mainAffix = Object.entries(data.mainAffixes[piece.mainGroup] ?? {}).find(([, affix]) => affix.type === mainType);
      if (!mainAffix) continue;
      const mainValue = mainAffix[1].base + mainAffix[1].step * relicLevel;
      if (Math.abs(mainValue - value.value) >= (value.percent ? 0.0015 : 1.5)) continue;
      const subGroup = data.subAffixes[piece.subGroup] ?? {};
      const subAffixes: RelicPiece["subAffixes"] = [];
      const pending: SubChoice[] = [];
      for (const sub of subs) {
        /** 一种读法对得上数值表的认法：速度只显示整数，可能有几个档位（第一个是平均档位）。 */
        const fit = (v: Value): RelicPiece["subAffixes"][number][] => {
          const type = labelType(sub.label.stat, v.percent);
          const found = Object.entries(subGroup).find(([, affix]) => affix.type === type);
          const shown = v.percent ? v.value * 100 : v.value;
          const guess = found && inferSubAffix(found[1].base, found[1].step, shown, v.percent, type === "SpeedDelta", sub.label.rolls ? sub.label.rolls + 1 : undefined);
          if (!found || !guess) return [];
          const steps = type === "SpeedDelta" ? [guess.step, ...guess.steps.filter((s) => s !== guess.step)] : [guess.step];
          return steps.map((step) => ({ affix: found[0], count: guess.count, step }));
        };
        // 原文对得上就用第一个对得上的读法；都对不上才试「读歪一个字」的读法，那时可能有几种，都留给面板挑。
        const direct = sub.options.map(fit).find((list) => list.length);
        const list = direct ?? sub.spare.flatMap(fit);
        if (!list.length) break;
        const unique = [...new Map(list.map((o) => [`${o.affix}:${o.count}:${o.step}`, o])).values()];
        subAffixes.push({ ...unique[0] });
        if (unique.length > 1) pending.push({ relicIndex, subIndex: subAffixes.length - 1, options: unique });
      }
      if (subAffixes.length !== subs.length) continue;
      choices.push(...pending);
      return { id, pieceId, level: relicLevel, mainAffix: mainAffix[0], subAffixes, equippedBy: null };
    }
  }
  return null;
}

/** 显示值和面板上的一项一样吗（百分比按一位小数）。 */
export function sameShown(stat: StatKey, shown: number, value: number): boolean {
  const asText = stat === "hp" || stat === "atk" || stat === "def" || stat === "spd" ? String(shown) : `${(shown * 100).toFixed(1)}%`;
  return displayStat(stat, value) === asText;
}

const matches = (character: RosterCharacter, relics: RelicPiece[], shown: Partial<Record<StatKey, number>>, data: StatData): number => {
  const panel = computePanel(character, relics, data);
  return (Object.entries(shown) as [StatKey, number][]).filter(([stat, value]) => sameShown(stat, value, panel[stat].total)).length;
};

/**
 * 图上看不清的副词条（速度只显示整数、读歪一个字的）有几种可能时，挑一组让算出的面板和图上对上最多项；
 * 一样多时挑最接近第一选择（速度是平均档位）的。组合太多（超过 4096）就只按第一选择。返回是不是全对上了。
 */
export function fitChoices(character: RosterCharacter, relics: RelicPiece[], choices: SubChoice[], shown: Partial<Record<StatKey, number>>, data: StatData): boolean {
  const total = Object.keys(shown).length;
  if (!choices.length) return matches(character, relics, shown, data) === total;
  const combos = choices.reduce((n, c) => n * c.options.length, 1);
  const set = (pick: number[]) => choices.forEach((choice, k) => { relics[choice.relicIndex].subAffixes[choice.subIndex] = { ...choice.options[pick[k]] }; });
  const original = choices.map((choice) => ({ ...relics[choice.relicIndex].subAffixes[choice.subIndex] }));
  if (combos > 4096) return matches(character, relics, shown, data) === total;
  let best: number[] | null = null;
  let bestScore = -1;
  let bestDistance = Infinity;
  const pick: number[] = [];
  const visit = (i: number): void => {
    if (i === choices.length) {
      set(pick);
      const score = matches(character, relics, shown, data);
      const distance = choices.reduce((sum, choice, k) => sum + Math.abs(choice.options[pick[k]].step - original[k].step) + pick[k] * 0.001, 0);
      if (score > bestScore || (score === bestScore && distance < bestDistance)) { bestScore = score; bestDistance = distance; best = [...pick]; }
      return;
    }
    for (let k = 0; k < choices[i].options.length; k += 1) { pick[i] = k; visit(i + 1); }
  };
  visit(0);
  set(best!);
  return bestScore === total;
}

/** 一个角色在给定遗器下，算出的面板和图上对得上几项（行迹全点和全不点各试一次，取好的）。 */
function fitScore(info: CharacterStats, level: number, relics: RelicPiece[], shown: Partial<Record<StatKey, number>>, data: StatData): number {
  let best = 0;
  for (const traces of [Object.keys(info.statTraces), []]) {
    const trial: RosterCharacter = { id: info.id, level, promotion: 6, eidolon: 0, lightcone: null, traces, defaults: [] };
    trial.promotion = inferPromotion(trial, relics, shown, data).promotion;
    best = Math.max(best, matches(trial, relics, shown, data));
  }
  return best;
}

/**
 * 认角色：名字只是线索（两个字的名字、英文名的大小写常认错），候选里每个都按「算出的面板和图上对得上几项」
 * 加上名字的相似度来排；没穿遗器、行迹没点的角色靠白值也能唯一确定。名字太不像、面板也对不上一半时提醒用户。
 */
export function pickCharacter(
  candidates: CharacterStats[], nameScores: Map<string, number>, level: number, relics: RelicPiece[], shown: Partial<Record<StatKey, number>>, data: StatData, uncertain: string[], notFound: () => Error,
): CharacterStats {
  const scored = candidates.map((c) => ({ c, score: fitScore(c, level, relics, shown, data) + 2 * (nameScores.get(c.id) ?? 0) })).sort((a, b) => b.score - a.score);
  if (!scored.length || scored[0].score < 2) throw notFound();
  const info = scored[0].c;
  if ((nameScores.get(info.id) ?? 0) < 0.5) {
    const trial: RosterCharacter = { id: info.id, level, promotion: 6, eidolon: 0, lightcone: null, traces: Object.keys(info.statTraces), defaults: [] };
    trial.promotion = inferPromotion(trial, relics, shown, data).promotion;
    const panel = computePanel(trial, relics, data);
    const nonZero = (Object.entries(shown) as [StatKey, number][]).filter(([, value]) => value > 0);
    const ok = nonZero.filter(([stat, value]) => sameShown(stat, value, panel[stat].total)).length * 2 >= nonZero.length;
    uncertain.push(ok
      ? `角色名没认清，按面板数值认成了${info.name}。`
      : `角色名没认清，面板也对不上几项，认成${info.name}很可能不对。请确认图是战绩分享图，不对就别导入。`);
  }
  return info;
}

/** 收尾：突破阶段、按面板挑看不清的副词条，写好要用户核对的说明。 */
export function finishCharacter(character: RosterCharacter, relics: RelicPiece[], choices: SubChoice[], shown: Partial<Record<StatKey, number>>, data: StatData, uncertain: string[]): void {
  const promotion = inferPromotion(character, relics, shown, data);
  character.promotion = promotion.promotion;
  if (choices.length) {
    const speedOnly = choices.every((choice) => data.subAffixes[data.pieces.get(relics[choice.relicIndex].pieceId)!.subGroup]?.[choice.options[0].affix]?.type === "SpeedDelta");
    const fitted = fitChoices(character, relics, choices, shown, data);
    if (speedOnly) uncertain.push(fitted ? "速度副词条图上只显示整数，小数部分按面板总速度反推，可能差零点几。" : "速度副词条图上只显示整数，小数部分按平均值估计。");
    else uncertain.push(fitted ? "有几条副词条的数字没读清，按面板总值挑了对得上的。" : "有几条副词条的数字没读清，按最可能的填了，请在遗器库里核对。");
  }
  if (!promotion.certain) {
    character.defaults.push("promotion");
    uncertain.push(`${character.level} 级可能还没突破，按已突破算。`);
  }
}

/**
 * 面板上某项两种读法不一样时（「124.4%」读成「124.6%」、「7.7%」读成「1.7%」），先按第一种读法放进 shown；
 * 角色和遗器都定下来以后，第一种对不上而另一种对得上的，换成对得上的那种。
 */
export function settlePanel(shown: Partial<Record<StatKey, number>>, alternates: Partial<Record<StatKey, number[]>>, character: RosterCharacter, relics: RelicPiece[], data: StatData): void {
  const panel = computePanel(character, relics, data);
  for (const [stat, values] of Object.entries(alternates) as [StatKey, number[]][]) {
    if (shown[stat] === undefined || sameShown(stat, shown[stat]!, panel[stat].total)) continue;
    const better = values.find((value) => sameShown(stat, value, panel[stat].total));
    if (better !== undefined) shown[stat] = better;
  }
}

/** 光锥等级 → 突破阶段（20 级以下 0，每 10 级一阶；正好 30/40… 时可能没突破，按已突破算并提醒）。 */
export function coneFromLevel(coneId: string, level: number, superimpose: number, uncertain: string[]): NonNullable<RosterCharacter["lightcone"]> {
  const exact = level <= 20 ? 0 : Math.ceil((level - 20) / 10);
  const boundary = level > 20 && level < 80 && (level - 20) % 10 === 0;
  if (boundary) uncertain.push(`光锥 ${level} 级可能还没突破，按已突破算。`);
  return { id: coneId, level, promotion: Math.min(6, boundary ? exact + 1 : exact), superimpose };
}
