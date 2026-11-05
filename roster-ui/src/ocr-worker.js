/* 「角色与遗器」识图用的 worker 包装（tools/ocr_assets.mjs 原样复制到 features/roster/ocr/）。
 *
 * B站 Toy 只收 .js、.json、图片这类网页文件，字库（*.traineddata.gz）放不进去，所以字库存成 base64 的 .js：
 *   chi_sim.lang.js、eng.lang.js 各自写 self.OCR_LANG[语言] = "base64…"。
 * Tesseract 的 worker 会去 fetch「<langPath>/<语言>.traineddata.gz」，这里把这个请求接过来，改从对应的 .js 里取。
 * 页面创建 worker 时用 workerBlobURL: false，让 worker 直接从这个文件启动，才能用 self.location 找到同目录的文件。
 */
/* eslint-disable no-restricted-globals */
const base = self.location.href.replace(/[^/]*$/, "");
const realFetch = self.fetch.bind(self);
self.OCR_LANG = self.OCR_LANG || {};

self.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url;
  const match = String(url).match(/\/(chi_sim|eng)\.traineddata(\.gz)?$/);
  if (!match) return realFetch(input, init);
  const lang = match[1];
  if (!self.OCR_LANG[lang]) importScripts(`${base}${lang}.lang.js`);
  const text = atob(self.OCR_LANG[lang]);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i);
  return new Response(bytes);
};

importScripts(`${base}worker.min.js`);
