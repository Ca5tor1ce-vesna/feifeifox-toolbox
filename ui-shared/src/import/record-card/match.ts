/** 战绩分享图识别的文字处理：识别引擎的原文 → 名字、属性、数值。纯函数。 */

/** 去掉空格、标点和强化记号，只留汉字、字母、数字。 */
const clean = (text: string): string => text.replace(/[\s　"'“”‘’»>«<·•.,，。、:：;；|!！?？()（）[\]【】{}~`_+*#@$^-]/g, "");

function distance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return prev[b.length];
}

/** 相似度：1 − 编辑距离 / 较长的长度。 */
const similarity = (a: string, b: string): number => (a.length || b.length ? 1 - distance(a, b) / Math.max(a.length, b.length) : 0);

/** 和每个候选比相似度，从高到低排好（同名的只留一个）。 */
export function rankNames(text: string, candidates: string[]): { name: string; score: number }[] {
  const raw = clean(text).replace(/\d+$/, "");
  if (!raw) return [];
  return [...new Set(candidates)]
    .map((name) => {
      const target = clean(name);
      return { name, score: target ? Math.max(similarity(raw, target), similarity(raw.slice(0, target.length), target)) : 0 };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * 在已知名单里找最像的。识别原文里常多出「+15」、等级这类尾巴，所以也试着只比前面和名字一样长的部分。
 * 最高分低于 0.5，或者和第二名一样高（分不出），返回 null。
 */
export function matchName(text: string, candidates: string[]): { name: string; score: number } | null {
  const raw = clean(text).replace(/\d+$/, "");
  if (!raw) return null;
  let best: { name: string; score: number } | null = null;
  let second = 0;
  for (const name of new Set(candidates)) {
    const target = clean(name);
    if (!target) continue;
    const score = Math.max(similarity(raw, target), similarity(raw.slice(0, target.length), target));
    if (!best || score > best.score) {
      second = best?.score ?? 0;
      best = { name, score };
    } else if (score > second) {
      second = score;
    }
  }
  return best && best.score >= 0.5 && best.score > second ? best : null;
}

/** 数值格子：「27.2%」→ 0.272（百分比按小数存），「705」→ 705。认不出返回 null。 */
export function parseStatValue(text: string): { value: number; percent: boolean } | null {
  const compact = text.replace(/\s/g, "");
  // 图上的百分数一律一位小数。百分号常被认成别的字（「9.7%」→「9.79%0」、「4.3%」→「4.37%」），所以带 % 的只取到小数点后一位。
  const percentMatch = compact.match(/^\+?(\d+\.\d)\d*%\d*$/);
  if (percentMatch) return { value: Math.round(Number(percentMatch[1]) * 10) / 1000, percent: true };
  const match = compact.match(/^\+?(\d+(?:\.\d+)?)(%?)$/);
  if (!match) return null;
  const percent = match[2] === "%";
  const value = Number(match[1]);
  return { value: percent ? Math.round(value * 10) / 1000 : value, percent };
}

/** 遗器上会出现的属性名（主词条、副词条）。元素伤害按「X属性伤害提高」写。 */
export const STAT_LABELS = [
  "生命值", "攻击力", "防御力", "速度", "暴击率", "暴击伤害", "效果命中", "效果抵抗", "击破特攻", "治疗量加成", "能量恢复效率",
  "物理属性伤害提高", "火属性伤害提高", "冰属性伤害提高", "雷属性伤害提高", "风属性伤害提高", "量子属性伤害提高", "虚数属性伤害提高",
];

/** 词条名一行：「暴击伤害 >2」→ 暴击伤害，强化过 2 次。强化记号在识别原文里可能是 » > ” 等，次数是行尾的数字。 */
export function parseLabel(text: string): { stat: string; rolls: number } | null {
  const rolls = text.match(/(\d)\s*$/);
  const body = rolls ? text.slice(0, rolls.index) : text;
  const match = matchName(body, STAT_LABELS);
  return match ? { stat: match.name, rolls: rolls ? Number(rolls[1]) : 0 } : null;
}

/** 等级行：角色「Lv.80」（识别出来常是「.80」），光锥「等级80 叠影5阶」（「叠」常认错，按「等级 N … M 阶」认）。 */
export function parseLevelLine(text: string): { level: number; superimpose: number | null } | null {
  const compact = text.replace(/\s/g, "");
  const cone = compact.match(/等?级(\d{1,2})\D+(\d)/);
  if (cone) return { level: Number(cone[1]), superimpose: Number(cone[2]) };
  // 「.401」这种多认出一位的，取前两位。
  const level = compact.match(/(?:Lv)?\.?(\d{1,2})\d*$/i);
  return level && Number(level[1]) >= 1 && Number(level[1]) <= 80 ? { level: Number(level[1]), superimpose: null } : null;
}
