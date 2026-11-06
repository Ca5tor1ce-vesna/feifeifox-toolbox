/** 战绩分享图识别的文字处理（1.2）：名字按已知名单模糊匹配、数值和强化次数解析。识别原文取自 2026-11-05 的试验输出。 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { matchName, parseLabel, parseLevelLine, parseStatValue } from "../../ui-shared/src/import/record-card/match.ts";
import { notImage } from "../../roster-ui/src/ocr.ts";

const DATA = join(import.meta.dirname, "..", "..", "modules", "honkai-star-rail", "data");
const json = (name: string): any => JSON.parse(readFileSync(join(DATA, name), "utf-8"));
const pieceNames = Object.values<any>(json("relic_pieces.json").pieces).map((p) => p.name);
const coneNames = json("lightcones.json").map((c: any) => c.name);
const characterNames = json("characters.json").map((c: any) => c.name);

test("名字模糊匹配：识别错一两个字也能认出来", () => {
  assert.equal(matchName("魔法 少女 的 闪 兆 勋章", pieceNames)?.name, "魔法少女的闪耀勋章");
  assert.equal(matchName("翔 座 的 长 吃 头 番 +15", pieceNames)?.name, "翔鹰的长喙头盔");
  assert.equal(matchName("思 邂逅 于 下 一 个 花季", coneNames)?.name, "邂逅于下一个花季");
  assert.equal(matchName("论 剑", coneNames)?.name, "论剑");
  assert.equal(matchName("托 由 & 账 账", characterNames)?.name, "托帕&账账");
});

test("名字模糊匹配：差得太远时不硬猜", () => {
  assert.equal(matchName("暂 未 装备 光锥", coneNames), null);
  assert.equal(matchName("", coneNames), null);
});

test("数值：百分比、整数、带加号的白值", () => {
  assert.deepEqual(parseStatValue("27.2%"), { value: 0.272, percent: true });
  assert.deepEqual(parseStatValue("705"), { value: 705, percent: false });
  assert.deepEqual(parseStatValue("119.4%"), { value: 1.194, percent: true });
  // 百分号被认成别的字：图上的百分数只有一位小数，多出来的是百分号的碎片（2026-11-05 遐蝶那张图）。
  assert.deepEqual(parseStatValue("9.79%0"), { value: 0.097, percent: true });
  assert.deepEqual(parseStatValue("4.37%"), { value: 0.043, percent: true });
  assert.deepEqual(parseStatValue("100.0%"), { value: 1, percent: true });
  assert.equal(parseStatValue("四 5"), null);
  assert.equal(parseStatValue(""), null);
});

test("词条名一行：去掉强化次数记号，认出是哪种属性", () => {
  assert.deepEqual(parseLabel("暴 击 伤害 ”>2"), { stat: "暴击伤害", rolls: 2 });
  assert.deepEqual(parseLabel("生 售 值 >2"), { stat: "生命值", rolls: 2 });
  assert.deepEqual(parseLabel("效果 谷中 >>1"), { stat: "效果命中", rolls: 1 });
  assert.deepEqual(parseLabel("速度"), { stat: "速度", rolls: 0 });
  assert.deepEqual(parseLabel("击破 特攻 >1"), { stat: "击破特攻", rolls: 1 });
  assert.deepEqual(parseLabel("火 属性 伤害 提高"), { stat: "火属性伤害提高", rolls: 0 });
  assert.equal(parseLabel("一二三四五六"), null);
});

test("等级行：角色 Lv.80、光锥「等级1 叠影5阶」", () => {
  assert.deepEqual(parseLevelLine(".80"), { level: 80, superimpose: null });
  assert.deepEqual(parseLevelLine("Lv.40"), { level: 40, superimpose: null });
  assert.deepEqual(parseLevelLine("等 级 1 于 影 5 阶"), { level: 1, superimpose: 5 });
  assert.deepEqual(parseLevelLine("等级80 叠影1阶"), { level: 80, superimpose: 1 });
  assert.equal(parseLevelLine("暂未装备光锥"), null);
});

test("像素处理：深色底亮字二值化成白底黑字，编码成 PGM", async () => {
  const { binarize, toPgm, upscale } = await import("../../ui-shared/src/import/record-card/preprocess.ts");
  // 4×2：左边两列是亮字（230），其余是深色底（30）
  const img = { width: 4, height: 2, data: new Uint8Array([230, 30, 30, 30, 230, 30, 30, 30]) };
  const bin = binarize(img);
  assert.deepEqual([...bin.data], [0, 255, 255, 255, 0, 255, 255, 255], "字是黑的，底是白的");
  const big = upscale(img, 2);
  assert.equal(big.width, 8);
  assert.equal(big.height, 4);
  const pgm = toPgm(bin);
  assert.equal(new TextDecoder().decode(pgm.subarray(0, 11)), "P5\n4 2\n255\n");
  assert.equal(pgm.length, 11 + 8);
});

test("副词条反推：标了强化次数时按它定出现次数（»2 的速度 6 是出现 3 次，不是 2 次的 5.2）", async () => {
  const { inferSubAffix } = await import("../../ui-shared/src/import/scanner-v4.ts");
  assert.equal(inferSubAffix(2, 0.3, 6, false, true, 3)?.count, 3);
  assert.equal(inferSubAffix(2, 0.3, 6, false, true)?.count, 3, "6 不可能是出现 2 次（最多 5.2）");
  // 8.1% 在游戏里是 8.0999…%，显示 8.0%：要认成出现 3 次、1 档。
  const crit = inferSubAffix(0.025920001, 0.0032400002, 8.0, true, false);
  assert.deepEqual([crit?.count, crit?.step], [3, 1]);
});

test("选图：没带文件类型的不算「不是图片」，解码时才知道；明确不是图片的直接拦下", () => {
  assert.equal(notImage({ type: "" }), false);
  assert.equal(notImage({ type: "image/png" }), false);
  assert.equal(notImage({ type: "image/heic" }), false);
  assert.equal(notImage({ type: "application/pdf" }), true);
});
