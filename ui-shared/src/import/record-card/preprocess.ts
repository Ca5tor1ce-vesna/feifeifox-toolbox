/**
 * 识图前的像素处理（纯函数，浏览器和测试里都能跑）：切格子、灰度、放大、二值化，编码成 PGM 交给识别引擎。
 * 战绩分享图是深色底、白/金/橙色字，二值化后统一成白底黑字（识别引擎认这个最准）。
 */

/** RGBA 像素。浏览器里来自 canvas 的 getImageData，测试里来自 JPEG 解码。 */
export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

export interface Rect { x: number; y: number; w: number; h: number }

export interface Gray { width: number; height: number; data: Uint8Array }

const clampRect = (src: Pixels, rect: Rect): Rect => {
  const x = Math.max(0, Math.min(src.width - 1, Math.round(rect.x)));
  const y = Math.max(0, Math.min(src.height - 1, Math.round(rect.y)));
  return { x, y, w: Math.max(1, Math.min(src.width - x, Math.round(rect.w))), h: Math.max(1, Math.min(src.height - y, Math.round(rect.h))) };
};

/**
 * 从上往下逐行看 [xFrom, xTo) 这一段（702 单位）的平均颜色，找连续的暖色横条（红明显多于蓝），返回每条的上沿（702 单位）。
 * 遗器卡的标题条是这种暖色底，高约 38；minHeight 以下的短条（图标、花纹）不算。
 */
export function warmBands(src: Pixels, unit: number, xFrom: number, xTo: number, yFrom: number, yTo: number, minHeight = 25): number[] {
  const starts: number[] = [];
  let start = -1;
  let last = -10;
  const end = Math.min(yTo, src.height / unit - 1);
  for (let yu = yFrom; yu < end; yu += 1) {
    const y = Math.round(yu * unit);
    let r = 0;
    let b = 0;
    let n = 0;
    for (let xu = xFrom; xu < xTo; xu += 2) {
      const i = (y * src.width + Math.round(xu * unit)) * 4;
      r += src.data[i];
      b += src.data[i + 2];
      n += 1;
    }
    const warm = r / n - b / n > 35 && r / n > 110;
    if (warm) {
      if (yu - last > 2) start = yu;
      last = yu;
    } else if (start >= 0 && yu - last > 2) {
      if (last - start >= minHeight) starts.push(start);
      start = -1;
    }
  }
  if (start >= 0 && last - start >= minHeight) starts.push(start);
  return starts;
}

/** 切出一块并转灰度（按亮度：0.299R + 0.587G + 0.114B）。 */
export function cropGray(src: Pixels, rect: Rect): Gray {
  const r = clampRect(src, rect);
  const out = new Uint8Array(r.w * r.h);
  for (let y = 0; y < r.h; y += 1) {
    for (let x = 0; x < r.w; x += 1) {
      const i = ((r.y + y) * src.width + (r.x + x)) * 4;
      out[y * r.w + x] = Math.round(0.299 * src.data[i] + 0.587 * src.data[i + 1] + 0.114 * src.data[i + 2]);
    }
  }
  return { width: r.w, height: r.h, data: out };
}

/** 双线性放大。 */
export function upscale(img: Gray, factor: number): Gray {
  const width = Math.round(img.width * factor);
  const height = Math.round(img.height * factor);
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const sy = Math.min(img.height - 1, (y + 0.5) / factor - 0.5);
    const y0 = Math.max(0, Math.floor(sy));
    const y1 = Math.min(img.height - 1, y0 + 1);
    const fy = Math.max(0, sy - y0);
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(img.width - 1, (x + 0.5) / factor - 0.5);
      const x0 = Math.max(0, Math.floor(sx));
      const x1 = Math.min(img.width - 1, x0 + 1);
      const fx = Math.max(0, sx - x0);
      const top = img.data[y0 * img.width + x0] * (1 - fx) + img.data[y0 * img.width + x1] * fx;
      const bottom = img.data[y1 * img.width + x0] * (1 - fx) + img.data[y1 * img.width + x1] * fx;
      out[y * width + x] = Math.round(top * (1 - fy) + bottom * fy);
    }
  }
  return { width, height, data: out };
}

