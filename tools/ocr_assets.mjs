/**
 * 「角色与遗器」识图用的文件，从 node_modules 生成到 modules/honkai-star-rail/features/roster/ocr/。
 * 这些文件不提交（.gitignore），build_pages 和 build_site 都会生成。
 *
 * - B站 Toy 只收 .js、.json、图片这类网页文件：字库（.traineddata.gz）转成 base64 存进 <语言>.lang.js，
 *   由 ocr-worker.js 接住 Tesseract 的下载请求；许可证也写进 .js 的注释里。
 * - 删掉库里写死的 CDN 默认地址：页面总是传本地路径，用不到它们；Toy 包不允许出现这些地址（打包会整站扫描）。
 * - 只带不需要 SIMD 的 LSTM 引擎（兼容所有 WebView）；字库用 best_int（体积小、准确率够）。
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const NM = join(ROOT, "node_modules");
export const OCR_DIR = join(ROOT, "modules", "honkai-star-rail", "features", "roster", "ocr");

/** 删掉 jsDelivr 的默认地址（留空字符串，库里就不会去请求外网）。 */
export const stripCdn = (text) => text.replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/[^"'`\s]*/g, "");

const text = (path) => readFileSync(path, "utf-8");
const lang = (code) => () => `self.OCR_LANG=self.OCR_LANG||{};self.OCR_LANG[${JSON.stringify(code)}]=${JSON.stringify(readFileSync(join(NM, "@tesseract.js-data", code, "4.0.0_best_int", `${code}.traineddata.gz`)).toString("base64"))};\n`;

/** 发布名 → [来源文件（判断要不要重新生成）, 生成内容]。 */
export const OCR_FILES = {
  "tesseract.min.js": [join(NM, "tesseract.js", "dist", "tesseract.min.js"), () => stripCdn(text(join(NM, "tesseract.js", "dist", "tesseract.min.js")))],
  "worker.min.js": [join(NM, "tesseract.js", "dist", "worker.min.js"), () => stripCdn(text(join(NM, "tesseract.js", "dist", "worker.min.js")))],
  "tesseract-core-lstm.wasm.js": [join(NM, "tesseract.js-core", "tesseract-core-lstm.wasm.js"), () => stripCdn(text(join(NM, "tesseract.js-core", "tesseract-core-lstm.wasm.js")))],
  "ocr-worker.js": [join(ROOT, "roster-ui", "src", "ocr-worker.js"), () => text(join(ROOT, "roster-ui", "src", "ocr-worker.js"))],
  "chi_sim.lang.js": [join(NM, "@tesseract.js-data", "chi_sim", "4.0.0_best_int", "chi_sim.traineddata.gz"), lang("chi_sim")],
  "eng.lang.js": [join(NM, "@tesseract.js-data", "eng", "4.0.0_best_int", "eng.traineddata.gz"), lang("eng")],
  "licenses.js": [join(NM, "tesseract.js", "LICENSE.md"), () => `/* 识图用到的开源组件和它们的许可证（都是 Apache-2.0）。\n\n== tesseract.js ==\n${text(join(NM, "tesseract.js", "LICENSE.md")).replaceAll("*/", "* /")}\n\n== tesseract.js-core ==\n${text(join(NM, "tesseract.js-core", "LICENSE")).replaceAll("*/", "* /")}\n\n== 字库：tesseract-ocr/tessdata（@tesseract.js-data/chi_sim、eng，best_int）== Apache-2.0\n*/\n`],
};

/** 生成到 outDir（默认是功能目录下的 ocr/），返回写了哪些文件。来源比目标新或目标不存在时才写。 */
export function writeOcrAssets(outDir = OCR_DIR) {
  mkdirSync(outDir, { recursive: true });
  const written = [];
  for (const [name, [from, make]] of Object.entries(OCR_FILES)) {
    if (!existsSync(from)) throw new Error(`缺少识图文件 ${from}，先运行 npm ci`);
    const to = join(outDir, name);
    if (existsSync(to) && statSync(to).mtimeMs >= statSync(from).mtimeMs) continue;
    writeFileSync(to, make(), "utf-8");
    written.push(name);
  }
  return written;
}

if (process.argv[1] && process.argv[1].endsWith("ocr_assets.mjs")) {
  console.log(`[OK] 识图文件 -> ${OCR_DIR}（${writeOcrAssets().length} 个更新）`);
}
