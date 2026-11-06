/**
 * 国际服战绩页生成的横版分享图（2000×1818 左右；2026-11-06 用户给的英文 4 张、繁体中文 2 张样图量的）。坐标以「图宽 = 2000」为单位。
 * 同一个排版有多种界面语言，所以尽量不靠文字认：
 *   - 面板各语言行序一样，按第几行取数；生命、攻击、防御三行另外读白值（角色 + 光锥），光锥按白值认。
 *   - 遗器六张卡的部位顺序固定（头、手、躯干、脚、球、绳）；词条看行首的属性小图标（各语言一样），图标认不准再读文字；
 *     套装看卡片右上角的遗器图标（icon.ts）。
 *   - 角色和光锥的名字只作参考，最后都按算出的面板和图上对得上几项来定（card-common.ts）。
 */
import { computePanel } from "../../stats/panel.ts";
import type { CharacterStats, PieceInfo, RelicPiece, RosterCharacter, Slot, StatData, StatKey } from "../../stats/types.ts";
import { buildRelic, coneFromLevel, finishCharacter, labelType, pairLines, pickCharacter, settlePanel, type CardResult, type OcrEngine, type SubChoice } from "./card-common.ts";
import { decodePrint, iconPrint, printDistance } from "./icon.ts";
import { matchName, parseLabel, parseLevelLine, parseStatValue, rankNames } from "./match.ts";
import { cellImage, correlation, findLevelBox, signature, tone, warmBands, whiteTextCell, type Pixels, type Rect } from "./preprocess.ts";

export interface RelicIcons {
  grid: number;
  /** 「套装:部位」→ 遗器图标的颜色指纹。 */
  icons: Record<string, string>;
  /** 属性名（中文）→ 词条行首小图标的亮度图案（12×12，见 signature）。 */
  stats?: Record<string, number[]>;
}
export interface IntlOptions {
  /** 遗器图标和属性图标的数据（relic_icons.json），只在认横版图时才加载。 */
  relicIcons?: () => Promise<RelicIcons>;
}

const WIDTH = 2000;
const r = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

/** 英文属性名 → 中文名（card-common 按中文名查资料里的属性）。文字兜底时用。 */
const STAT_EN: Record<string, string> = {
  HP: "生命值", ATK: "攻击力", DEF: "防御力", SPD: "速度", "CRIT Rate": "暴击率", "CRIT DMG": "暴击伤害",
  "Effect Hit Rate": "效果命中", "Effect RES": "效果抵抗", "Break Effect": "击破特攻", "Outgoing Healing Boost": "治疗量加成",
  "Energy Regeneration Rate": "能量恢复效率",
  "Physical DMG Boost": "物理属性伤害提高", "Fire DMG Boost": "火属性伤害提高", "Ice DMG Boost": "冰属性伤害提高",
  "Lightning DMG Boost": "雷属性伤害提高", "Wind DMG Boost": "风属性伤害提高", "Quantum DMG Boost": "量子属性伤害提高",
  "Imaginary DMG Boost": "虚数属性伤害提高",
};
const ELEMENT_NAME: Record<string, string> = { Physical: "物理", Fire: "火", Ice: "冰", Thunder: "雷", Wind: "风", Quantum: "量子", Imaginary: "虚数" };
const ELEMENT_STAT: Record<string, StatKey> = {
  Physical: "dmgPhysical", Fire: "dmgFire", Ice: "dmgIce", Thunder: "dmgLightning", Wind: "dmgWind", Quantum: "dmgQuantum", Imaginary: "dmgImaginary",
};
const SLOTS: Slot[] = ["HEAD", "HAND", "BODY", "FOOT", "NECK", "OBJECT"];
const SLOT_NAME: Record<Slot, string> = { HEAD: "头部", HAND: "手部", BODY: "躯干", FOOT: "脚部", NECK: "位面球", OBJECT: "连结绳" };
/** 只有百分比的属性：图标认出来以后按有没有 % 核对一下。 */
const PERCENT_ONLY = new Set(["暴击率", "暴击伤害", "效果命中", "效果抵抗", "击破特攻", "治疗量加成", "能量恢复效率"]);

