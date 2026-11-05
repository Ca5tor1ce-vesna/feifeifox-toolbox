/** 打包脚本（tools/package.mjs、zip.mjs、build_site.mjs）：zip 能读回来、审计拦得住不该发的东西、版本号一致、站点内容对。 */
import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import { test } from "node:test";

import { auditNames, KINDS, packagePath, releaseNotes, version, versions } from "../../tools/package.mjs";
import { buildSite, SITE_TYPES } from "../../tools/build_site.mjs";
import { listZip, writeZip } from "../../tools/zip.mjs";

test("zip：中文文件名、目录、压缩和不压缩的条目都能读回来", () => {
  const big = Buffer.from("配速".repeat(500));
  const zip = writeZip([{ name: "使用说明.html", data: Buffer.from("<p>你好</p>") }, { name: "userdata/", dir: true }, { name: "app/a.json", data: big }]);
  assert.deepEqual(listZip(zip), ["使用说明.html", "userdata/", "app/a.json"]);
  // 第三个条目是压缩的：本地头里的数据解压回原文
  const at = zip.indexOf(Buffer.from("app/a.json")) + "app/a.json".length;
  const size = zip.readUInt32LE(zip.indexOf(Buffer.from("app/a.json")) - 30 + 18);
  assert.equal(inflateRawSync(zip.subarray(at, at + size)).toString(), big.toString());
});

test("审计：用户数据、浏览器记录、源码、测试服内容和 AI 文件都不能进包", () => {
  const bad = ["userdata/ui-state.json", "userdata/edge-profile/Default/Cookies", "beta/data/x.json", "modules/x/api.py", "AGENTS.md", ".claude/launch.json", "speed-ui/src/calc.ts", "EBWebView/Default/History"];
  assert.deepEqual(auditNames(bad).map(([name]) => name), bad);
  assert.deepEqual(auditNames(["FeifeiFoxToolbox.exe", "使用说明.html", "userdata/", "userdata/放你自己的数据在这里.txt", "index.html", "app/backend.js", "modules/honkai-star-rail/assets/ult/1502.webm"]), []);
});

test("版本号：package.json、Cargo.toml、tauri.conf.json 一致，包名一个单词区分种类", () => {
  const all = versions();
  assert.equal(all.cargo, all.pkg);
  assert.equal(all.tauri, all.pkg);
  assert.ok(packagePath("portable").endsWith(`feifeifox-toolbox-v${version()}-portable.zip`));
  assert.deepEqual(Object.keys(KINDS).sort(), ["beta", "notes", "portable", "steps", "toy"]);
  assert.match(releaseNotes(), new RegExp(`^# 绯绯狐工具箱 v${version().replaceAll(".", "\\.")}`));
});

test("站点只带网页文件：外壳、后端、功能列表、五个功能页、识图文件、数据和素材，不带源码", async () => {
  const { files, total } = await buildSite({ copy: false });
  assert.ok(files.includes("index.html") && files.includes("app/backend.js") && files.includes("app/registry.json"));
  for (const name of ["tesseract.min.js", "ocr-worker.js", "worker.min.js", "tesseract-core-lstm.wasm.js", "chi_sim.lang.js", "eng.lang.js", "licenses.js"]) assert.ok(files.includes(`modules/honkai-star-rail/features/roster/ocr/${name}`), name);
  for (const feature of ["roster", "speed-plan", "axis", "gacha", "records"]) assert.ok(files.includes(`modules/honkai-star-rail/features/${feature}/ui.js`), feature);
  assert.ok(files.every((name) => SITE_TYPES.has(name.slice(name.lastIndexOf(".")).toLowerCase())), "只有网页文件");
  assert.deepEqual(auditNames(files), []);
  assert.ok(total < 50 * 1024 * 1024, "B站 Toy 整包 50 MB 以内");
});

