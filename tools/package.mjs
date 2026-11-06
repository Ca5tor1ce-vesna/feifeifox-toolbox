/** 打发布包（2026-11-04 起不再用 Python：exe 用 Rust 外壳，网页包给 B站 Toy）。
 *
 *   node tools/package.mjs              # exe 包 + Toy 网页包 + 这一版的发布说明
 *   node tools/package.mjs --portable   # 只打 exe 包（要 Rust：cargo + MSVC 工具链）
 *   node tools/package.mjs --toy        # 只打 B站 Toy 网页包
 *   node tools/package.mjs --beta       # 测试服网页包（换成 beta/ 里的行动轴页面和数据，只给内部测试）
 *   node tools/package.mjs --audit <zip...>   # 只审计指定的包
 *
 * 产物在 dist/，包名 feifeifox-toolbox-v<版本>-<种类>.zip（种类一个英文单词）；每次打完清掉 dist 里不是当前版本的文件。
 *   portable  FeifeiFoxToolbox.exe（整个站点嵌在里面）+ 使用说明.html + 空的 userdata/
 *   toy       整个工具箱的静态站点，zip 根目录就是 index.html。和 exe 里的站点有三处不同（buildToySite）：
 *             去掉 GitHub 链接、角色顶分读打包时抓好的数据（不连外网）、整站查过没有 GitHub 和镜像地址
 * 版本号以 package.json 为准，desktop/Cargo.toml 和 desktop/tauri.conf.json 要一致。
 * 输出只用 GBK 编得出的字符（[OK]/[X]），中文 Windows 控制台默认 GBK。
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSite, SITE_DIR } from "./build_site.mjs";
import { CHANGELOG_FILE, changelogSection } from "./changelog.mjs";
import { bundleEntry, RECORDS_TOY } from "./build_pages.mjs";
import { writeRecordsSnapshot } from "./records_snapshot.mjs";
import { listZip, writeZip } from "./zip.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, "dist");
const SLUG = "feifeifox-toolbox";
export const KINDS = { portable: ".zip", toy: ".zip", beta: ".zip", notes: ".md", steps: ".md" };
const TOY_LIMIT = 50 * 1024 * 1024;

export function versions() {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")).version;
  const cargo = readFileSync(join(ROOT, "desktop", "Cargo.toml"), "utf-8").match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  const tauri = JSON.parse(readFileSync(join(ROOT, "desktop", "tauri.conf.json"), "utf-8")).version;
  return { pkg, cargo, tauri };
}
export function version() {
  const { pkg, cargo, tauri } = versions();
  if (pkg !== cargo || pkg !== tauri) throw new Error(`版本号不一致：package.json ${pkg}、desktop/Cargo.toml ${cargo}、desktop/tauri.conf.json ${tauri}`);
  return pkg;
}
export const packagePath = (kind, v = version()) => join(DIST, `${SLUG}-v${v}-${kind}${KINDS[kind]}`);

// ---- 审计：发出去的包里不能有用户数据、浏览器痕迹、源码、测试服内容和 AI 文件 ---- //
const SENSITIVE = new Set(["cookies", "login data", "history", "web data", "local state", "top sites", "favicons", "local storage", "session storage", "edge-profile", "ebwebview"]);
export function auditNames(names) {
  const problems = [];
  for (const name of names) {
    const parts = name.split("/").filter(Boolean);
    const lower = parts.map((part) => part.toLowerCase());
    const base = lower.at(-1) ?? "";
    if (lower.some((part) => SENSITIVE.has(part))) problems.push([name, "浏览器配置或记录"]);
    else if (lower[0] === "beta" || lower.includes("beta") && lower.includes("tools")) problems.push([name, "测试服内容（私有仓库）"]);
    else if (lower.includes("userdata") && !name.endsWith("/") && !/^userdata\/[^/]*\.txt$/i.test(name)) problems.push([name, "userdata 里的真实数据"]);
    else if (/\.(py|pyc|log|tmp|dat|pma|ts|vue|rs|toml|lock)$/.test(base)) problems.push([name, "源码或运行痕迹"]);
    else if (["agents.md", "claude.md"].includes(base) || lower.some((part) => [".claude", ".github", ".archify", ".git", "node_modules"].includes(part))) problems.push([name, "AI 或开发文件"]);
  }
  return problems;
}
function audit(zipPath) {
  const problems = auditNames(listZip(readFileSync(zipPath)));
  if (problems.length) {
    for (const [name, reason] of problems.slice(0, 20)) console.log(`   [X] ${name}：${reason}`);
    throw new Error(`${zipPath} 里有不该发出去的东西（${problems.length} 条）`);
  }
  console.log(`   [OK] 审计干净：${zipPath.split(/[\\/]/).pop()}`);
}

function walk(dir, base = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path, base) : [path.slice(base.length + 1).replaceAll("\\", "/")];
  });
}
function save(zipPath, entries) {
  mkdirSync(DIST, { recursive: true });
  const buffer = writeZip(entries);
  writeFileSync(zipPath, buffer);
  audit(zipPath);
  const sha = createHash("sha256").update(buffer).digest("hex");
  console.log(`[OK] ${zipPath}`);
  console.log(`   大小 ${(buffer.length / 1048576).toFixed(1)} MB · 文件数 ${entries.filter((e) => !e.dir).length} · SHA256 ${sha}`);
  return buffer.length;
}
const siteEntries = (dir) => walk(dir).sort().map((name) => ({ name, data: readFileSync(join(dir, name)) }));

// ---- B站 Toy 版站点：不能带 GitHub 地址（2026-11-04，Toy 发布方的要求）---- //
const TOY_BUILD = join(ROOT, "build", "toy");
const RECORDS_DIR = "modules/honkai-star-rail/features/records";
/** Toy 版里不能出现的外部地址（GitHub 和它的镜像、CDN）。 */
export const TOY_FORBIDDEN = /github|jsdelivr|ghfast|gh-proxy/i;

