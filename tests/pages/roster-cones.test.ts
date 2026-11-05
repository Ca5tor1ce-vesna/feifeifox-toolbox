/** 角色与遗器的光锥列表（1.2）：专武第一，游戏推荐的跟在后面，然后同命途按星级，别的命途最后。 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { orderCones } from "../../roster-ui/src/cone-order.ts";

const DATA = join(import.meta.dirname, "..", "..", "modules", "honkai-star-rail", "data");
const characters: any[] = JSON.parse(readFileSync(join(DATA, "characters.json"), "utf-8"));
const cones: any[] = JSON.parse(readFileSync(join(DATA, "lightcones.json"), "utf-8"));
const named = (name: string): any => characters.find((c) => c.name === name);
const cone = (name: string): string => cones.find((c) => c.name === name).id;

test("限定五星的专武排第一、标「专武」，推荐的跟着标「推荐」", () => {
  const list = orderCones(named("绯英"), cones);
  assert.equal(list[0].cone.name, "邂逅于下一个花季");
  assert.equal(list[0].badge, "专武");
  assert.deepEqual(list.slice(1, 3).map((c) => c.badge), ["推荐", "推荐"]);
  assert.equal(list.filter((c) => c.badge === "专武").length, 1);
});

test("四星角色和开拓者没有专武，推荐的排前面", () => {
  for (const who of [named("米沙"), characters.find((c) => c.id === "8009")]) {
    const list = orderCones(who, cones);
    assert.equal(list.some((c) => c.badge === "专武"), false);
    assert.equal(list[0].cone.id, String(who.recommendedCones[0]));
    assert.equal(list[0].badge, "推荐");
  }
});

test("数据里每个限定五星（不含开拓者）都有专武，专武是同命途的五星光锥、不重复", () => {
  const limited = characters.filter((c) => c.signatureCone);
  assert.ok(limited.length >= 60);
  assert.equal(new Set(limited.map((c) => c.signatureCone)).size, limited.length);
  for (const c of limited) {
    const sig = cones.find((x) => x.id === c.signatureCone);
    assert.ok(sig, `${c.name} 的专武不在光锥数据里`);
    assert.equal(sig.rarity, 5);
    assert.equal(sig.path, c.path, `${c.name} 的专武命途不同`);
  }
  assert.equal(named("花火").signatureCone, cone("游戏尘寰"));
});

test("同命途在前、别的命途在后；推荐里有别的命途时也排前面", () => {
  const owner = { path: "Hunt", recommendedCones: ["b"] };
  const list = orderCones(owner, [
    { id: "x", name: "别的", path: "Erudition", rarity: 5 },
    { id: "a", name: "同命途四星", path: "Hunt", rarity: 4 },
    { id: "b", name: "推荐的", path: "Erudition", rarity: 4 },
    { id: "c", name: "同命途五星", path: "Hunt", rarity: 5 },
  ]);
  assert.deepEqual(list.map((c) => c.cone.id), ["b", "c", "a", "x"]);
  assert.deepEqual(list.map((c) => c.samePath), [false, true, true, false]);
});

test("光锥原画是随包的本地小图（没有远程地址），绝大多数光锥都有", async () => {
  const { existsSync } = await import("node:fs");
  const root = join(import.meta.dirname, "..", "..");
  const withArt = cones.filter((c) => c.portrait);
  assert.ok(withArt.length >= cones.length - 5, `只有 ${withArt.length}/${cones.length} 把有原画`);
  for (const c of withArt) {
    assert.match(c.portrait, /^\/modules\/honkai-star-rail\/assets\/[0-9a-f]{16}\.webp$/, `${c.name} 的原画不是本地图`);
    assert.ok(existsSync(join(root, c.portrait)), `${c.name} 的原画文件不在`);
  }
});
