/** 页面里的识图：按需加载随包的 Tesseract.js（ocr/ 目录），把图片解码成像素交给 recognizeCard。 */
import { createEngine, type Engine } from "../../ui-shared/src/import/record-card/engine.ts";
import type { RelicIcons } from "../../ui-shared/src/import/record-card/intl.ts";
import { recognizeCard, type CardResult } from "../../ui-shared/src/import/record-card/recognize.ts";
import type { Pixels } from "../../ui-shared/src/import/record-card/preprocess.ts";
import type { StatData } from "../../ui-shared/src/stats/types.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
let engine: Promise<Engine> | null = null;

function loadScript(src: string): Promise<void> {
  if ((globalThis as any).Tesseract) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("识图组件没加载出来，请检查工具箱是不是完整的。"));
    document.head.append(script);
  });
}

/** 第一次识图时才加载引擎和字库（约 10 MB），之后复用。 */
export function getEngine(base: string): Promise<Engine> {
  engine ??= loadScript(`${base}tesseract.min.js`).then(() => createEngine((globalThis as any).Tesseract, {
    chiLangPath: base, engLangPath: base, workerPath: `${base}ocr-worker.js`, corePath: `${base}tesseract-core-lstm.wasm.js`, workerBlobURL: false,
  }));
  engine.catch(() => { engine = null; });
  return engine;
}

export async function closeEngine(): Promise<void> {
  const current = engine;
  engine = null;
  if (current) await (await current).close().catch(() => undefined);
}

/** 有的手机相册和内嵌网页选图时不给文件类型（空字符串），这种要解码了才知道是不是图片。 */
export const notImage = (file: Pick<File, "type">): boolean => !!file.type && !file.type.startsWith("image/");

async function decode(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file);
  } catch {
    throw new Error(`「${file.name}」打不开：可能是手机的 HEIC 格式，或者图片损坏了。请存成 JPG 或 PNG 再导入。`);
  }
}

async function pixelsOf(file: File): Promise<Pixels> {
  const bitmap = await decode(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("浏览器不支持读取图片像素。");
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  return { width: image.width, height: image.height, data: image.data };
}

/** 国际服横版图才用的图标数据（遗器套装、词条图标），第一次用到时才加载，之后复用。 */
let icons: Promise<RelicIcons> | null = null;

export async function recognizeFile(file: File, data: StatData, base: string, loadIcons: () => Promise<RelicIcons>, onProgress?: (p: number) => void): Promise<CardResult> {
  if (notImage(file)) throw new Error(`「${file.name}」不是图片。`);
  const px = await pixelsOf(file);
  if (px.width < 600) throw new Error(`「${file.name}」太小了（宽 ${px.width}），请用原图，不要用聊天里压缩过的图。`);
  const relicIcons = () => {
    icons ??= loadIcons();
    icons.catch(() => { icons = null; });
    return icons;
  };
  return recognizeCard(px, data, await getEngine(base), onProgress, { relicIcons });
}