/**
 * Toy 版不用平台的商业标识（上传协议 3.5(3)：不得使用「哔哩哔哩」「bilibili」及其变体、缩写；2026-11-05 用户决定只改 Toy 包，
 * exe 照旧）。B站空间的网址（space.bilibili.com）是平台自己的链接，可以留。
 */
export const TOY_BRAND = /[Bb]站|哔哩哔哩|bilibili(?!\.com)/;
const TOY_TEXT = [
  [/b站：/g, "主页："],
  [/ ?b站链接/g, "作者主页链接"],
  [/B站 App/g, "App"],
  [/\s?B站 Toy\s?/g, "网页版"],
  [/ ?(?:[Bb]站|哔哩哔哩|bilibili(?!\.com))/g, "平台"],
];
export const toyText = (text) => TOY_TEXT.reduce((out, [pattern, to]) => out.replace(pattern, to), text);

/**
 * 页面打包后中文常被写成 `站` 这种转义，按原文替换和扫描都看不到（2026-11-06「B站 App」就这样漏进了 Toy 包）。
 * 把中日文和全角标点的转义还原成原字：在 JS 的字符串、模板、正则和标识符里两种写法等价。前面是 `\\` 的（字面反斜杠）不动。
 */
export const unescapeCjk = (text) =>
  text.replace(/(?<!\\)\\u([0-9A-Fa-f]{4})/g, (match, hex) => {
    const code = parseInt(hex, 16);
    return (code >= 0x2e80 && code <= 0x9fff) || (code >= 0xff00 && code <= 0xffef) ? String.fromCharCode(code) : match;
  });

