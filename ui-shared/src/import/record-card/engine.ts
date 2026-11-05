/**
 * 用 Tesseract.js 做识别引擎：一个中文 worker、一个只认数字的 worker。字库和引擎文件全部用本地路径
 * （页面里是随包的 features/roster/ocr/，测试里是 node_modules），不留默认的 CDN 地址。
 * Tesseract 模块由调用方传进来：页面打包浏览器版，测试用 node 版。
 */
import type { OcrEngine } from "./recognize.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface TesseractModule {
  createWorker: (langs: string, oem: number, options: Record<string, unknown>) => Promise<any>;
}

export interface EnginePaths {
  /** 中文、英文字库所在目录（各自一个 *.traineddata.gz）。 */
  chiLangPath: string;
  engLangPath: string;
  /** 浏览器里要给 worker 和 core 的地址；node 里不用。 */
  workerPath?: string;
  corePath?: string;
  /** node 里缓存解压后的字库；浏览器里不用。 */
  cachePath?: string;
  /** 浏览器里 worker 直接从 workerPath 启动（不经 blob），包装脚本才能找到同目录的字库文件。 */
  workerBlobURL?: boolean;
}

export interface Engine extends OcrEngine {
  close(): Promise<void>;
}

const SINGLE_BLOCK = "6";

export async function createEngine(tesseract: TesseractModule, paths: EnginePaths): Promise<Engine> {
  const common: Record<string, unknown> = { gzip: true };
  if (paths.workerPath) common.workerPath = paths.workerPath;
  if (paths.corePath) common.corePath = paths.corePath;
  if (paths.workerBlobURL === false) common.workerBlobURL = false;
  if (paths.cachePath) common.cachePath = paths.cachePath;
  else common.cacheMethod = "none";
  const [zh, digits, zhDigits] = await Promise.all([
    tesseract.createWorker("chi_sim", 1, { ...common, langPath: paths.chiLangPath }),
    tesseract.createWorker("eng", 1, { ...common, langPath: paths.engLangPath }),
    tesseract.createWorker("chi_sim", 1, { ...common, langPath: paths.chiLangPath }),
  ]);
  await zh.setParameters({ tessedit_pageseg_mode: SINGLE_BLOCK });
  await digits.setParameters({ tessedit_pageseg_mode: SINGLE_BLOCK, tessedit_char_whitelist: "0123456789.%+" });
  await zhDigits.setParameters({ tessedit_pageseg_mode: SINGLE_BLOCK, tessedit_char_whitelist: "0123456789.%+" });
  const run = async (worker: any, image: Uint8Array): Promise<string> => (await worker.recognize(image)).data.text as string;
  return {
    text: (image) => run(zh, image),
    digits: (image) => run(digits, image),
    digitsAlt: (image) => run(zhDigits, image),
    close: async () => { await Promise.all([zh.terminate(), digits.terminate(), zhDigits.terminate()]); },
  };
}
