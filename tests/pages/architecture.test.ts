/**
 * 分层依赖和基础格式的自动检查：代码规范里能交给机器的几条。
 * 目的：「高内聚、低耦合」光靠人记不住；把依赖方向写成测试，越界的 import 在提交后的 CI 里就会失败，不用等人在评审里发现。
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { test } from "node:test";

const ROOT = join(import.meta.dirname, "..", "..");
const tracked = execFileSync("git", ["-c", "core.quotepath=false", "ls-files", "-z"], { cwd: ROOT, encoding: "utf-8" })
  .split("\0")
  .filter(Boolean);
const read = (file: string): string => readFileSync(join(ROOT, file), "utf-8");

/**
 * 每个顶层目录能引用哪些别的顶层目录（自己目录内随便引用）。tools/、tests/ 是构建和测试，不受限制。
 * - axis-engine：只管战斗流程，不认识页面、外壳和面板计算，以后加伤害和敌人也在这里面长。
 * - ui-shared：各页面共用的类型、计算、导入解析和组件，不依赖任何具体页面。
 * - 各功能页（*-ui）：只用 ui-shared；行动轴页面还用引擎。页面之间不互相引用，要共用的东西先搬进 ui-shared。
 * - shell：浏览器里的后端，只用 ui-shared。app：外壳页面，是纯 JS，不引用打包的源码。
 */
const ALLOWED: Record<string, string[]> = {
  "axis-engine": [],
  "ui-shared": [],
  app: [],
  shell: ["ui-shared"],
  "speed-ui": ["ui-shared"],
  "gacha-ui": ["ui-shared"],
  "records-ui": ["ui-shared"],
  "roster-ui": ["ui-shared"],
  "axis-ui": ["ui-shared", "axis-engine"],
};

/**
 * 已知的越界引用，写成「谁 -> 被引用的文件」。
 * 目的：先登记、不放任；搬走以后这里的条目会被下面的测试报「已经用不到」，提醒删掉。
 * - 配速的计算还在配速页面目录里，行动轴的「读取我的配装」和后端的配速动作直接用它；该搬到 ui-shared。
 */
const KNOWN = new Set(["axis-ui -> speed-ui/src/calc.ts", "shell -> speed-ui/src/calc.ts"]);

const SOURCE = /\.(ts|vue|js|mjs)$/;
const RELATIVE_IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["'](\.{1,2}\/[^"']+)["']/g;

function crossings(): { violations: string[]; used: Set<string> } {
  const violations: string[] = [];
  const used = new Set<string>();
  for (const file of tracked) {
    const own = file.split("/")[0];
    if (!(own in ALLOWED) || !SOURCE.test(file)) continue;
    for (const match of read(file).matchAll(RELATIVE_IMPORT)) {
      const target = posix.normalize(posix.join(posix.dirname(file), match[1]));
      const top = target.split("/")[0];
      if (top === own || ALLOWED[own].includes(top)) continue;
      const key = `${own} -> ${target}`;
      if (KNOWN.has(key)) used.add(key);
      else violations.push(`${file} 引用了 ${target}`);
    }
  }
  return { violations, used };
}

test("各目录只按约定的方向互相引用", () => {
  assert.deepEqual(crossings().violations, []);
});

test("登记的越界引用都还存在（搬走了就把登记删掉）", () => {
  const { used } = crossings();
  assert.deepEqual([...KNOWN].filter((key) => !used.has(key)), []);
});

/**
 * ui-shared 里组件分两层（2026-11-06 用户定）：components/ 是通用组件，不认识游戏数据；hsr/ 是崩铁业务组件，
 * 把游戏数据转成通用组件要的选项。通用组件不能反过来引用业务组件、面板计算或导入解析，否则就不通用了。
 */
const GAME_SPECIFIC = ["ui-shared/src/hsr/", "ui-shared/src/stats/", "ui-shared/src/import/"];