/** 英文属性名一行：「CRIT DMG »3」→ 暴击伤害，强化过 3 次。 */
export function parseLabelEn(text: string): { stat: string; rolls: number } | null {
  const rolls = text.match(/(\d)\s*$/);
  // 不分大小写（「DEF」常读成「Der」）；行首的小图标会读成「@®」「2」「#」这类，只留字母部分。
  const body = (rolls ? text.slice(0, rolls.index) : text).replace(/[»>”"'«]/g, " ").replace(/^[^A-Za-z]*(?:[A-Za-z]{1,2}[^A-Za-z]+(?=[A-Z]))?/, "").toLowerCase();
  const keys = Object.keys(STAT_EN);
  const match = matchName(body, keys.map((key) => key.toLowerCase()));
  const key = match && keys.find((k) => k.toLowerCase() === match.name);
  return key ? { stat: STAT_EN[key], rolls: rolls ? Number(rolls[1]) : 0 } : null;
}

/** 一段文字里的整数（「Lv. 80 Superimposition Lv. 1」「80級 疊影 1階」→ [80, 1]）。 */
const integers = (text: string): number[] => (text.match(/\d+/g) ?? []).map(Number);

/**
 * 强化次数：「»3」记号后面那一个数字（只认 1~5）。中、英两种原文都看：繁体图用英文读是乱码（「»19」），
 * 英文图用中文读也常丢记号。两边都没有记号就看行尾的单个数字。
 */
export function rollsOf(...texts: string[]): number {
  for (const text of texts) {
    const marked = text.match(/[»>”"'«]\s*([1-5])(?!\d)/);
    if (marked) return Number(marked[1]);
  }
  for (const text of texts) {
    const tail = text.match(/(?:^|\D)([1-5])\s*$/);
    if (tail) return Number(tail[1]);
  }
  return 0;
}

export const INTL_LAYOUT = {
  width: WIDTH,
  name: { left: 52, top: 80, height: 62, levelTop: 98, levelBottom: 116 },
  /** 面板：左列 7 行（生命、攻击、防御、速度、暴击率、暴击伤害、元素伤害）、右列 6 行，行距 56，第一行从 251 开始。 */
  panel: [
    { value: r(1195, 0, 125, 44), stats: ["hp", "atk", "def", "spd", "critRate", "critDmg", "element"] },
    { value: r(1765, 0, 150, 44), stats: ["breakEffect", "elation", "healBoost", "err", "ehr", "effectRes"] },
  ],
  panelTop: 251,
  rowStep: 56,
  /** 生命、攻击、防御三行左边的小字白值（上一行是白值，下一行是加成）。 */
  base: r(1135, 0, 72, 22),
  coneName: r(205, 1212, 500, 40),
  coneLine: r(205, 1252, 500, 32),
  /** 立绘下面 6 个星魂图标；没解锁的是暗色的锁。 */
  eidolons: [170, 250, 330, 410, 490, 570].map((x) => ({ x, y: 1038, r: 24 })),
  /** 属性行迹小图标：第一排 7 个、第二排 3 个，点亮的是白色。 */
  traces: [...[396, 440, 484, 528, 572, 616, 660].map((x) => ({ x, y: 1518, r: 12 })), ...[396, 440, 484].map((x) => ({ x, y: 1562, r: 12 }))],
  relics: {
    columns: [740, 1144, 1548],
    /** 两行遗器卡暖色标题条的上沿（估计值；实际按标题条找）。 */
    rows: [898, 1250],
    /** 标题里的「+15」。 */
    level: r(60, 6, 130, 38),
    /** 主词条和 4 条副词条：第 k 行从 52 + 56k 开始，高 48；行首图标中心在 (33, 77 + 56k)。 */
    line: { top: 52, step: 56, height: 48, count: 5, label: { x: 50, w: 214 }, value: { x: 255, w: 118 }, icon: { x: 33, y: 77, size: 30 } },
    /** 右上角的遗器图标：中心在 (335, 12)，边长约 72。 */
    icon: { cx: 335, cy: 12, size: 72 },
  },
};

/** 亮的星魂图标平均亮度明显高于锁（样图：亮的 110 以上，锁 60 以下）。 */
const EIDOLON_LIT_LUMA = 85;
/** 属性行迹小图标点亮时是白色。 */
const TRACE_LIT_LUMA = 150;
/** 属性图标的相关系数到这个以上才算认出来。 */
const STAT_ICON_MATCH = 0.75;

/** 卡片右上角那块和各候选图标比，挑最像的几个套装（小范围挪动、缩放找最贴合的位置）。 */
function rankSets(px: Pixels, unit: number, cx: number, cy: number, slot: Slot, icons: RelicIcons): { setId: string; distance: number }[] {
  const size = INTL_LAYOUT.relics.icon.size;
  const out: { setId: string; distance: number }[] = [];
  for (const [key, text] of Object.entries(icons.icons)) {
    const [setId, keySlot] = key.split(":");
    if (keySlot !== slot) continue;
    const reference = decodePrint(text);
    let best = Infinity;
    for (const scale of [0.9, 0.95, 1, 1.05, 1.1]) {
      for (let dx = -8; dx <= 8; dx += 2) {
        for (let dy = -8; dy <= 8; dy += 2) {
          const w = size * scale;
          const crop = iconPrint(px, { x: (cx - w / 2 + dx) * unit, y: (cy - w / 2 + dy) * unit, w: w * unit, h: w * unit }, icons.grid);
          best = Math.min(best, printDistance(reference, crop));
        }
      }
    }
    out.push({ setId, distance: best });
  }
  return out.sort((a, b) => a.distance - b.distance);
}

/** 词条行首的属性小图标 → 属性名（中文）；小范围挪动找最贴合的位置。认不准返回 null。 */
export function statFromIcon(px: Pixels, unit: number, cx: number, cy: number, stats: Record<string, number[]>): { stat: string; score: number } | null {
  const size = INTL_LAYOUT.relics.line.icon.size;
  let best: { stat: string; score: number } | null = null;
  for (let dx = -4; dx <= 4; dx += 2) {
    for (let dy = -4; dy <= 4; dy += 2) {
      const pattern = signature(px, { x: (cx - size / 2 + dx) * unit, y: (cy - size / 2 + dy) * unit, w: size * unit, h: size * unit });
      for (const [stat, reference] of Object.entries(stats)) {
        const score = correlation(pattern, reference);
        if (!best || score > best.score) best = { stat, score };
      }
    }
  }
  return best && best.score >= STAT_ICON_MATCH ? best : null;
}

/** 一张遗器卡里第 k 行图标的中心（2000 单位），采图标样子的工具也用它。 */
export const lineIconCenter = (column: number, top: number, k: number): { x: number; y: number } => {
  const { line } = INTL_LAYOUT.relics;
  return { x: column + line.icon.x, y: top + line.icon.y + k * line.step };
};

/** 两行遗器卡标题条的实际上沿（找不到就用估计值）。 */
export function relicRowTops(px: Pixels, unit: number): number[] {
  const { relics } = INTL_LAYOUT;
  const bars = relics.columns.flatMap((x) => warmBands(px, unit, x + 10, x + 160, 820, 1700));
  return relics.rows.map((estimate) => bars.filter((bar) => Math.abs(bar - estimate) <= 40).sort((a, b) => Math.abs(a - estimate) - Math.abs(b - estimate))[0] ?? estimate);
}

export async function recognizeIntlCard(px: Pixels, data: StatData, ocr: OcrEngine, onProgress?: (done: number) => void, options: IntlOptions = {}): Promise<CardResult> {
  const unit = px.width / WIDTH;
  const scaled = (rect: Rect, dx = 0, dy = 0): Rect => ({ x: (rect.x + dx) * unit, y: (rect.y + dy) * unit, w: rect.w * unit, h: rect.h * unit });
  const uncertain: string[] = [];
  const raw: Record<string, string> = {};
  const progress = (value: number) => onProgress?.(Math.min(1, value));
  const readDigits = async (key: string, rect: Rect) => (raw[key] = (await ocr.digits(cellImage(px, rect, 2))).trim());
  const readAlt = async (key: string, rect: Rect) => (ocr.digitsAlt ? (raw[key] = (await ocr.digitsAlt(cellImage(px, rect, 2))).trim()) : "");
  /** 读文字：英文、中文各读一次（不知道是哪种界面语言），返回两种原文。 */
  const readText = async (key: string, image: Uint8Array) => {
    const zh = (raw[key] = (await ocr.text(image)).trim());
    const en = ocr.textEn ? (raw[`${key}.en`] = (await ocr.textEn(image)).trim()) : "";
    return { zh, en };
  };

  // 面板：按行序取数。两种识别方式各读一次，读法不同的最后按算出的面板挑（settlePanel）。元素伤害那行等认出角色再定是哪种元素。
  const shownPanel: Partial<Record<StatKey, number>> = {};
  const alternates: Partial<Record<StatKey, number[]>> = {};
  let elementValues: number[] = [];
  for (const [side, column] of INTL_LAYOUT.panel.entries()) {
    for (const [k, stat] of column.stats.entries()) {
      const rect = scaled(column.value, 0, INTL_LAYOUT.panelTop + k * INTL_LAYOUT.rowStep);
      const values = [...new Set([await readDigits(`panel${side}.${k}`, rect), await readAlt(`panel${side}.${k}b`, rect)]
        .map(parseStatValue).filter((v) => !!v).map((v) => v!.value))];
      if (!values.length) continue;
      if (stat === "element") { elementValues = values; continue; }
      if (stat === "spd") values.splice(0, values.length, ...values.filter((v) => v >= 60 && v <= 400));
      if (!values.length) continue;
      shownPanel[stat as StatKey] = values[0];
      if (values.length > 1) alternates[stat as StatKey] = values.slice(1);
    }
  }
  // 生命、攻击、防御、速度四行左边的小字：上一行白值，下一行加成。白值用来认光锥；两个加起来就是总值，总值读漏一位
  // （「117」读成「17」）时拿它补回来。
  const bases: number[] = [];
  const statKeys: StatKey[] = ["hp", "atk", "def", "spd"];
  for (let k = 0; k < 4; k += 1) {
    const small = async (key: string, dy: number) => {
      const rect = scaled(INTL_LAYOUT.base, 0, INTL_LAYOUT.panelTop + dy + k * INTL_LAYOUT.rowStep);
      const value = parseStatValue(await readDigits(key, rect)) ?? parseStatValue(await readAlt(`${key}b`, rect));
      return value && !value.percent ? value.value : NaN;
    };
    const base = await small(`base${k}`, 1);
    const bonus = await small(`bonus${k}`, 21);
    bases.push(base);
    const sum = base + bonus;
    const stat = statKeys[k];
    if (!Number.isFinite(sum)) continue;
    // 白值 + 加成和总值的某种读法一样，就用那种读法（两处小字各自读出来还能对上，比单读总值可靠）。
    const reads = [shownPanel[stat], ...(alternates[stat] ?? [])].filter((v): v is number => v !== undefined);
    if (reads.includes(sum) || shownPanel[stat] === undefined) {
      shownPanel[stat] = sum;
      const rest = reads.filter((v) => v !== sum);
      if (rest.length) alternates[stat] = rest; else delete alternates[stat];
    } else {
      alternates[stat] = [...new Set([sum, ...(alternates[stat] ?? [])])];
    }
  }
  if (Object.keys(shownPanel).length < 12) uncertain.push("面板有几项没认出来，对比时会少几项。");
  progress(0.15);

  // 遗器：两行三列，部位按位置。词条看行首图标，套装看右上角图标。
  const icons = options.relicIcons ? await options.relicIcons().catch(() => null) : null;
  if (!icons) uncertain.push("遗器图标数据没加载出来，认不出套装，这次只导入角色。");
  const relics: RelicPiece[] = [];
  const choices: SubChoice[] = [];
  const { relics: layout } = INTL_LAYOUT;
  const tops = relicRowTops(px, unit);
  let index = 0;
  for (const top of icons ? tops : []) {
    for (const x of layout.columns) {
      const slot = SLOTS[index];
      index += 1;
      const levelText = await readDigits(`relic${index}.level`, scaled(layout.level, x, top));
      const relicLevel = Number(levelText.match(/(\d{1,2})\s*$/)?.[1] ?? 15);
      const { line } = layout;
      const labels: ReturnType<typeof parseLabel>[] = [];
      const first: string[] = [];
      const second: string[] = [];
      for (let k = 0; k < line.count; k += 1) {
        const dy = top + line.top + k * line.step;
        const valueRect = scaled({ x: line.value.x, y: 0, w: line.value.w, h: line.height }, x, dy);
        const value = await readDigits(`relic${index}.value${k}`, valueRect);
        const alt = await readAlt(`relic${index}.value${k}b`, valueRect);
        if (!value && !alt) break; // 低等级遗器只有 2~3 条副词条
        const labelImage = cellImage(px, scaled({ x: line.label.x, y: 0, w: line.label.w, h: line.height }, x, dy), 2);
        const center = lineIconCenter(x, top, k);
        const byIcon = icons?.stats ? statFromIcon(px, unit, center.x, center.y, icons.stats) : null;
        const percent = /%/.test(value + alt);
        let label: ReturnType<typeof parseLabel> = null;
        if (byIcon && !(PERCENT_ONLY.has(byIcon.stat) && !percent) && !(byIcon.stat === "速度" && percent)) {
          raw[`relic${index}.icon${k}`] = `${byIcon.stat} ${byIcon.score.toFixed(2)}`;
          // 只读强化次数（行尾的数字）：图标认出了是什么属性，文字只看「»3」。
          const text = k === 0 ? null : await readText(`relic${index}.label${k}`, labelImage);
          label = { stat: byIcon.stat, rolls: text ? rollsOf(text.en, text.zh) : 0 };
        } else {
          const text = await readText(`relic${index}.label${k}`, labelImage);
          label = parseLabelEn(text.en) ?? parseLabel(text.zh);
        }
        labels.push(label);
        first.push(value);
        second.push(alt);
      }
      const parsed = pairLines(labels, [first, second]);
      if (!parsed || parsed.length < 2) {
        uncertain.push(`第 ${index} 件遗器（${SLOT_NAME[slot]}）的词条没认全，已跳过。`);
        continue;
      }
      const ranked = rankSets(px, unit, x + layout.icon.cx, top + layout.icon.cy, slot, icons!);
      let picked: RelicPiece | null = null;
      // 图标最像的套装先试；主词条或副词条对不上数值表（稀有度不对）时再试下一个。
      for (const candidate of ranked.slice(0, 3)) {
        const pieceOptions: [string, PieceInfo][] = [...data.pieces.entries()]
          .filter(([, piece]) => piece.slot === slot && String(piece.setId) === candidate.setId)
          .sort((a, b) => b[1].rarity - a[1].rarity);
        picked = buildRelic(pieceOptions, relicLevel, parsed, `card-${index}`, relics.length, data, choices);
        if (picked) break;
      }
      if (!picked) {
        uncertain.push(`第 ${index} 件遗器（${SLOT_NAME[slot]}）的数值和数值表对不上，已跳过。`);
        continue;
      }
      if (ranked.length > 1 && ranked[1].distance < ranked[0].distance * 2) {
        const name = (id: string) => data.relicSets.get(id)?.name ?? id;
        uncertain.push(`第 ${index} 件遗器的套装按图标认成「${name(ranked[0].setId)}」，和「${name(ranked[1].setId)}」有点像，请核对。`);
      }
      relics.push(picked);
      progress(0.15 + (0.5 * index) / 6);
    }
  }

  // 名字和等级：名字是白字，右边是米色的等级框（「Lv. 80」或「80級」，只读数字）。
  const { name } = INTL_LAYOUT;
  const boxStart = findLevelBox(px, unit, 150, 700, name.levelTop, name.levelBottom);
  const nameText = await readText("name", whiteTextCell(px, { x: name.left * unit, y: name.top * unit, w: Math.max(40, boxStart - 10 - name.left) * unit, h: name.height * unit }));
  // 等级框（「Lv. 80」「80級」）：混着文字，用文字识别读（中、英各一次）再取 1~80 的整数，两位数优先。
  // 纯数字识别遇到「級」会乱读（读成「0」「8」）。
  const levelText = await readText("level", cellImage(px, { x: (boxStart - 12) * unit, y: (name.levelTop - 6) * unit, w: 90 * unit, h: 30 * unit }, 3));
  const levelReads = [...integers(levelText.zh), ...integers(levelText.en)].filter((v) => v >= 1 && v <= 80);
  const level = levelReads.sort((a, b) => String(b).length - String(a).length)[0] ?? null;
  if (!level) uncertain.push("等级没认出来，按 80 级算。");

  // 角色：名字（英文名、中文名都比一比）只作参考，按面板定。
  // 速度那行的白值就是角色自己的基础速度（光锥不加速度），先按它筛：名字读不全时（「丹恆·騰荒」只读出「丹恒」）也分得开。
  const all: CharacterStats[] = [...data.characters.values()];
  const bySpeed = Number.isFinite(bases[3]) ? all.filter((c) => c.promotions.some((row) => Math.floor(row.spd) === bases[3])) : [];
  const characters = bySpeed.length ? bySpeed : all;
  const nameScores = new Map<string, number>();
  for (const [text, pick] of [[nameText.en, (c: CharacterStats) => c.nameEn ?? ""], [nameText.zh, (c: CharacterStats) => c.name]] as const) {
    const ranked = new Map(rankNames(text, characters.map(pick)).map((x) => [x.name, x.score]));
    for (const c of characters) nameScores.set(c.id, Math.max(nameScores.get(c.id) ?? 0, ranked.get(pick(c)) ?? 0));
  }
  const info = pickCharacter(characters, nameScores, level ?? 80, relics, shownPanel, data, uncertain,
    () => new Error(`认不出这是哪个角色（识别到「${(nameText.en || nameText.zh).replace(/\s/g, " ")}」），请确认是战绩页生成的角色分享图。`));
  for (const relic of relics) relic.equippedBy = info.id;
  // 元素伤害那行：认出角色就知道是哪种元素；位面球的元素伤害主词条也按角色的元素算（图标只采到了物理的）。
  const elementStat = ELEMENT_STAT[info.element];
  if (elementStat && elementValues.length) {
    shownPanel[elementStat] = elementValues[0];
    if (elementValues.length > 1) alternates[elementStat] = elementValues.slice(1);
  }
  const want = ELEMENT_NAME[info.element] ? labelType(`${ELEMENT_NAME[info.element]}属性伤害提高`, true) : null;
  for (const relic of relics) {
    const group = data.mainAffixes[data.pieces.get(relic.pieceId)!.mainGroup] ?? {};
    const current = group[relic.mainAffix]?.type ?? "";
    if (!want || current === want || !/^(Physical|Fire|Ice|Thunder|Wind|Quantum|Imaginary)AddedRatio$/.test(current)) continue;
    const fixed = Object.entries(group).find(([, affix]) => affix.type === want);
    if (fixed) relic.mainAffix = fixed[0];
  }
  progress(0.75);

  let characterLevel: number | null = level;
  // 光锥：白值（角色 + 光锥）减去角色白值就是光锥的白值，在所有光锥里找对得上的；名字只在对得上的有几把时作参考。
  let lightcone: RosterCharacter["lightcone"] = null;
  // 「Lv. 80 Superimposition Lv. 1」「80級 疊影 1階」：第一个数是等级，最后一个数是叠影。中、英各读一次，哪种读出两个合理的数用哪种。
  const coneLineText = await readText("coneLine", cellImage(px, scaled(INTL_LAYOUT.coneLine), 3));
  const conePair = [integers(coneLineText.en), integers(coneLineText.zh)]
    .map((nums) => (nums.length >= 2 ? [nums[0], nums[nums.length - 1]] : null))
    .find((pair) => !!pair && pair[0] >= 1 && pair[0] <= 80 && pair[1] >= 1 && pair[1] <= 5) ?? null;
  const coneLevel = conePair?.[0] ?? 80;
  const superimpose = conePair?.[1] ?? 1;
  if (!conePair) uncertain.push("光锥的等级和叠影没认出来，按 80 级、叠影 1 算。");
  const coneText = await readText("coneName", cellImage(px, scaled(INTL_LAYOUT.coneName), 2));
  const knownBases = bases.filter((v) => Number.isFinite(v)).length;
  const trialPromotion = (lvl: number) => (lvl <= 20 ? 0 : Math.min(6, Math.ceil((lvl - 20) / 10)));
  // 光锥等级那行混着文字（「80級 疊影 1階」），数字常读错：先按读出的等级找，白值对不上再从 80 级往下挨个试。
  const fitsAt = (lvl: number) => [...data.lightcones.values()].filter((cone) => {
    const trial: RosterCharacter = { id: info.id, level: characterLevel ?? 80, promotion: trialPromotion(characterLevel ?? 80), eidolon: 0, lightcone: { id: cone.id, level: lvl, promotion: trialPromotion(lvl), superimpose }, traces: [], defaults: [] };
    const panel = computePanel(trial, [], data);
    return [panel.hp.base, panel.atk.base, panel.def.base].every((value, k) => !Number.isFinite(bases[k]) || Math.abs(Math.floor(value) - bases[k]) <= 1);
  });
  let fits: ReturnType<typeof fitsAt> = [];
  let coneLevelUsed = coneLevel;
  if (knownBases >= 2) {
    for (const lvl of [coneLevel, 80, 70, 60, 50, 40, 30, 20, 1]) {
      fits = fitsAt(lvl);
      if (fits.length) { coneLevelUsed = lvl; break; }
    }
    if (fits.length && !level) characterLevel = 80;
  }
  // 角色等级没读出来时，白值也带着等级：按 80、70… 级挨个试，白值对得上的就是。
  if (!fits.length && !level && knownBases >= 2) {
    for (const lvl of [70, 60, 50, 40, 30, 20, 1]) {
      characterLevel = lvl;
      fits = fitsAt(lvl === 1 ? 1 : coneLevel);
      if (fits.length) { coneLevelUsed = lvl === 1 ? 1 : coneLevel; break; }
    }
    if (!fits.length) characterLevel = null;
  }
  const coneScore = (c: { name: string; nameEn?: string }) => Math.max(rankNames(coneText.en, [c.nameEn ?? ""])[0]?.score ?? 0, rankNames(coneText.zh, [c.name])[0]?.score ?? 0);
  const coneChoice = (fits.length ? fits : [...data.lightcones.values()]).map((c) => ({ c, score: coneScore(c) })).sort((a, b) => b.score - a.score)[0];
  if (coneChoice && (fits.length || coneChoice.score >= 0.6)) {
    lightcone = coneFromLevel(coneChoice.c.id, fits.length ? coneLevelUsed : coneLevel, superimpose, uncertain);
    if (fits.length > 1 && coneChoice.score < 0.5) uncertain.push(`光锥按白值认成「${coneChoice.c.name}」，名字没读清，同样白值的还有 ${fits.length - 1} 把，请核对。`);
    if (!fits.length) uncertain.push(`光锥按名字认成「${coneChoice.c.name}」，白值没对上，请核对。`);
  }
  progress(0.85);

  // 星魂：从左数到第一个暗的；属性行迹：数点亮的个数。
  const spot = (s: { x: number; y: number; r: number }) => ({ x: (s.x - s.r) * unit, y: (s.y - s.r) * unit, w: s.r * 2 * unit, h: s.r * 2 * unit });
  const firstDark = INTL_LAYOUT.eidolons.findIndex((s) => tone(px, spot(s)).luma < EIDOLON_LIT_LUMA);
  const eidolon = firstDark < 0 ? 6 : firstDark;
  // 属性行迹：小图标按节点编号顺序排（第一排 7 个、第二排 3 个），亮着的位置就是点了的节点。
  const nodes = Object.keys(info.statTraces).sort();
  const traces = nodes.filter((_, i) => INTL_LAYOUT.traces[i] && tone(px, spot(INTL_LAYOUT.traces[i])).luma > TRACE_LIT_LUMA);
  if (traces.length > 0 && traces.length < nodes.length) uncertain.push(`属性行迹点亮了 ${traces.length} 个，按图上亮着的位置对应，请核对。`);

  // 白值对得上就是这个等级（白值随等级变，比读等级框的小字可靠），不用再让用户核对。
  if (!level && characterLevel) uncertain.splice(uncertain.indexOf("等级没认出来，按 80 级算。"), 1);
  const character: RosterCharacter = { id: info.id, level: characterLevel ?? 80, promotion: 6, eidolon, lightcone, traces, defaults: characterLevel ? [] : ["level"] };
  // 先按目前的副词条换一次读错的面板数，挑完看不清的副词条再换一次（两步互相依赖，各做一次就够）。
  settlePanel(shownPanel, alternates, character, relics, data);
  finishCharacter(character, relics, choices, shownPanel, data, uncertain);
  settlePanel(shownPanel, alternates, character, relics, data);
  progress(1);
  return { character, relics, shownPanel, uncertain, raw };
}
