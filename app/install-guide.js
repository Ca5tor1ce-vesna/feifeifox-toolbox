/* 外壳 · 添加到桌面引导（1.2）：首页一张卡片，按设备说明怎么把工具箱放到桌面或主屏幕，省得每次找链接。
 * 浏览器发出可安装事件（beforeinstallprompt，安卓 Chrome、电脑 Chrome / Edge）时直接给「安装到桌面」按钮。
 * 关掉后收成首页的一个小按钮；已经从桌面打开的（独立窗口）不再提示。 */
import { escapeHtml } from "./format.js";

/** info：{ userAgent, isTauri, inBiliApp, standalone } → 环境。 */
export function detectInstallEnv(info) {
  const ua = String(info.userAgent || "");
  if (info.isTauri) return "exe";
  if (info.standalone) return "installed";
  if (info.inBiliApp) return "bili-app";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios-safari";
  if (/Android/i.test(ua)) return "android";
  if (/Edg\/|Chrome\//.test(ua) && !/Mobile/i.test(ua)) return "desktop-browser";
  return "other";
}

/** 环境 → 标题和步骤；canPrompt：可以直接弹浏览器的安装确认。 */
export function installSteps(env, hasPrompt) {
  switch (env) {
    case "exe":
      return { title: "把工具箱放到桌面", canPrompt: false, steps: ["找到 FeifeiFoxToolbox.exe（解压出来的文件夹里）。", "右键它 →「发送到」→「桌面快捷方式」（Windows 11 先点「显示更多选项」）。", "整个文件夹别挪位置，存档在它旁边的 userdata 里。"] };
    case "bili-app":
      return { title: "放到手机桌面", canPrompt: false, steps: ["B站 App 里没法直接加到桌面：点右上角的「…」，选「用浏览器打开」（不同版本叫法可能不一样）。", "在浏览器里打开后，再按浏览器的「添加到主屏幕」。", "也可以在 B站 App 里收藏这个页面，下次从收藏夹进来。"] };
    case "ios-safari":
      return { title: "放到 iPhone / iPad 主屏幕", canPrompt: false, steps: ["用 Safari 打开本页。", "点底部的「分享」按钮（方框带向上箭头）。", "往下找「添加到主屏幕」，点「添加」。"] };
    case "android":
      return { title: "放到手机主屏幕", canPrompt: !!hasPrompt, steps: ["点浏览器右上角的「⋮」菜单。", "选「添加到主屏幕」或「安装应用」。", "之后从桌面图标打开，就像一个独立的应用。"] };
    case "desktop-browser":
      return { title: "装成电脑上的应用", canPrompt: !!hasPrompt, steps: ["点地址栏右边的「安装」小图标；没有的话打开浏览器菜单。", "Chrome：「投放、保存和分享」→「安装页面…」；Edge：「应用」→「将此站点作为应用安装」。", "装好后从开始菜单或桌面打开。"] };
    case "installed":
      return { title: "", canPrompt: false, steps: [] };
    default:
      return { title: "下次更快打开", canPrompt: false, steps: ["按 Ctrl+D（手机上用浏览器菜单）把本页加入收藏夹。"] };
  }
}

/** 在电脑浏览器里看引导的人，多半也想放到手机上：这两种环境多一个「手机」页（exe 没有网址可给，不加）。 */
export const hasPhoneView = (env) => env === "desktop-browser" || env === "other";

/** 电脑上看的「手机」页：苹果和安卓写在一起，因为看的人不一定用哪种。 */
export function phoneSteps() {
  return {
    title: "放到手机桌面",
    canPrompt: false,
    steps: [
      "用手机浏览器打开同一个网址；如果是在 B站 App 里打开的，先点右上角的「…」，选「用浏览器打开」。",
      "iPhone / iPad：用 Safari，点底部的「分享」→「添加到主屏幕」。",
      "安卓：点浏览器的「⋮」菜单 →「添加到主屏幕」或「安装应用」。",
    ],
  };
}

/**
 * 首页的卡片：dismissed 为 true 时只放一个「放到桌面」小按钮，点开再看步骤。
 * dismiss() 记下「不再展开」。返回 render，首页重新渲染后再调用一次。
 */
export function setupInstallGuide({ dismissed, dismiss }) {
  let prompt = null;
  let closed = dismissed;
  let expanded = false;
  let view = "here"; // "here"：本机的步骤；"phone"：在电脑上看手机的步骤
  const env = detectInstallEnv({
    userAgent: navigator.userAgent,
    isTauri: !!window.__TAURI__,
    inBiliApp: document.documentElement.classList.contains("in-bili-app"),
    standalone: matchMedia("(display-mode: standalone)").matches || navigator.standalone === true,
  });
  const render = () => {
    const box = document.getElementById("install-guide");
    if (!box) return;
    const here = installSteps(env, !!prompt);
    if (!here.steps.length) { box.innerHTML = ""; return; }
    if (closed && !expanded) {
      box.innerHTML = `<button type="button" class="home-action" data-install-open>${ICON}放到桌面</button>`;
      return;
    }
    const guide = view === "phone" && hasPhoneView(env) ? phoneSteps() : here;
    const switcher = hasPhoneView(env)
      ? `<div class="home-install-switch" role="group" aria-label="放到哪里">${[["here", "电脑"], ["phone", "手机"]]
        .map(([key, label]) => `<button type="button" data-install-view="${key}" aria-pressed="${view === key}">${label}</button>`).join("")}</div>`
      : "";
    box.innerHTML = `<div class="home-install-card"><div class="home-install-head">${ICON}<strong>${escapeHtml(guide.title)}</strong>${switcher}</div>`
      + `<ol>${guide.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>`
      + `<div class="home-install-actions">${guide.canPrompt ? `<button type="button" class="btn" data-install-prompt>安装到桌面</button>` : ""}`
      + `<button type="button" class="btn secondary" data-install-close>${closed ? "收起" : "知道了，不再展开"}</button></div></div>`;
  };
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    prompt = event;
    render();
  });
  window.addEventListener("appinstalled", () => { prompt = null; closed = true; dismiss(); render(); });
  document.addEventListener("click", async (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const viewButton = target?.closest("[data-install-view]");
    if (viewButton) { view = viewButton.getAttribute("data-install-view") === "phone" ? "phone" : "here"; render(); }
    else if (target?.closest("[data-install-open]")) { expanded = true; render(); }
    else if (target?.closest("[data-install-close]")) { expanded = false; if (!closed) { closed = true; dismiss(); } render(); }
    else if (target?.closest("[data-install-prompt]") && prompt) {
      const current = prompt;
      prompt = null;
      await current.prompt();
      render();
    }
  });
  render();
  return render;
}

const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M7 3.5h10a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5Zm5 4v7m-3-3 3 3 3-3"/></svg>';
