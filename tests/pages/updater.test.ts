/** exe 自动更新（1.3）：页面这边只负责问用户；检查、下载、校验、替换在 exe 里（desktop/src/update.rs，有 Rust 单元测试）。
 * 这里测弹窗的文字和按钮、各种结果走哪条路，以及签名工具和 exe 里的公钥、minisign 格式对得上。 */
import assert from "node:assert/strict";
import { createPublicKey, verify as edVerify, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { failureMessage, setupUpdater, updatePrompt } from "../../app/updater.js";
import { buildManifest, embeddedPublicKey, generateKeyPair, publicKeyOf, signBytes } from "../../tools/update_sign.mjs";
import { KINDS } from "../../tools/package.mjs";

const INFO = { version: "1.3.0", current: "1.2.3", date: "2026-11-20", notes: "- **新功能**：自动更新。\n- 修复已知 bug。", writable: true };

test("updatePrompt：能写入时「更新并重启 / 以后再说」，写不了时改成打开下载页", () => {
  const install = updatePrompt(INFO);
  assert.equal(install.action, "install");
  assert.equal(install.title, "有新版 v1.3.0");
  assert.equal(install.ok, "更新并重启");
  assert.equal(install.cancel, "以后再说");
  assert.match(install.message, /^2026-11-20 发布，现在是 v1\.2\.3。更新后/);
  assert.match(updatePrompt({ version: "1.3.0", writable: true }).message, /^新版已发布。更新后/);
  assert.match(install.message, /userdata/);
  const readonly = updatePrompt({ ...INFO, writable: false });
  assert.equal(readonly.action, "open");
  assert.equal(readonly.ok, "打开下载页");
  assert.match(readonly.message, /不能写入/);
});

test("failureMessage：exe 给的说明原样显示，并说明旧版照常能用", () => {
  assert.match(failureMessage("下载的新版没通过签名校验"), /^下载的新版没通过签名校验\n\n旧版照常能用/);
  assert.match(failureMessage(new Error("连不上")), /^连不上/);
});

/** 假的 exe 命令和弹窗：记下调用了什么，弹窗按 answers 依次回答。 */
function harness(check: unknown, answers: boolean[], install: () => Promise<unknown> = async () => undefined) {
  const calls: string[] = [];
  const dialogs: { message: string; options: any }[] = [];
  const statuses: string[] = [];
  const invoke = async (command: string) => {
    calls.push(command);
    if (command === "check_update") return typeof check === "function" ? (check as () => unknown)() : check;
    if (command === "install_update") return install();
    return undefined;
  };
  const dialog = async (message: string, _confirm: boolean, options: any) => { dialogs.push({ message, options }); return answers.shift() ?? false; };
  class FakeEvent { type: string; detail: any; constructor(type: string, init: any) { this.type = type; this.detail = init.detail; } }
  const node = () => ({ className: "", innerHTML: "" });
  const document = { querySelector: () => null, createElement: node };
  const window = { CustomEvent: FakeEvent, dispatchEvent: (event: FakeEvent) => { statuses.push(event.detail.text); return true; }, document };
  return { run: () => setupUpdater({ invoke, dialog, window, document }), calls, dialogs, statuses };
}

test("setupUpdater：网页版（没有 exe 命令）什么都不做", async () => {
  assert.equal(await setupUpdater({ invoke: undefined, dialog: async () => true, window: {} as any, document: {} as any }), "none");
});

test("setupUpdater：没有新版或连不上（exe 返回 null、命令出错）都不弹窗", async () => {
  for (const check of [null, () => { throw new Error("x"); }]) {
    const h = harness(check, []);
    assert.equal(await h.run(), "none");
    assert.equal(h.dialogs.length, 0);
  }
});

test("setupUpdater：以后再说 → 不下载", async () => {
  const h = harness(INFO, [false]);
  assert.equal(await h.run(), "later");
  assert.deepEqual(h.calls, ["check_update"]);
  assert.equal(h.dialogs[0].options.ok, "更新并重启");
  assert.match(h.dialogs[0].options.details.innerHTML, /<strong>新功能<\/strong>/);
});

test("setupUpdater：更新并重启 → 调 install_update，显示下载中", async () => {
  const h = harness(INFO, [true]);
  assert.equal(await h.run(), "installing");
  assert.deepEqual(h.calls, ["check_update", "install_update"]);
  assert.match(h.statuses[0], /正在下载 v1\.3\.0/);
});

test("setupUpdater：安装失败 → 显示原因，可以打开下载页", async () => {
  const h = harness(INFO, [true, true], async () => { throw "下载的新版没通过签名校验（文件可能不完整或被改过），没有替换。"; });
  assert.equal(await h.run(), "failed");
  assert.deepEqual(h.calls, ["check_update", "install_update", "open_release_page"]);
  assert.match(h.dialogs[1].message, /签名校验/);
  assert.equal(h.dialogs[1].options.ok, "打开下载页");
  assert.equal(h.statuses.at(-1), "");
});

test("setupUpdater：文件夹写不了 → 只给打开下载页，不调 install_update", async () => {
  const h = harness({ ...INFO, writable: false }, [true]);
  assert.equal(await h.run(), "opened");
  assert.deepEqual(h.calls, ["check_update", "open_release_page"]);
});

test("签名工具：minisign 格式，Node 自己能验；公钥和私钥对得上；可信注释带版本和文件名", () => {
  const { secret, publicKey } = generateKeyPair();
  assert.equal(publicKeyOf(secret), publicKey);
  const bytes = Buffer.from("exe bytes");
  const text = signBytes(bytes, secret, "version:1.3.0\tfile:feifeifox-toolbox-v1.3.0-update.exe");
  const [untrusted, sigLine, trusted, globalLine] = text.trimEnd().split("\n");
  assert.match(untrusted, /^untrusted comment: /);
  assert.equal(trusted, "trusted comment: version:1.3.0\tfile:feifeifox-toolbox-v1.3.0-update.exe");
  const sig = Buffer.from(sigLine, "base64");
  const pub = Buffer.from(publicKey, "base64");
  assert.equal(sig.subarray(0, 2).toString(), "ED"); // 先做 BLAKE2b-512 再签（minisign 默认）
  assert.deepEqual(sig.subarray(2, 10), pub.subarray(2, 10)); // 密钥编号一致
  const key = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: pub.subarray(10).toString("base64url") }, format: "jwk" });
  assert.ok(edVerify(null, createHash("blake2b512").update(bytes).digest(), key, sig.subarray(10)));
  assert.ok(edVerify(null, Buffer.concat([sig.subarray(10), Buffer.from(trusted.slice("trusted comment: ".length))]), key, Buffer.from(globalLine, "base64")));
  assert.throws(() => signBytes(bytes, secret, "a\nb"), /换行/);
  assert.throws(() => publicKeyOf("short"), /40 字节/);
});

test("exe 里的发版公钥是 minisign 格式；清单字段齐全；dist 保留 -update.exe", () => {
  const key = Buffer.from(embeddedPublicKey(), "base64");
  assert.equal(key.length, 42);
  assert.equal(key.subarray(0, 2).toString(), "Ed");
  assert.deepEqual(Object.keys(buildManifest({ version: "1.3.0", date: "", notes: "", file: "a.exe", size: 1, signature: "s" })), ["version", "date", "notes", "file", "size", "signature"]);
  assert.equal(KINDS.update, ".exe");
});

test("更新相关的地址只在 exe 里：页面脚本里没有 Toy 不允许的地址", () => {
  const text = readFileSync(join(import.meta.dirname, "..", "..", "app", "updater.js"), "utf-8");
  assert.doesNotMatch(text, /github|jsdelivr|ghfast|gh-proxy|https?:\/\//i);
});