/** Toy 站点里的网页文件逐个换掉平台标识，换完再扫一遍，还有就报错。 */
function applyToyText(dir) {
  const left = [];
  for (const name of walk(dir).filter((n) => /\.(html|js|css|json)$/i.test(n))) {
    const path = join(dir, name);
    const raw = readFileSync(path, "utf-8");
    const text = /\.js$/i.test(name) ? unescapeCjk(raw) : raw;
    const out = toyText(text);
    if (out !== raw) writeFileSync(path, out, "utf-8");
    const hit = out.match(TOY_BRAND);
    if (hit) left.push(`${name}（${hit[0]}）`);
  }
  if (left.length) throw new Error(`Toy 版里还有平台的商业标识：${left.join("、")}`);
}

/** 去掉外壳页里 <!-- toy:omit --> … <!-- /toy:omit --> 包起来的部分（GitHub 仓库链接）。 */
export function stripToyOmit(html) {
  const out = html.replace(/[ \t]*<!-- toy:omit -->[\s\S]*?<!-- \/toy:omit -->\r?\n?/g, "");
  if (out.includes("toy:omit")) throw new Error("index.html 里的 toy:omit 标记没有配对");
  return out;
}

/** 站点里含禁用地址的文件：[[相对路径, 命中的词]]。 */
export function scanToyForbidden(dir) {
  return walk(dir).filter((name) => /\.(html|js|css|json)$/i.test(name)).flatMap((name) => {
    const hit = readFileSync(join(dir, name), "utf-8").match(TOY_FORBIDDEN);
    return hit ? [[name, hit[0]]] : [];
  });
}

/** Toy 版站点（Toy 包、测试服包共用）；replace 是再额外换掉的文件。 */
export async function buildToySite(outDir, replace = {}) {
  mkdirSync(TOY_BUILD, { recursive: true });
  const index = join(TOY_BUILD, "index.html");
  writeFileSync(index, stripToyOmit(readFileSync(join(ROOT, "app", "index.html"), "utf-8")), "utf-8");
  const records = join(TOY_BUILD, "records-ui.js");
  writeFileSync(records, await bundleEntry(RECORDS_TOY), "utf-8");
  const snapshot = await writeRecordsSnapshot(join(TOY_BUILD, "records-snapshot.json"));
  await buildSite({
    outDir,
    replace: { "index.html": index, [`${RECORDS_DIR}/ui.js`]: records, ...replace },
    extra: { [`${RECORDS_DIR}/records-snapshot.json`]: snapshot },
  });
  applyToyText(outDir);
  console.log("   [OK] Toy 版里的「B站」换成了中性说法");
  const leaks = scanToyForbidden(outDir);
  if (leaks.length) throw new Error(`Toy 版里还有 GitHub 或镜像地址：${leaks.map(([name, hit]) => `${name}（${hit}）`).join("、")}`);
  console.log("   [OK] Toy 版里没有 GitHub 和镜像地址");
  return outDir;
}

export async function packToy() {
  const outDir = await buildToySite(join(ROOT, "build", "site-toy"));
  const size = save(packagePath("toy"), siteEntries(outDir));
  if (size > TOY_LIMIT) throw new Error(`Toy 包 ${(size / 1048576).toFixed(1)} MB，超过平台 50 MB 上限`);
  console.log("   上传到 B站 Toy 创作后台（.webm 大招片段平台能播，2026-11-04 实测）");
}

export async function packBeta() {
  const replace = {
    "modules/honkai-star-rail/features/axis/ui.js": join(ROOT, "beta", "build", "axis-ui.js"),
    "modules/honkai-star-rail/data/axis_data.json": join(ROOT, "beta", "data", "honkai-star-rail", "axis_data.json"),
  };
  if (!Object.values(replace).every((path) => existsSync(path))) {
    throw new Error("没有测试服页面或数据：先 npm run build:axis-ui:beta，再在 beta/ 里导入测试服数据");
  }
  const outDir = join(ROOT, "build", "site-beta");
  await buildToySite(outDir, replace);
  save(packagePath("beta"), siteEntries(outDir));
  console.log("   测试服网页包：只给内部测试，不要发布（可以用 B站 Toy 的「链接访问」或 node tools/serve.mjs 打开）");
}

