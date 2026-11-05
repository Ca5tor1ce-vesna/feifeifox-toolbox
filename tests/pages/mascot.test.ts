/** 浮动绯英（app/mascot.js）的纯函数：位置换算、搜索框摆放和搜索结果。拖动和点击在浏览器里验收。 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { panelPlace, searchResults, toFraction, toPoint } from "../../app/mascot.js";

const box = { left: 6, top: 6, right: 924, bottom: 574 };

test("位置：比例和像素互换，存下来的位置换窗口后还在窗口里", () => {
  assert.deepEqual(toPoint({ x: 1, y: 1 }, box), { left: 924, top: 574 });
  assert.deepEqual(toPoint({ x: 0, y: 0 }, box), { left: 6, top: 6 });
  assert.deepEqual(toFraction({ left: 465, top: 290 }, box), { x: 0.5, y: 0.5 });
  const smaller = toPoint({ x: 1, y: 1 }, { left: 6, top: 58, right: 313, bottom: 673 });
  assert.deepEqual(smaller, { left: 313, top: 673 });
});

test("位置：拖到窗口外面、存档里的值越界，都收回窗口内", () => {
  assert.deepEqual(toFraction({ left: -50, top: 9999 }, box), { x: 0, y: 1 });
  assert.deepEqual(toPoint({ x: 3, y: -2 }, box), { left: 924, top: 6 });
});

test("位置：窗口比她还小时不算出 NaN", () => {
  assert.deepEqual(toFraction({ left: 10, top: 10 }, { left: 6, top: 6, right: 6, bottom: 6 }), { x: 0, y: 0 });
});

const view = { width: 1000, height: 700 };
const panel = { width: 300, height: 340 };

test("搜索框：优先放她左边，和脚底对齐", () => {
  assert.deepEqual(panelPlace({ left: 924, right: 994, bottom: 664 }, panel, view), { left: 616, top: 324 });
});

test("搜索框：左边放不下就放右边", () => {
  assert.deepEqual(panelPlace({ left: 78, right: 148, bottom: 295 }, panel, view).left, 156);
});

test("搜索框：贴着窗口上边和右边时收进窗口", () => {
  assert.equal(panelPlace({ left: 78, right: 148, bottom: 100 }, panel, view).top, 8);
  assert.equal(panelPlace({ left: 200, right: 900, bottom: 500 }, panel, view).left, 692);
});

const modules = [{
  id: "honkai-star-rail",
  name: "崩坏：星穹铁道",
  tags: ["崩铁", "抽卡"],
  features: [
    { id: "gacha", name: "抽卡规划", tags: ["抽卡"] },
    { id: "speed-plan", name: "配速查询" },
    { id: "hidden", name: "隐藏工具", menu: false },
  ],
}];
const names = (text: string) => searchResults(modules, text).map((hit: { feature: { name: string } }) => hit.feature.name);

test("搜索结果：不打字列出菜单里的功能，打字只留匹配的，前后空格和大小写不影响", () => {
  assert.deepEqual(names(""), ["抽卡规划", "配速查询"]);
  assert.deepEqual(names("  抽卡 "), ["抽卡规划"]);
  assert.deepEqual(names("GACHA"), ["抽卡规划"]);
  assert.deepEqual(names("隐藏"), ["隐藏工具"]);
  assert.deepEqual(names("不存在"), []);
});
