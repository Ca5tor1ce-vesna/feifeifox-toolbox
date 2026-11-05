/**
 * 战绩分享图的排版。整张图按宽度等比缩放，这里的坐标以「图宽 = 702」为单位（2026-11-05 用 1280 宽的原图量的），
 * 用的时候乘以 图宽/702。上半部分（角色卡、光锥、行迹、面板）位置固定；遗器卡最多 3 行 2 列，每行 335。
 * 遗器卡上面的「有效副属性命中统计」高度不固定：命中的种类多时词条小标签排两排，少时只有一排，整张图就短 58。
 * 所以遗器卡从图的底部往上算（底部的「米游社星穹铁道战绩」一栏高度固定），不从顶部算。
 * 没穿遗器时那块是「暂未装备遗器」，整张图更短。
 */
import type { Rect } from "./preprocess.ts";

export interface Spot { x: number; y: number; r: number }

const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

export const LAYOUT = {
  width: 702,
  name: rect(48, 478, 145, 34),
  level: rect(198, 480, 55, 30),
  coneName: rect(355, 266, 300, 30),
  coneLine: rect(355, 299, 200, 28),
  /** 头像下面 6 个星魂图标：亮的是角色图，没解锁的是灰色的锁。 */
  eidolons: [62, 98, 133, 168, 204, 240].map((x): Spot => ({ x, y: 545, r: 10 })),
  /** 属性行迹图标：第一排 7 个、第二排 3 个，点亮的是白色。 */
  traces: [...[467, 497, 527, 557, 587, 617, 647].map((x): Spot => ({ x, y: 515, r: 8 })), ...[467, 497, 527].map((x): Spot => ({ x, y: 545, r: 8 }))],
  /** 面板左列 7 行的总值（生命、攻击、防御、速度、暴击率、暴击伤害、元素伤害）、右列 6 行。 */
  panelLeft: rect(268, 668, 72, 362),
  panelRight: rect(572, 668, 98, 310),
  /** 左列第 7 行的名字（「火属性伤害提高」），用来分开同名角色（开拓者、三月七）。 */
  elementLabel: rect(70, 992, 200, 30),
  relics: {
    /** 最后一行遗器卡的下沿到图底的距离（6 张样图都是 2574.4 高、第一行从 1395 开始：2574.4 - 1395 - 3×335）。 */
    bottomMargin: 174.4,
    rowHeight: 335,
    columns: [25, 358],
    title: rect(13, 10, 175, 28),
    labels: rect(40, 55, 135, 245),
    values: rect(215, 55, 100, 245),
    /**
     * 整块读漏了一行时，一行一行切开再读：主词条 + 最多 4 条副词条，第 k 行从 47 + 52.6k 开始、高 46（量自 1280 宽的样图）。
     * 只有一个字的行（速度「4」）在整块识别里常被跳过，单独切出来就认得出。
     */
    line: { top: 47, height: 46, step: 52.6, count: 5, label: { x: 40, w: 135 }, value: { x: 215, w: 100 } },
  },
  /** 没有遗器时图的高度（702 宽时约 1896），每多一行遗器卡多 325 左右。 */
  baseHeight: 1601,
};

export const PANEL_LEFT = ["hp", "atk", "def", "spd", "critRate", "critDmg", "element"] as const;
export const PANEL_RIGHT = ["breakEffect", "elation", "healBoost", "err", "ehr", "effectRes"] as const;

/** 702 单位的坐标换成这张图的像素。 */
export const scaleRect = (r: Rect, unit: number, dx = 0, dy = 0): Rect => ({ x: (r.x + dx) * unit, y: (r.y + dy) * unit, w: r.w * unit, h: r.h * unit });

/** 这张图大概有几行遗器卡（0~3）。只是估计，后面按标题能不能认出遗器名再确认。 */
export function relicRows(height: number, unit: number): number {
  const rows = Math.round((height / unit - LAYOUT.baseHeight) / LAYOUT.relics.rowHeight);
  return Math.max(0, Math.min(3, rows));
}

