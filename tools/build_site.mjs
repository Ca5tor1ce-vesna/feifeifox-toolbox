/** 把整个工具箱打成一个静态站点 build/site/：exe（Rust 外壳 desktop/）和 B站 Toy 网页包用的都是它。
 *
 *   node tools/build_site.mjs                  # → build/site/
 *   node tools/build_site.mjs --out <目录>
 *
 * 站点根目录：index.html（外壳）、app/（外壳脚本、样式、浏览器里的后端 backend.js、功能列表 registry.json）、
 * modules/<模块>/（manifest、data、assets、各功能的 feature.json + ui.js + style.css）。
 * 不带 api.py、源码、测试和用户数据。所有路径按站点根目录解析，放在 B站 Toy 的子路径下也能用。
 * Toy 的限制：入口 index.html 不超过 1 MB，整包不超过 50 MB。
 */
import { copyFile, mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeOcrAssets } from "./ocr_assets.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const SITE_DIR = join(ROOT, "build", "site");
export const SITE_LIMITS = { index: 1024 * 1024, total: 50 * 1024 * 1024 };
/** 站点里允许出现的文件类型（B站 Toy 只收常见的网页文件）。 */
export const SITE_TYPES = new Set([".html", ".js", ".css", ".json", ".png", ".jpg", ".webp", ".svg", ".ico", ".webm"]);
const FEATURE_FILES = new Set(["feature.json", "ui.js", "style.css"]);

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === "__pycache__" || entry.name.startsWith(".")) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(path)));
    else out.push(path);
  }
  return out;
}

/** 站点要带的文件：[源文件, 站点里的相对路径]。 */
export async function siteFiles() {
  const files = [[join(ROOT, "app", "index.html"), "index.html"]];
  for (const path of await walk(join(ROOT, "app"))) {
    if (path.endsWith("index.html")) continue;
    files.push([path, relative(ROOT, path)]);
  }
  for (const module of await readdir(join(ROOT, "modules"))) {
    const dir = join(ROOT, "modules", module);
    if (!existsSync(join(dir, "manifest.json"))) continue;
    const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf-8"));
    if (manifest.adminOnly) continue;
    files.push([join(dir, "manifest.json"), relative(ROOT, join(dir, "manifest.json"))]);
    for (const sub of ["data", "assets"]) {
      if (existsSync(join(dir, sub))) for (const path of await walk(join(dir, sub))) files.push([path, relative(ROOT, path)]);
    }
    for (const feature of existsSync(join(dir, "features")) ? await readdir(join(dir, "features")) : []) {
      const featureDir = join(dir, "features", feature);
      if (!existsSync(join(featureDir, "feature.json"))) continue;
      if (JSON.parse(await readFile(join(featureDir, "feature.json"), "utf-8")).hidden) continue;
      for (const name of await readdir(featureDir)) if (FEATURE_FILES.has(name)) files.push([join(featureDir, name), relative(ROOT, join(featureDir, name))]);
      // 识图文件（角色与遗器）：不提交，生成站点前从 node_modules 生成（tools/ocr_assets.mjs）。
      if (feature === "roster") writeOcrAssets();
      if (existsSync(join(featureDir, "ocr"))) for (const path of await walk(join(featureDir, "ocr"))) files.push([path, relative(ROOT, path)]);
    }
  }
  return files.map(([source, target]) => [source, target.replaceAll("\\", "/")]);
}

/** replace：{站点里的相对路径: 换成的源文件}，Toy 包和测试服包用它换掉外壳页、角色顶分页、行动轴页面和数据。
 * extra：{站点里的相对路径: 源文件}，额外加进站点的文件（Toy 包随包的角色顶分数据）。 */
export async function buildSite({ outDir = SITE_DIR, copy = true, replace = {}, extra = {} } = {}) {
  const files = (await siteFiles()).map(([source, target]) => [replace[target] ?? source, target]);
  const missing = Object.keys(replace).filter((target) => !files.some(([, t]) => t === target));
  if (missing.length) throw new Error(`要替换的文件站点里没有：${missing.join("、")}`);
  const clash = Object.keys(extra).filter((target) => files.some(([, t]) => t === target));
  if (clash.length) throw new Error(`要加的文件站点里已经有了：${clash.join("、")}`);
  for (const [target, source] of Object.entries(extra)) files.push([source, target]);
  const odd = files.filter(([, target]) => !SITE_TYPES.has(extname(target).toLowerCase()));
  if (odd.length) throw new Error(`站点里有网页用不到的文件：${odd.slice(0, 5).map(([, t]) => t).join("、")}`);
  let total = 0;
  for (const [source] of files) total += (await stat(source)).size;
  const index = await readFile(replace["index.html"] ?? join(ROOT, "app", "index.html"));
  if (index.length > SITE_LIMITS.index) throw new Error("index.html 超过 1 MB");
  if (total > SITE_LIMITS.total) throw new Error(`站点 ${(total / 1048576).toFixed(1)} MB，超过 B站 Toy 的 50 MB 上限`);
  if (copy) {
    await rm(outDir, { recursive: true, force: true });
    for (const [source, target] of files) {
      const path = join(outDir, target);
      await mkdir(dirname(path), { recursive: true });
      await copyFile(source, path);
    }
  }
  return { outDir, files: files.map(([, target]) => target), total };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outIndex = process.argv.indexOf("--out");
  const info = await buildSite({ outDir: outIndex > 0 ? resolve(process.argv[outIndex + 1]) : SITE_DIR });
  console.log(`[OK] 站点已生成 ${info.outDir}`);
  console.log(`   ${info.files.length} 个文件 · 共 ${(info.total / 1048576).toFixed(1)} MB`);
}
