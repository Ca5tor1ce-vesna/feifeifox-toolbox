/**
 * 战绩分享图的遗器卡位置（1.2「角色与遗器」识图）。遗器卡上面的「有效副属性命中统计」有一排或两排标签，高度不固定，
 * 所以遗器卡从图底往上算。2026-11-05 群里反馈：标签只有一排的图，识图后遗器 0 件（按固定位置去读，读到了遗器卡上面）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { relicRowTops, relicRows, relicTop } from "../../ui-shared/src/import/record-card/layout.ts";
import { warmBands } from "../../ui-shared/src/import/record-card/preprocess.ts";

test("两排标签（样图 702 宽时高 2574.4）：3 行遗器，第一行从 1395 开始", () => {
  assert.equal(relicRows(2574.4, 1), 3);
  assert.ok(Math.abs(relicTop(2574.4, 1, 3) - 1395) < 0.01);
});

test("只有一排标签（图短 58）：还是 3 行，第一行跟着上移到 1337", () => {
  assert.equal(relicRows(2516.4, 1), 3);
  assert.ok(Math.abs(relicTop(2516.4, 1, 3) - 1337) < 0.01);
});

test("找到标题条的行用实测位置，没找到的行按已找到的平均偏差挪", () => {
  // 群里那张 1200 宽的图：估计 1349.6 / 1684.6 / 2019.6，标题条实测在 1347 / 1685 / 2021（卡片上沿再往上 5）。
  assert.deepEqual(relicRowTops([1349.6, 1684.6, 2019.6], [1347, 1685, 2021]), [1342, 1680, 2016]);
  // 第二行是别的颜色、没找到：按第一、三行的平均偏差挪（-7.6 和 -3.6，平均 -5.6）。
  const [, middle] = relicRowTops([1349.6, 1684.6, 2019.6], [1347, 2021]);
  assert.ok(Math.abs(middle - 1679) < 0.01);
  // 一条都没找到：照估计值。离得太远（超过 60）的条不算。
  assert.deepEqual(relicRowTops([1395, 1730], []), [1395, 1730]);
  assert.deepEqual(relicRowTops([1395], [1500]), [1395]);
});

test("暖色横条：认得出高 38 的标题条，短的花纹不算", () => {
  const width = 702;
  const height = 300;
  const data = new Uint8Array(width * height * 4);
  const paint = (top: number, bottom: number, rgb: [number, number, number]) => {
    for (let y = top; y < bottom; y += 1) for (let x = 0; x < width; x += 1) data.set([...rgb, 255], (y * width + x) * 4);
  };
  paint(0, height, [30, 30, 50]); // 深色底
  paint(100, 138, [124, 74, 75]); // 标题条
  paint(200, 210, [136, 120, 95]); // 短花纹
  assert.deepEqual(warmBands({ width, height, data }, 1, 30, 180, 0, height), [100]);
});

test("角色详情页的手机截图（比最短的分享图还短）直接说清楚，不去硬认", async () => {
  const { recognizeCard, NOT_A_CARD } = await import("../../ui-shared/src/import/record-card/recognize.ts");
  // 2026-11-05 那张截图是 1290×2796，换成 702 宽是 1521.5 高；最短的分享图（没穿遗器）是 1895。
  const px = { width: 702, height: 1521, data: new Uint8Array(702 * 1521 * 4) };
  const never = async () => { throw new Error("不该走到识别"); };
  await assert.rejects(recognizeCard(px, {} as never, { text: never, digits: never }), (error: Error) => error.message === NOT_A_CARD);
});

test("按图宽缩放：1280 宽的原图结果一样", () => {
  const unit = 1280 / 702;
  assert.equal(relicRows(4694, unit), 3);
  assert.ok(Math.abs(relicTop(4694, unit, 3) - 1395) < 1);
});