/** 第一行遗器卡的上沿（702 单位）：从图底往上数 rows 行。只是估计，见 relicRowTops。 */
export function relicTop(height: number, unit: number, rows: number): number {
  return height / unit - LAYOUT.relics.bottomMargin - rows * LAYOUT.relics.rowHeight;
}

/** 遗器卡的暖色标题条比卡片上沿低 5（702 单位）。 */
export const TITLE_BAR_OFFSET = 5;

/**
 * 每行遗器卡的上沿：在估计位置 ±60 内找到了暖色标题条就用实测的，找不到的行按估计值加上已找到那几行的平均偏差。
 * 不同手机生成的图比例略有不同（2026-11-05 一张 1200 宽的图，行距 337，样图是 335），只靠估计会差七八个单位、读歪标题。
 */
export function relicRowTops(estimated: number[], bars: number[]): number[] {
  const found = estimated.map((top) => {
    const near = bars.map((bar) => bar - TITLE_BAR_OFFSET).filter((at) => Math.abs(at - top) <= 60);
    return near.length ? near.reduce((best, at) => (Math.abs(at - top) < Math.abs(best - top) ? at : best)) : null;
  });
  const offsets = found.flatMap((at, i) => (at === null ? [] : [at - estimated[i]]));
  const shift = offsets.length ? offsets.reduce((sum, v) => sum + v, 0) / offsets.length : 0;
  return estimated.map((top, i) => found[i] ?? top + shift);
}

/** 没解锁的星魂显示一把锁：它在每张图上都一样，这是它 12×12 的亮度图案（2026-11-05 从 9 个锁图标取的平均）。
 * 和它的相关系数 0.95 以上是锁，其他图标都不到 0.6。 */
export const LOCK_SIGNATURE: readonly number[] = [-1.11,-1.06,-1.08,-1.08,-0.72,0.52,0.98,0.35,-0.8,-1.02,-1.06,-1.12,-1.08,-1.09,-1.08,-0.85,0.73,0.19,-0.42,0.46,0.47,-0.9,-1.08,-1.16,-1.09,-1.1,-0.94,-0.33,0.67,-0.81,-0.85,-0.78,0.8,-0.67,-0.99,-1.14,-1.12,-1.02,-0.13,0.75,1.04,0.52,0.53,0.55,1.1,0.56,-0.33,-1.04,-1.09,-0.92,0.76,1.32,1.33,1.32,1.34,1.32,1.32,1.32,0.54,-0.97,-1.06,-0.91,0.78,1.34,1.35,0.68,-0.18,0.97,1.34,1.33,0.57,-0.99,-1.05,-0.91,0.78,1.35,1.35,0.41,-0.64,0.83,1.34,1.34,0.52,-1.01,-1.03,-0.92,0.78,1.35,1.34,1.05,-0.1,1.28,1.34,1.34,0.48,-1.08,-1,-0.94,0.76,1.34,1.35,1.16,0.41,1.32,1.35,1.34,0.52,-1.01,-1.07,-0.94,0.68,1.33,1.34,1.34,1.33,1.34,1.35,1.33,0.41,-0.97,-1.11,-1.05,-0.69,-0.22,-0.23,-0.16,-0.06,-0.16,-0.18,-0.21,-0.76,-1.02,-0.66,-1.11,-1.07,-1.05,-1.04,-1.08,-0.98,-1.07,-1.05,-1.05,-1.06,-1.07];
export const LOCK_MATCH = 0.8;
/** 属性行迹图标点亮时平均亮度 140 以上，没点亮 116 以下。 */
export const TRACE_LIT_LUMA = 130;
/** 名字行（名字 + Lv 框）的上下边，702 单位。 */
export const NAME_LINE = { left: 45, top: 476, height: 38 };
