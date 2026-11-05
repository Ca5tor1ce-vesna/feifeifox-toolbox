/** 更新内容弹窗（1.2）：修改记录里这一版那一节 → app/whats-new.json；什么时候弹；内容怎么显示。 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { renderWhatsNew, shouldShowWhatsNew } from "../../app/whats-new.js";
import { buildWhatsNew, WHATS_NEW_FILE } from "../../tools/build_pages.mjs";
import { changelogSection, whatsNew } from "../../tools/changelog.mjs";

const SAMPLE = "# 修改记录\n\n## 1.2.0（2026-11-20）\n\n- **新功能「角色与遗器」**：导入遗器。\n- 侧栏的 GitHub 链接挪了位置。\n- 见[路线图](docs/路线图.md)。\n- 修复已知 bug。\n\n## 1.1.0（2026-11-04）\n\n- 旧的一条。\n";

test("changelogSection：取出这一版那一节，不含下一节，相对链接只留文字", () => {
  const body = changelogSection(SAMPLE, "1.2.0");
  assert.ok(body.startsWith("- **新功能「角色与遗器」**"));
  assert.ok(!body.includes("1.1.0") && !body.includes("旧的一条"));
  assert.ok(body.includes("见路线图。"));
  assert.throws(() => changelogSection(SAMPLE, "9.9.9"), /修改记录\.md 里没有「## 9\.9\.9（日期）」这一节/);
});

test("whatsNew：带日期；提到 GitHub 的条目跳过（弹窗也进 B站 Toy 包，Toy 不允许这些字）", () => {
  const data = whatsNew("1.2.0", SAMPLE);
  assert.equal(data.version, "1.2.0");
  assert.equal(data.date, "2026-11-20");
  assert.ok(!/github/i.test(data.markdown));
  assert.ok(data.markdown.includes("修复已知 bug。"));
});

test("什么时候弹：新用户不弹只记版本；看过旧版本的弹；看过这一版的不弹", () => {
  assert.equal(shouldShowWhatsNew("", "1.2.0"), "silent");
  assert.equal(shouldShowWhatsNew(undefined, "1.2.0"), "silent");
  assert.equal(shouldShowWhatsNew("1.1.0", "1.2.0"), "show");
  assert.equal(shouldShowWhatsNew("1.2.0", "1.2.0"), "silent");
});

test("显示：列表和粗体，其余都当文字，不执行 HTML", () => {
  const html = renderWhatsNew("- **新功能**：<b>导入</b>\n- 第二条\n\n结尾一句");
  assert.equal(html, "<ul><li><strong>新功能</strong>：&lt;b&gt;导入&lt;/b&gt;</li><li>第二条</li></ul><p>结尾一句</p>");
});

test("app/whats-new.json 和 package.json 的版本、修改记录同步（运行 npm run build:pages 生成）", () => {
  assert.equal(readFileSync(WHATS_NEW_FILE, "utf-8").replaceAll("\r\n", "\n"), buildWhatsNew(), "app/whats-new.json 过期了，运行 npm run build:pages");
  const version = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "package.json"), "utf-8")).version;
  assert.equal(JSON.parse(readFileSync(WHATS_NEW_FILE, "utf-8")).version, version);
});
