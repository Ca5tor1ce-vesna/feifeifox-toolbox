/** 添加到桌面引导（1.2）：按设备给步骤；已经装好的不再提示；文字里没有 Toy 不允许的地址。 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { detectInstallEnv, hasPhoneView, installSteps, phoneSteps } from "../../app/install-guide.js";

const UA = {
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  biliAndroid: "Mozilla/5.0 (Linux; Android 14; 23013RK75C Build/UKQ1.230804.001) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/118.0.0.0 Mobile Safari/537.36 os/android model/23013RK75C build/8130300 osVer/14 network/2 BiliApp/8130300 mobi_app/android",
  edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0",
  firefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
};
const env = (userAgent: string, extra: Partial<{ isTauri: boolean; inBiliApp: boolean; standalone: boolean }> = {}) =>
  detectInstallEnv({ userAgent, isTauri: false, inBiliApp: /BiliApp/.test(userAgent), standalone: false, ...extra });

test("按设备认环境", () => {
  assert.equal(env(UA.iphone), "ios-safari");
  assert.equal(env(UA.android), "android");
  assert.equal(env(UA.biliAndroid), "bili-app");
  assert.equal(env(UA.edge), "desktop-browser");
  assert.equal(env(UA.firefox), "other");
  assert.equal(env(UA.edge, { isTauri: true }), "exe");
  assert.equal(env(UA.android, { standalone: true }), "installed", "已经装到桌面的不再提示");
});

test("每种环境都有步骤；只有安卓和电脑浏览器收到可安装事件时才显示一键安装", () => {
  for (const kind of ["exe", "bili-app", "ios-safari", "android", "desktop-browser", "other"] as const) {
    const guide = installSteps(kind, false);
    assert.ok(guide.title && guide.steps.length >= 1, kind);
    assert.equal(guide.canPrompt, false, kind);
    for (const step of guide.steps) assert.doesNotMatch(step, /github|jsdelivr/i, kind);
  }
  assert.equal(installSteps("android", true).canPrompt, true);
  assert.equal(installSteps("desktop-browser", true).canPrompt, true);
  assert.equal(installSteps("ios-safari", true).canPrompt, false);
  assert.equal(installSteps("installed", false).steps.length, 0);
});

test("电脑浏览器里多一个「手机」页：苹果和安卓都讲到，exe 和手机上不加", () => {
  assert.equal(hasPhoneView("desktop-browser"), true);
  assert.equal(hasPhoneView("other"), true);
  for (const kind of ["exe", "android", "ios-safari", "bili-app", "installed"]) assert.equal(hasPhoneView(kind), false, kind);
  const phone = phoneSteps();
  assert.equal(phone.canPrompt, false, "电脑上没法替手机弹安装");
  const text = phone.steps.join("\n");
  assert.match(text, /iPhone/);
  assert.match(text, /安卓/);
  assert.match(text, /添加到主屏幕/);
  assert.doesNotMatch(text, /github|jsdelivr/i);
});

test("网页应用清单：名字、从站点根目录打开、独立窗口、图标", () => {
  const manifest = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "app", "manifest.json"), "utf-8"));
  assert.equal(manifest.name, "绯绯狐工具箱");
  assert.equal(manifest.start_url, "../");
  assert.equal(manifest.scope, "../");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.some((icon: any) => icon.src === "icon.png"));
  const html = readFileSync(join(import.meta.dirname, "..", "..", "app", "index.html"), "utf-8");
  assert.match(html, /<link rel="manifest" href="app\/manifest\.json"/);
});