test("通用组件不引用业务组件和游戏数据（ui-shared/src/components 不碰 hsr、stats、import）", () => {
  const hits = tracked
    .filter((file) => file.startsWith("ui-shared/src/components/") && SOURCE.test(file))
    .flatMap((file) => [...read(file).matchAll(RELATIVE_IMPORT)].map((match) => ({ file, target: posix.normalize(posix.join(posix.dirname(file), match[1])) })))
    .filter(({ target }) => GAME_SPECIFIC.some((prefix) => target.startsWith(prefix)))
    .map(({ file, target }) => `${file} 引用了 ${target}`);
  assert.deepEqual(hits, []);
});

test("引擎不依赖界面框架", () => {
  const hits = tracked
    .filter((file) => file.startsWith("axis-engine/") && SOURCE.test(file))
    .filter((file) => /from\s*["'](vue|reka-ui|motion-v)["']/.test(read(file)));
  assert.deepEqual(hits, []);
});

/**
 * 不用浏览器自带的弹框和弹窗：B站 Toy 把页面放在 iframe 里，exe 是 WebView2 窗口，这些功能会被静默拦掉，
 * 点了没反应（2026-11-06：遗器「删」用 window.confirm，在 Toy 里删不掉）。确认和提示用外壳的 window.GT_DIALOG。
 * 自己定义的同名函数（function confirm）和别的对象的方法（安装提示的 .prompt()）不算。
 */
const NATIVE_POPUPS = /(?<![.\w$])(?<!function\s+)(?:window\.)?(?:alert|confirm|prompt)\s*\(|\bwindow\.open\s*\(|\bbeforeunload\b/;

test("不用浏览器自带的弹框和弹窗（alert / confirm / prompt / window.open / beforeunload）", () => {
  const hits = tracked
    .filter((file) => file.split("/")[0] in ALLOWED && SOURCE.test(file))
    .flatMap((file) => read(file).split("\n").map((line, index) => ({ file, line: index + 1, text: line })))
    .filter(({ text }) => !/^\s*(\/\/|\*|\/\*)/.test(text) && NATIVE_POPUPS.test(text))
    .map(({ file, line, text }) => `${file}:${line} ${text.trim().slice(0, 80)}`);
  assert.deepEqual(hits, []);
});

/** 文件框藏起来（hidden / display:none）再用脚本去点，B站 App 里的 Toy 点了没反应（2026-11-06 识图导入）。 */
const HIDDEN_FILE_INPUT = /<input\b(?=[^>]*\btype="file")(?=[^>]*(?:\shidden\b|display:\s*none))[^>]*>/;

test("文件框盖在按钮上让人直接点，不藏起来再用脚本去点", () => {
  const hits = tracked
    .filter((file) => file.split("/")[0] in ALLOWED && /\.(vue|html)$/.test(file))
    .flatMap((file) => read(file).split("\n").map((line, index) => ({ file, line: index + 1, text: line })))
    .filter(({ text }) => HIDDEN_FILE_INPUT.test(text))
    .map(({ file, line, text }) => `${file}:${line} ${text.trim().slice(0, 80)}`);
  assert.deepEqual(hits, []);
});

/** 生成的文件和冻结的基准不归人手写，不查格式。 */
const GENERATED = [/\/ui\.js$/, /^beta\/\.archify\//, /^beta\/build\//, /^tests\/fixtures\//];
const TEXT = /\.(ts|vue|js|mjs|css|html|md|json|yml|yaml|py|ps1|rs|toml)$/;

test("文本文件：结尾有换行，没有行尾空格，不用 Tab 缩进", () => {
  const problems: string[] = [];
  for (const file of tracked) {
    if (!TEXT.test(file) || GENERATED.some((pattern) => pattern.test(file))) continue;
    const text = read(file);
    if (text && !text.endsWith("\n")) problems.push(`${file}：结尾没有换行`);
    if (!file.endsWith(".md") && /[ \t]+\r?\n/.test(text)) problems.push(`${file}：有行尾空格`);
    if (/^\t/m.test(text)) problems.push(`${file}：用了 Tab 缩进`);
  }
  assert.deepEqual(problems, []);
});
