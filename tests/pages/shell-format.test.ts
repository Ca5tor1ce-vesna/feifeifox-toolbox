/** 外壳拆出来的纯函数（app/format.js、app/status-page.js）：转义、Markdown、模块状态页。 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { escapeHtml, fmt } from "../../app/format.js";
import { statusPageHtml } from "../../app/status-page.js";

test("转义：页面里拼 HTML 时尖括号、引号、& 都要转义", () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
});

test("数字格式：空值显示横线，金额按千分位", () => {
  assert.equal(fmt.num(null), "-");
  assert.equal(fmt.num(1.234, 1), "1.2");
  assert.equal(fmt.pct(0.125, 1), "12.5%");
  assert.equal(fmt.money(14951.36), "14,951");
});

test("模块状态页：列出模块和功能，有诊断时逐条显示（内容会转义）", () => {
  const html = statusPageHtml({
    modules: [{ id: "hsr", name: "崩坏：星穹铁道", folder: "honkai-star-rail", version: "1.0", features: [{ id: "gacha", name: "抽卡规划", hasUi: true, actions: [] }] }],
    errors: [{ scope: "hsr/x", error: "缺少 <feature.json>" }],
  });
  assert.match(html, /抽卡规划/);
  assert.match(html, /诊断（1 条）/);
  assert.match(html, /缺少 &lt;feature\.json&gt;/);
  assert.match(statusPageHtml({ modules: [], errors: [] }), /一切正常/);
});