export async function packPortable() {
  await buildSite({ outDir: SITE_DIR });
  // 整个站点在编译时嵌进 exe（desktop/tauri.conf.json 的 frontendDist 指向 build/site）。
  const built = spawnSync("cargo", ["build", "--release", "--manifest-path", join(ROOT, "desktop", "Cargo.toml")], { stdio: "inherit", cwd: ROOT });
  if (built.status !== 0) throw new Error("Rust 外壳编译失败：确认装了 Rust（cargo）和 MSVC 生成工具，再看上面的报错");
  const exe = join(ROOT, "desktop", "target", "release", process.platform === "win32" ? "FeifeiFoxToolbox.exe" : "FeifeiFoxToolbox");
  if (!existsSync(exe)) throw new Error(`找不到编译出的 exe：${exe}`);
  const usage = readFileSync(join(ROOT, "packaging", "使用说明.html"), "utf-8")
    .replaceAll("{{version}}", version())
    .replaceAll("{{built_at}}", new Date().toLocaleString("zh-CN", { hour12: false }).slice(0, 16));
  save(packagePath("portable"), [
    { name: "FeifeiFoxToolbox.exe", data: readFileSync(exe), mode: 0o100755 },
    { name: "使用说明.html", data: Buffer.from(usage, "utf-8") },
    { name: "userdata/", dir: true },
  ]);
}

/** GitHub Release 的说明：下载哪个文件 + 修改记录里这一版那一节。 */
export function releaseNotes(v = version()) {
  const body = changelogSection(readFileSync(CHANGELOG_FILE, "utf-8"), v);
  return `# 绯绯狐工具箱 v${v}\n\n## 下载哪个\n\n| 文件 | 说明 |\n|---|---|\n`
    + `| \`${SLUG}-v${v}-portable.zip\` | 解压后双击 \`FeifeiFoxToolbox.exe\`，不用装任何东西（用系统自带的 WebView2） |\n`
    + `| \`${SLUG}-v${v}-toy.zip\` | B站 Toy 网页版的上传包，一般用户不用下载 |\n\n`
    + "第一次打开 exe 时 Windows 可能提示「已保护你的电脑」（exe 没有数字签名），点「更多信息」再点「仍要运行」。"
    + "你的存档在解压目录的 `userdata/` 里，换新版本时把这个文件夹复制过去就不会丢。\n\n"
    + `## 更新内容\n\n${body}\n`;
}

/** 清掉 dist 里不是当前版本的东西：旧版本、改名前的包、中间产物。 */
export function pruneDist(v = version()) {
  if (!existsSync(DIST)) return [];
  const keep = new Set(Object.keys(KINDS).map((kind) => packagePath(kind, v).split(/[\\/]/).pop()));
  const removed = [];
  for (const name of readdirSync(DIST).sort()) {
    if (keep.has(name)) continue;
    rmSync(join(DIST, name), { recursive: true, force: true });
    removed.push(name);
  }
  if (removed.length) console.log(`[清理] dist 里删掉旧文件 ${removed.length} 个：${removed.join("、")}`);
  return removed;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  try {
    if (args[0] === "--audit") {
      const targets = args.length > 1 ? args.slice(1) : (existsSync(DIST) ? readdirSync(DIST).filter((n) => n.endsWith(".zip")).map((n) => join(DIST, n)) : []);
      for (const target of targets) audit(resolve(target));
    } else {
      const v = version();
      if (!args.length || args.includes("--portable")) await packPortable();
      if (!args.length || args.includes("--toy")) await packToy();
      if (args.includes("--beta")) await packBeta();
      if (!args.length) writeFileSync(packagePath("notes", v), releaseNotes(v), "utf-8");
      pruneDist(v);
    }
  } catch (error) {
    console.error(`[X] ${error.message}`);
    process.exit(1);
  }
}
