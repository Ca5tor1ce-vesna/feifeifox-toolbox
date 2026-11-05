/** Vue 功能页的 ui.js 和浏览器里的后端 app/backend.js 和源码同步，能单文件加载（用户的包里没有 Node.js，外壳直接加载它们）。 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { bundlePage, PAGES } from "../../tools/build_pages.mjs";

for (const name of Object.keys(PAGES)) {
  test(`${name} 页的 ui.js 和源码同步`, async () => {
    const fresh = await bundlePage(name);
    const committed = readFileSync(PAGES[name].out, "utf-8").replaceAll("\r\n", "\n");
    assert.ok(committed === fresh.replaceAll("\r\n", "\n"), `ui.js 过期了，运行 npm run build:pages`);
    assert.ok(!/(^|[;}])\s*import\s*[\w{*]/m.test(fresh), "不能有模块导入");
    assert.ok(!/from\s*["']\.{0,2}\//.test(fresh), "不能有相对导入");
    if (PAGES[name].format === "iife") assert.match(fresh, /^\/\*[^*]*\*\/\s*\(\(\)=>/, "后端是普通脚本，要在外壳之前加载");
    else assert.match(fresh.slice(-400), /export\s*\{[^}]*as default/);
  });
}