test("Toy 版外壳页去掉 GitHub 链接，b站链接留着；标记没配对就报错", async () => {
  const { readFileSync } = await import("node:fs");
  const { stripToyOmit } = await import("../../tools/package.mjs");
  const html = readFileSync(new URL("../../app/index.html", import.meta.url), "utf-8");
  assert.match(html, /github\.com/i, "exe 和网页版还带 GitHub 链接");
  const toy = stripToyOmit(html);
  assert.doesNotMatch(toy, /github|toy:omit/i);
  assert.equal(toy.match(/space\.bilibili\.com/g)?.length, html.match(/space\.bilibili\.com/g)?.length);
  assert.throws(() => stripToyOmit("<!-- toy:omit --><a>x</a>"), /没有配对/);
});

test("Toy 版角色顶分页打出来没有 GitHub 和镜像地址，工具箱版照常带镜像", async () => {
  const { bundleEntry, bundlePage, RECORDS_TOY } = await import("../../tools/build_pages.mjs");
  const { TOY_FORBIDDEN } = await import("../../tools/package.mjs");
  assert.doesNotMatch(await bundleEntry(RECORDS_TOY), TOY_FORBIDDEN);
  assert.match(await bundlePage("records"), /raw\.githubusercontent\.com/);
});

test("站点可以额外加文件，但不能和已有的重名", async () => {
  const { files } = await buildSite({ copy: false, extra: { "modules/honkai-star-rail/features/records/records-snapshot.json": "package.json" } });
  assert.ok(files.includes("modules/honkai-star-rail/features/records/records-snapshot.json"));
  await assert.rejects(buildSite({ copy: false, extra: { "index.html": "package.json" } }), /已经有了/);
});

test("识图文件和角色与遗器页面里没有 Toy 不允许的地址，识图文件合计不到 12 MB（Review Focus 4）", async () => {
  const { readdirSync, readFileSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { OCR_DIR, writeOcrAssets } = await import("../../tools/ocr_assets.mjs");
  const { TOY_FORBIDDEN } = await import("../../tools/package.mjs");
  writeOcrAssets();
  let size = 0;
  for (const name of readdirSync(OCR_DIR)) {
    const path = join(OCR_DIR, name);
    size += statSync(path).size;
    assert.doesNotMatch(readFileSync(path, "utf-8"), TOY_FORBIDDEN, name);
  }
  const page = join(OCR_DIR, "..", "ui.js");
  assert.doesNotMatch(readFileSync(page, "utf-8"), TOY_FORBIDDEN, "roster/ui.js");
  assert.ok(size < 12 * 1024 * 1024, `识图文件 ${(size / 1048576).toFixed(1)} MB`);
});

test("Toy 版不用平台的商业标识（上传协议 3.5(3)，2026-11-05 用户决定只改 Toy 包）：「B站」换成中性说法，B站空间的网址保留", async () => {
  const { toyText, TOY_BRAND } = await import("../../tools/package.mjs");
  assert.equal(toyText('<a href="https://space.bilibili.com/5406068">b站：syllo椭圆</a>'), '<a href="https://space.bilibili.com/5406068">主页：syllo椭圆</a>');
  assert.equal(toyText("B站 App 里没法直接加到桌面"), "App 里没法直接加到桌面");
  assert.equal(toyText("在 B站 Toy 里切到抽卡"), "在网页版里切到抽卡");
  assert.equal(toyText("（B站 Toy、手机）"), "（网页版、手机）");
  assert.equal(toyText("「更多」里是导出 / 导入存档和 b站链接"), "「更多」里是导出 / 导入存档和作者主页链接");
  assert.equal(toyText("其他地方的 B站"), "其他地方的平台");
  assert.doesNotMatch(toyText('b站：x B站 App 哔哩哔哩 bilibili <a href="https://space.bilibili.com/1">'), TOY_BRAND);
  assert.match("B站", TOY_BRAND);
  assert.match("哔哩哔哩", TOY_BRAND);
  assert.doesNotMatch("https://space.bilibili.com/1", TOY_BRAND, "B站空间的网址是平台自己的链接，可以留");
});
