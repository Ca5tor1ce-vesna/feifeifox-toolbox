/**
 * 遗器图标的颜色指纹：认国际服战绩图上的遗器套装（那种图的遗器卡只写部位，不写套装名，只能看右上角的图标）。
 * 资料里每个单件的图标（带透明背景）和截图里的那一块都缩成 grid×grid 的平均颜色；比较时只看图标不透明的格子，
 * 截图里图标后面的卡片背景就不会干扰。两边用同一个函数算，口径一致。
 */
import type { Pixels, Rect } from "./preprocess.ts";

export const ICON_GRID = 12;

/** 一块区域缩成 grid×grid：每格是不透明像素的平均颜色（按不透明度加权）和平均不透明度，RGBA 各一个字节。 */
export function iconPrint(src: Pixels, rect: Rect, grid = ICON_GRID): Uint8Array {
  const out = new Uint8Array(grid * grid * 4);
  for (let gy = 0; gy < grid; gy += 1) {
    for (let gx = 0; gx < grid; gx += 1) {
      const x0 = Math.max(0, Math.floor(rect.x + (rect.w * gx) / grid));
      const x1 = Math.min(src.width, Math.max(x0 + 1, Math.floor(rect.x + (rect.w * (gx + 1)) / grid)));
      const y0 = Math.max(0, Math.floor(rect.y + (rect.h * gy) / grid));
      const y1 = Math.min(src.height, Math.max(y0 + 1, Math.floor(rect.y + (rect.h * (gy + 1)) / grid)));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const i = (y * src.width + x) * 4;
          const alpha = src.data[i + 3];
          r += src.data[i] * alpha; g += src.data[i + 1] * alpha; b += src.data[i + 2] * alpha; a += alpha; n += 1;
        }
      }
      const o = (gy * grid + gx) * 4;
      out[o] = a ? Math.round(r / a) : 0;
      out[o + 1] = a ? Math.round(g / a) : 0;
      out[o + 2] = a ? Math.round(b / a) : 0;
      out[o + 3] = n ? Math.round(a / n) : 0;
    }
  }
  return out;
}

export const encodePrint = (print: Uint8Array): string => btoa(String.fromCharCode(...print));
export const decodePrint = (text: string): Uint8Array => Uint8Array.from(atob(text), (ch) => ch.charCodeAt(0));

/**
 * 参考图标和截图那一块差多少：只看参考图标里基本不透明的格子（不透明度 ≥ 160），按颜色差的平方平均，越小越像。
 * 不透明的格子太少（不到 8 格）返回无穷大，免得拿几个格子凑出的「很像」当真。连结绳的图标很细，透明的地方多，
 * 门槛不能按比例定（2026-11-06：按四分之一算，大部分连结绳被直接排除，套装认错）。
 */
export function printDistance(reference: Uint8Array, crop: Uint8Array): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < reference.length; i += 4) {
    if (reference[i + 3] < 160) continue;
    const dr = reference[i] - crop[i], dg = reference[i + 1] - crop[i + 1], db = reference[i + 2] - crop[i + 2];
    sum += dr * dr + dg * dg + db * db;
    n += 1;
  }
  return n >= 8 ? sum / n : Infinity;
}