/** 大津法求阈值。 */
export function otsu(img: Gray): number {
  const hist = new Array<number>(256).fill(0);
  for (const v of img.data) hist[v] += 1;
  const total = img.data.length;
  let sum = 0;
  for (let i = 0; i < 256; i += 1) sum += i * hist[i];
  let sumB = 0;
  let weightB = 0;
  let best = 0;
  let threshold = 127;
  for (let t = 0; t < 256; t += 1) {
    weightB += hist[t];
    if (!weightB) continue;
    const weightF = total - weightB;
    if (!weightF) break;
    sumB += t * hist[t];
    const meanB = sumB / weightB;
    const meanF = (sum - sumB) / weightF;
    const between = weightB * weightF * (meanB - meanF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

/** 二值化成白底黑字：深色底上的亮字（战绩分享图）反过来。 */
export function binarize(img: Gray): Gray {
  const t = otsu(img);
  let bright = 0;
  for (const v of img.data) if (v > t) bright += 1;
  const textIsBright = bright < img.data.length / 2;
  const out = new Uint8Array(img.data.length);
  for (let i = 0; i < img.data.length; i += 1) {
    const isText = textIsBright ? img.data[i] > t : img.data[i] <= t;
    out[i] = isText ? 0 : 255;
  }
  return { width: img.width, height: img.height, data: out };
}

/** 四周加白边：字贴边时识别引擎容易漏字。 */
export function pad(img: Gray, size: number): Gray {
  const width = img.width + size * 2;
  const height = img.height + size * 2;
  const out = new Uint8Array(width * height).fill(255);
  for (let y = 0; y < img.height; y += 1) out.set(img.data.subarray(y * img.width, (y + 1) * img.width), (y + size) * width + size);
  return { width, height, data: out };
}

/** 编码成 PGM（P5）。识别引擎（Leptonica）直接认这个格式，不用再经过 PNG 编码。 */
export function toPgm(img: Gray): Uint8Array {
  const header = new TextEncoder().encode(`P5\n${img.width} ${img.height}\n255\n`);
  const out = new Uint8Array(header.length + img.data.length);
  out.set(header, 0);
  out.set(img.data, header.length);
  return out;
}

/** 一块区域的平均亮度（0~255）和平均饱和度（0~1）：判断星魂、行迹图标亮没亮。 */
export function tone(src: Pixels, rect: Rect): { luma: number; saturation: number } {
  const r = clampRect(src, rect);
  let luma = 0;
  let saturation = 0;
  for (let y = r.y; y < r.y + r.h; y += 1) {
    for (let x = r.x; x < r.x + r.w; x += 1) {
      const i = (y * src.width + x) * 4;
      const [red, green, blue] = [src.data[i], src.data[i + 1], src.data[i + 2]];
      const max = Math.max(red, green, blue);
      const min = Math.min(red, green, blue);
      luma += 0.299 * red + 0.587 * green + 0.114 * blue;
      saturation += max === 0 ? 0 : (max - min) / max;
    }
  }
  const n = r.w * r.h;
  return { luma: luma / n, saturation: saturation / n };
}

/** 切格子 → 放大 → 二值化 → 加白边 → PGM，一步到位。 */
export function cellImage(src: Pixels, rect: Rect, factor = 2): Uint8Array {
  return toPgm(pad(binarize(upscale(cropGray(src, rect), factor)), 16));
}

/** 只留接近白色的像素当字（名字是白字，压在花花绿绿的立绘上，按亮度二值化会把背景也当成字）。 */
export function whiteTextCell(src: Pixels, rect: Rect, factor = 2): Uint8Array {
  const r = clampRect(src, rect);
  const mask = new Uint8Array(r.w * r.h);
  for (let y = 0; y < r.h; y += 1) {
    for (let x = 0; x < r.w; x += 1) {
      const i = ((r.y + y) * src.width + (r.x + x)) * 4;
      const [red, green, blue] = [src.data[i], src.data[i + 1], src.data[i + 2]];
      const white = Math.min(red, green, blue) > 200 && Math.max(red, green, blue) - Math.min(red, green, blue) < 40;
      mask[y * r.w + x] = white ? 0 : 255;
    }
  }
  const big = upscale({ width: r.w, height: r.h, data: mask }, factor);
  for (let i = 0; i < big.data.length; i += 1) big.data[i] = big.data[i] < 128 ? 0 : 255;
  return toPgm(pad(big, 16));
}

/** 一块方形区域缩成 12×12 的亮度图案（减均值、除标准差），用来和已知图标（锁）比相似度。 */
export function signature(src: Pixels, rect: Rect, grid = 12): number[] {
  const values: number[] = [];
  for (let gy = 0; gy < grid; gy += 1) {
    for (let gx = 0; gx < grid; gx += 1) {
      const cell = { x: rect.x + (rect.w * gx) / grid, y: rect.y + (rect.h * gy) / grid, w: rect.w / grid, h: rect.h / grid };
      values.push(tone(src, cell).luma);
    }
  }
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length) || 1;
  return values.map((v) => (v - mean) / sd);
}

/** 两个图案的相关系数（-1~1）。 */
export const correlation = (a: number[], b: number[]): number => a.reduce((sum, v, i) => sum + v * (b[i] ?? 0), 0) / a.length;

/**
 * 名字行里「Lv.xx」那个米色框从哪开始（返回像素 x）：每一列数中间带里米色像素的比例，
 * 找 50 个单位宽、平均比例最高的窗口。名字长短不同，框的位置跟着变。
 */
export function findLevelBox(src: Pixels, unit: number, from = 90, to = 215, top = 484, bottom = 504): number {
  const y0 = Math.round(top * unit);
  const y1 = Math.round(bottom * unit);
  const column = (xu: number): number => {
    const x = Math.round(xu * unit);
    let hit = 0;
    for (let y = y0; y <= y1; y += 1) {
      const i = (y * src.width + x) * 4;
      const [red, green, blue] = [src.data[i], src.data[i + 1], src.data[i + 2]];
      if (red > 195 && green > 175 && red - blue > 28 && red - blue < 95) hit += 1;
    }
    return hit / (y1 - y0 + 1);
  };
  const cols = Array.from({ length: to + 60 }, (_, xu) => (xu >= from ? column(xu) : 0));
  let best = -1;
  let at = from;
  for (let start = from; start <= to; start += 1) {
    let sum = 0;
    for (let x = start; x < start + 50; x += 1) sum += cols[x];
    if (sum > best) {
      best = sum;
      at = start;
    }
  }
  return at;
}
