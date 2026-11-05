/** 外壳拆出来的纯函数（app/format.js、app/status-page.js、app/sidebar.js）：转义、Markdown、模块状态页、功能搜索。 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { escapeHtml, fmt } from "../../app/format.js";
import { matchingFeatures } from "../../app/sidebar.js";
import { statusPageHtml } from "../../app/status-page.js";

const searchModule = {
  id: "honkai-star-rail",
  name: "崩坏：星穹铁道",
  tags: ["崩铁", "配速", "抽卡"],
  features: [
    { id: "speed-plan", name: "配速查询", tags: ["配速"] },
    { id: "gacha", name: "抽卡规划", tags: ["抽卡", "保底"] },
    { id: "hidden", name: "隐藏工具", description: "只有搜索才看得到", menu: false },
  ],
};
const searchIds = (needle: string) => matchingFeatures(searchModule, needle).map((f: { id: string }) => f.id);

test("搜索：模块标签里也有的词，只留下功能自己写到这个词的", () => {
  assert.deepEqual(searchIds("抽卡"), ["gacha"]);
  assert.deepEqual(searchIds("配速"), ["speed-plan"]);
});

test("搜索：功能都没写到的词按模块算，模块也没有就是空的", () => {
  assert.deepEqual(searchIds("崩铁"), ["speed-plan", "gacha", "hidden"]);
  assert.deepEqual(searchIds("不存在"), []);
});

test("搜索：menu:false 的功能平时不列，搜到才列", () => {
  assert.deepEqual(searchIds(""), ["speed-plan", "gacha"]);
  assert.deepEqual(searchIds("隐藏"), ["hidden"]);
});

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
