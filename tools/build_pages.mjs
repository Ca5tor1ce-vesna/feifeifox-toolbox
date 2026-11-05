/** 把用 Vue 写的功能页打成各自功能目录里的 ui.js（全角色行动轴另有 build_axis_ui.mjs），
 * 把浏览器里的后端（shell/src/backend.ts）打成 app/backend.js，再扫 modules/ 生成功能列表 app/registry.json。
 *
 * 用法：node tools/build_pages.mjs            # 全部
 *       node tools/build_pages.mjs gacha      # 只打一个页面（registry 也会更新）
 * 产物要提交：用户的包里没有 Node.js，外壳直接加载这些文件，里面没有相对导入。
 * tests/pages/bundle.test.ts 检查它们和源码同步。
 */
import { build } from "esbuild";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { VUE_DEFINE, vuePlugin } from "./build_axis_ui.mjs";
import { OCR_DIR, writeOcrAssets } from "./ocr_assets.mjs";
import { whatsNew } from "./changelog.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const FEATURES = join(ROOT, "modules", "honkai-star-rail", "features");

/** 页面名 → 源码入口和产物位置。 */
export const PAGES = {
  speed: { source: "speed-ui", entry: join(ROOT, "speed-ui", "src", "main.ts"), out: join(FEATURES, "speed-plan", "ui.js") },
  gacha: { source: "gacha-ui", entry: join(ROOT, "gacha-ui", "src", "main.ts"), out: join(FEATURES, "gacha", "ui.js") },
  records: { source: "records-ui", entry: join(ROOT, "records-ui", "src", "main.ts"), out: join(FEATURES, "records", "ui.js") },
  roster: { source: "roster-ui", entry: join(ROOT, "roster-ui", "src", "main.ts"), out: join(FEATURES, "roster", "ui.js") },
  backend: { source: "shell", entry: join(ROOT, "shell", "src", "backend.ts"), out: join(ROOT, "app", "backend.js"), format: "iife" },
};
export const REGISTRY_FILE = join(ROOT, "app", "registry.json");
export const WHATS_NEW_FILE = join(ROOT, "app", "whats-new.json");
/** 更新内容弹窗的数据：package.json 版本在修改记录里的那一节。 */
export const buildWhatsNew = () => JSON.stringify(whatsNew(JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")).version), null, 1) + "\n";
const TOOLBOX_NAME = "绯绯狐工具箱";

const readJson = (path) => JSON.parse(readFileSync(path, "utf-8").replace(/^﻿/, ""));
const order = (value) => (Number.isInteger(Number(value || 100)) ? Number(value || 100) : 100);

/** 扫 modules/ 生成功能列表，字段和以前 Python 的 /api/registry 一样（actions 由浏览器里的后端补上）。
 * feature.json 写了 hidden 的功能、manifest 标了 adminOnly 的模块不进列表。 */
export function buildRegistry() {
  const modulesDir = join(ROOT, "modules");
  const modules = [];
  const errors = [];
  for (const folder of readdirSync(modulesDir).sort()) {
    const manifestPath = join(modulesDir, folder, "manifest.json");
    if (!existsSync(manifestPath)) continue;
    const meta = readJson(manifestPath);
    if (meta.adminOnly) continue;
    const id = String(meta.id || folder);
    const dataDir = join(modulesDir, folder, "data");
    const module = {
      id, folder, name: String(meta.name || folder), icon: String(meta.icon || "🎮"), version: String(meta.version || "0.0.0"),
      gameVersion: String(meta.gameVersion || ""), description: String(meta.description || ""), tags: Array.isArray(meta.tags) ? meta.tags.map(String) : [],
      accent: String(meta.accent || ""),
      dataFiles: existsSync(dataDir) ? readdirSync(dataDir).filter((name) => name.endsWith(".json")).map((name) => name.slice(0, -5)).sort() : [],
      features: [], order: order(meta.order),
    };
    const featuresDir = join(modulesDir, folder, "features");
    for (const featureFolder of existsSync(featuresDir) ? readdirSync(featuresDir).sort() : []) {
      const featurePath = join(featuresDir, featureFolder, "feature.json");
      if (!existsSync(featurePath)) {
        errors.push({ scope: `${id}/${featureFolder}`, error: "缺少 feature.json，已跳过该目录" });
        continue;
      }
      const f = readJson(featurePath);
      if (f.hidden) continue;
      const baseUrl = `/modules/${folder}/features/${featureFolder}`;
      const uiFile = String(f.ui || "ui.js");
      const hasUi = existsSync(join(featuresDir, featureFolder, uiFile));
      const hasStyle = existsSync(join(featuresDir, featureFolder, "style.css"));
      module.features.push({
        moduleId: id, id: String(f.id || featureFolder), name: String(f.name || featureFolder), icon: String(f.icon || "•"),
        description: String(f.description || ""), tags: Array.isArray(f.tags) ? f.tags.map(String) : [], order: order(f.order), menu: f.menu !== false,
        ...(f.shortName ? { shortName: String(f.shortName) } : {}),
        baseUrl, uiUrl: hasUi ? `${baseUrl}/${uiFile}` : null, styleUrl: hasStyle ? `${baseUrl}/style.css` : null, hasUi, hasApi: false, actions: [],
      });
    }
    module.features.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    if (module.features.length) modules.push(module);
  }
  modules.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  for (const module of modules) delete module.order;
  const version = readJson(join(ROOT, "package.json")).version;
  return JSON.stringify({ toolbox: { name: TOOLBOX_NAME, version }, modules, errors }, null, 1) + "\n";
}

/** B站 Toy 版的角色顶分页（读随包数据，不带镜像地址）；不提交，tools/package.mjs 打 Toy 包时现打。 */
export const RECORDS_TOY = { source: "records-ui", entry: join(ROOT, "records-ui", "src", "main-toy.ts") };

export async function bundlePage(name) {
  const page = PAGES[name];
  if (!page) throw new Error(`没有这个页面：${name}`);
  return bundleEntry(page);
}

export async function bundleEntry(page) {
  const result = await build({
    entryPoints: [page.entry],
    bundle: true,
    write: false,
    format: page.format ?? "esm",
    platform: "browser",
    target: "es2020",
    minify: true,
    legalComments: "none",
    logLevel: "silent",
    banner: { js: `/* 由 tools/build_pages.mjs 从 ${page.source}/ 生成，不要手改。 */` },
    define: VUE_DEFINE,
    plugins: [vuePlugin],
  });
  return result.outputFiles[0].text;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PAGES);
  for (const name of names) {
    const text = await bundlePage(name);
    await writeFile(PAGES[name].out, text, "utf-8");
    console.log(`[OK] ${name} -> ${PAGES[name].out}（${Math.round(text.length / 1024)} KB）`);
  }
  await writeFile(REGISTRY_FILE, buildRegistry(), "utf-8");
  console.log(`[OK] 功能列表 -> ${REGISTRY_FILE}`);
  await writeFile(WHATS_NEW_FILE, buildWhatsNew(), "utf-8");
  console.log(`[OK] 更新内容 -> ${WHATS_NEW_FILE}`);
  if (names.includes("roster")) console.log(`[OK] 识图文件 -> ${OCR_DIR}（${writeOcrAssets().length} 个更新）`);
}
