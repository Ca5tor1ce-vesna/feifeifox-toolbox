/* 工具箱外壳：模块导航、路由、功能懒加载和内置页面的切换。
 * 请求在 api.js，文字处理在 format.js，侧栏交互在 sidebar.js，绯英和搜索在 mascot.js，存档备份在 backup.js，「模块状态」页的内容在 status-page.js。
 *
 * 这里只负责"装东西"，不含任何游戏逻辑——具体功能各自在自己的 ui.js 里。
 */

import { callApi, getJSON } from "./api.js";
import { setupBackup } from "./backup.js";
import { escapeHtml, fmt } from "./format.js";
import { setupMascot } from "./mascot.js";
import { setupTheme } from "./theme.js";
import { CHEVRON, featureIcon, matchingFeatures, pageIcon, setupMoreSheet, setupSidebar } from "./sidebar.js";
import { statusPageHtml } from "./status-page.js";
import { setupWhatsNew } from "./whats-new.js";
import { setupInstallGuide } from "./install-guide.js";
import { setupUpdater } from "./updater.js";

const state = {
  registry: null,
  current: { moduleId: null, featureId: null },
  cleanup: null,
  styleEl: null,
};

const $ = (sel, el = document) => el.querySelector(sel);
const welcomeMarkup = $("#view .welcome").outerHTML;
let welcomeHdPromise;
function loadWelcomeHd() {
  const welcome = $("#view .welcome");
  if (!welcome) return;
  if (!welcomeHdPromise) {
    welcomeHdPromise = new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(true);
      image.onerror = () => resolve(false);
      image.src = "app/assets/welcome-bg-hd.png";
    });
  }
  welcomeHdPromise.then((loaded) => {
    if (loaded && welcome.isConnected) welcome.classList.add("is-hd");
    if (!loaded) welcomeHdPromise = null;
  });
}
let persistenceReady = false;
const shellState = () => persistenceReady ? window.GT_LOCAL_STATE.scope("shell") : null;
/** 看过哪一版的更新内容（whats-new.js）。和侧栏状态存在一起。 */
let whatsNewSeen = "";
/** 首页「放到桌面」卡片收起过（install-guide.js）。 */
let installTipDismissed = false;
let renderInstallGuide = null;
/** 绯英在窗口里的位置（mascot.js），和侧栏状态存在一起。 */
let mascotSpot = null;
function saveShell() { shellState()?.save({ current: state.current, collapsed: [...navCollapsed], whatsNewSeen, installTipDismissed, mascot: mascotSpot }); }

/* ---------------- 导航 ---------------- */

const NAV_COLLAPSE_KEY = "gt-nav-collapsed";
const navCollapsed = new Set(
  (() => {
    try {
      const v = JSON.parse(localStorage.getItem(NAV_COLLAPSE_KEY) || "[]");
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  })(),
);

function renderNav() {
  const nav = $("#nav");
  const oldTip = $("#sidebar-tip");
  if (oldTip) oldTip.hidden = true;
  const modules = (state.registry?.modules || [])
    .map((module) => ({ module, features: matchingFeatures(module, "") }))
    .filter(({ features }) => features.length);

  if (!modules.length) {
    nav.innerHTML = `<div class="nav-empty">没有可用的功能。</div>`;
    return;
  }

  nav.innerHTML = modules
    .map(({ module, features }) => {
      const items = features
        .map(
          (f) => `
        <button class="nav-feature ${
          state.current.moduleId === module.id && state.current.featureId === f.id ? "active" : ""
        }" data-module="${escapeHtml(module.id)}" data-feature="${escapeHtml(f.id)}"
          aria-label="${escapeHtml(f.name)}">
          <span class="icon">${featureIcon(module.id, f.id) || escapeHtml(f.icon || "•")}</span>
          <span class="name"${f.shortName ? ` data-short="${escapeHtml(f.shortName)}"` : ""}>${escapeHtml(f.name)}</span>
        </button>`,
        )
        .join("");
      const collapsed = navCollapsed.has(module.id);
      return `
        <div class="nav-module${collapsed ? " collapsed" : ""}" data-module-id="${escapeHtml(module.id)}">
          <button type="button" class="nav-module-title" aria-expanded="${collapsed ? "false" : "true"}"
            title="v${escapeHtml(module.version || "0.0.0")}">
            <span class="name">${escapeHtml(module.name)}</span>
            <span class="caret">${CHEVRON}</span>
          </button>
          <div class="nav-items"><div class="nav-items-inner">
          ${items || '<div class="nav-empty">这个模块还没有功能</div>'}
          </div></div>
        </div>`;
    })
    .join("");

  nav.querySelectorAll(".nav-feature").forEach((btn) => {
    btn.addEventListener("click", () => {
      openFeature(btn.dataset.module, btn.dataset.feature);
    });
  });
  nav.querySelectorAll(".nav-module-title").forEach((btn) => {
    btn.addEventListener("click", () => {
      const box = btn.closest(".nav-module");
      const id = box.dataset.moduleId;
      const nowCollapsed = !box.classList.contains("collapsed");
      box.classList.toggle("collapsed", nowCollapsed);
      btn.setAttribute("aria-expanded", nowCollapsed ? "false" : "true");
      if (nowCollapsed) navCollapsed.add(id);
      else navCollapsed.delete(id);
      saveShell();
      try {
        localStorage.setItem(NAV_COLLAPSE_KEY, JSON.stringify([...navCollapsed]));
      } catch {
        /* 存不了就只在本次会话里记住 */
      }
    });
  });
}

function findFeature(moduleId, featureId) {
  const module = (state.registry?.modules || []).find((m) => m.id === moduleId);
  if (!module) return {};
  const feature = (module.features || []).find((f) => f.id === featureId);
  return { module, feature };
}

/* 已下线的功能转到接替它的页面，旧书签和上次打开的记录不至于落到欢迎页。 */
const RETIRED_FEATURES = {
  "honkai-star-rail/aha-speed": { moduleId: "honkai-star-rail", featureId: "axis" },
};

/* 换了模块的同一个功能：旧书签、上次打开的记录跟着走，旧地址下记住的输入也接过来。 */
const MOVED_FEATURES = {
  "herta/records": { moduleId: "honkai-star-rail", featureId: "records" },
};

function featureState(moduleId, featureId) {
  const key = `${moduleId}/${featureId}`;
  const stored = window.GT_LOCAL_STATE.scope(key);
  const from = Object.keys(MOVED_FEATURES).find((old) => `${MOVED_FEATURES[old].moduleId}/${MOVED_FEATURES[old].featureId}` === key);
  if (!from || Object.keys(stored.load()).length) return stored;
  const previous = window.GT_LOCAL_STATE.scope(from).load();
  if (!Object.keys(previous).length) return stored;
  stored.save(previous);
  return window.GT_LOCAL_STATE.scope(key);  // 重新取，滚动位置等也按接过来的状态恢复
}

/* 深链：地址栏里的 #/模块/功能，可以存书签、可以直接发给别人 */
function parseHash() {
  const match = /^#\/([^/]+)\/([^/]+)$/.exec(location.hash || "");
  if (!match) return null;
  return {
    moduleId: decodeURIComponent(match[1]),
    featureId: decodeURIComponent(match[2]),
  };
}

function openRoute(route) {
  const old = route && `${route.moduleId}/${route.featureId}`;
  const target = route && (RETIRED_FEATURES[old] || MOVED_FEATURES[old] || route);
  if (!target) return;
  const { module, feature } = findFeature(target.moduleId, target.featureId);
  if (module && feature) openFeature(target.moduleId, target.featureId);
}

function setHash(moduleId, featureId) {
  const hash = `#/${encodeURIComponent(moduleId)}/${encodeURIComponent(featureId)}`;
  if (location.hash !== hash) history.replaceState(null, "", hash);
}

function clearHash() {
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
}

/* 模块界面弹出。动画只在已经渲染好之后播，不会让内容晚出现；不留 fill，播完不残留 transform。 */
function popIn(element) {
  if (!element || document.hidden || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  element.animate?.(
    [{ opacity: 0, transform: "translateY(14px) scale(.985)" }, { opacity: 1, transform: "none" }],
    { duration: 280, easing: "cubic-bezier(.2, .9, .3, 1.1)" },
  );
}

function setCrumb(text, sub, iconHtml = "") {
  $("#crumb").innerHTML = `${iconHtml ? `<span class="crumb-icon">${iconHtml}</span>` : ""}<h1 class="crumb-title">${escapeHtml(text)}</h1>${
    sub ? `<span class="sub">${escapeHtml(sub)}</span>` : ""
  }`;
}

/* ---------------- 打开功能 ---------------- */

function makeCtx(module, feature) {
  return {
    moduleId: module.id,
    featureId: feature.id,
    module,
    feature,
    persistence: persistenceReady ? featureState(module.id, feature.id) : null,
    call: (action, payload) => callApi(module.id, feature.id, action, payload),
    data: async (name) =>
      (await getJSON(`/api/data/${encodeURIComponent(module.id)}/${encodeURIComponent(name)}`)).data,
    fmt,
    ui: { escapeHtml, fmt },
  };
}

let viewGeneration = 0;
function clearCurrent() {
  viewGeneration++;
  if (typeof state.cleanup === "function") {
    try {
      state.cleanup();
    } catch (err) {
      console.warn("unmount 出错：", err);
    }
  }
  state.cleanup = null;
  if (state.styleEl) {
    state.styleEl.remove();
    state.styleEl = null;
  }
}

async function openFeature(moduleId, featureId) {
  const { module, feature } = findFeature(moduleId, featureId);
  if (!module || !feature) return;

  clearCurrent();
  const generation = viewGeneration;
  state.current = { moduleId, featureId };
  saveShell();
  setHash(moduleId, featureId);
  renderNav();

  const icon = featureIcon(module.id, feature.id);
  setCrumb(
    icon ? feature.name : `${feature.icon || ""} ${feature.name}`.trim(),
    `${module.name}${module.gameVersion ? ` · 数据 ${module.gameVersion}` : ""}`,
    icon || "",
  );

  const view = $("#view");
  view.innerHTML = `<div class="gt-skeleton" role="status" aria-label="页面加载中"><div class="gt-skeleton-card"><i></i><i></i><i></i><i></i></div><div class="gt-skeleton-card"><i></i><i></i><i></i><i></i><i></i></div></div><div class="gt-feature-root is-loading" aria-busy="true"></div>`;
  const featureRoot = view.querySelector('.gt-feature-root');

  if (!feature.uiUrl) {
    view.innerHTML = `
      <div class="card">
        <h2>这个功能没有前端界面</h2>
        <p class="muted">它只提供了后端动作：<code>${(feature.actions || []).join("、") || "（无）"}</code></p>
        <p class="muted">要给它做界面，在 <code>${escapeHtml(feature.baseUrl)}/ui.js</code> 里写一个 <code>export default { mount(root, ctx) }</code>。</p>
      </div>`;
    return;
  }

  let styleReady = Promise.resolve();
  if (feature.styleUrl) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    styleReady = new Promise(resolve => { link.onload = resolve; link.onerror = resolve; });
    link.href = feature.styleUrl;
    document.head.appendChild(link);
    state.styleEl = link;
  }

  try {
    // 带时间戳，改完 ui.js 刷新页面就是新的，不用清缓存
    const mod = await import(`${new URL(feature.uiUrl, document.baseURI).href}?t=${Date.now()}`);
    await styleReady;
    if (generation !== viewGeneration) return;
    const component = mod.default || {};
    if (typeof component.mount === "function") {
      const ctx = makeCtx(module, feature);
      const mountCleanup = await component.mount(featureRoot, ctx);
      if (generation !== viewGeneration) { if (typeof mountCleanup === 'function') mountCleanup(); component.unmount?.(); return; }
      featureRoot.classList.remove('is-loading'); featureRoot.removeAttribute('aria-busy'); view.querySelector('.gt-skeleton')?.remove();
      popIn(featureRoot);
      const stopSaving = ctx.persistence?.bind(view, component.getState ? () => component.getState() : undefined);
      state.cleanup = () => { stopSaving?.(); if (typeof mountCleanup === "function") mountCleanup(); component.unmount?.(); };
    } else {
      view.innerHTML = `<div class="card error">ui.js 里没有 <code>export default { mount }</code>。</div>`;
    }
  } catch (err) {
    if (generation !== viewGeneration) return;
    view.innerHTML = `<div class="card error">
      <h2>界面加载失败</h2>
      <p class="error-text">${escapeHtml(err.message)}</p>
      <p class="muted small">检查 <code>${escapeHtml(feature.uiUrl)}</code> 是否有语法错误（浏览器 F12 控制台里有详细信息）。</p>
    </div>`;
  }
}

/* ---------------- 内置页面 ---------------- */

function openHome() {
  clearCurrent();
  state.current = { moduleId: null, featureId: null };
  saveShell();
  clearHash();
  renderNav();
  setCrumb("选择一个功能开始");
  $("#view").innerHTML = welcomeMarkup;
  renderInstallGuide?.();
  loadWelcomeHd();
  $("#view").scrollTop = 0;
}

async function openStatus() {
  clearCurrent();
  state.current = { moduleId: null, featureId: null };
  clearHash();
  renderNav();
  setCrumb("模块状态", "", pageIcon("status"));

  $("#view").innerHTML = statusPageHtml(state.registry);
}

/* ---------------- 启动 ---------------- */

function renderWarnings() {
  const errors = state.registry?.errors || [];
  const badge = $("#err-badge");
  badge.textContent = String(errors.length);
  badge.classList.toggle("hidden", errors.length === 0);

  const box = $("#warnings");
  if (!errors.length) {
    box.innerHTML = "";
    return;
  }
  box.innerHTML = `<div class="warnbar">有 ${errors.length} 条加载警告（${escapeHtml(
    errors[0].scope || "",
  )}${errors.length > 1 ? " 等" : ""}）。<button class="ghost small" id="show-status">查看</button></div>`;
  $("#show-status").addEventListener("click", openStatus);
}

async function loadRegistry() {
  const data = await getJSON("/api/registry");
  state.registry = data;
  $("#brand-version").textContent = `v${data.toolbox?.version || "?"} · ${
    (data.modules || []).length
  } 个模块`;
  renderNav();
  renderWarnings();
}


async function boot() {
  const saveStatus = document.createElement("div");
  saveStatus.id = "local-save-status"; saveStatus.setAttribute("role", "status");
  document.body.append(saveStatus);
  window.addEventListener("gt-save-status", event => {
    saveStatus.textContent = event.detail.text; saveStatus.classList.toggle("is-error", event.detail.failed);
  });
  try { await window.GT_LOCAL_STATE.init(true); persistenceReady = true; }
  catch { /* 状态读取错误已显示；不能用默认值覆盖原文件。 */ }
  const savedShell = shellState()?.load() || {};
  whatsNewSeen = typeof savedShell.whatsNewSeen === "string" ? savedShell.whatsNewSeen : "";
  installTipDismissed = savedShell.installTipDismissed === true;
  renderInstallGuide = setupInstallGuide({ dismissed: installTipDismissed, dismiss: () => { installTipDismissed = true; saveShell(); } });
  if (Array.isArray(savedShell.collapsed)) { navCollapsed.clear(); savedShell.collapsed.forEach(id => navCollapsed.add(id)); }
  setupTheme({ buttons: [...document.querySelectorAll("[data-theme-toggle]")], document, window });
  mascotSpot = savedShell.mascot ?? null;
  const openSearch = setupMascot({
    root: $("#mascot"), toggle: $("#search-toggle"), panel: $("#mascot-panel"), input: $("#search"), list: $("#mascot-results"),
    saved: mascotSpot, remember: (spot) => { mascotSpot = spot; saveShell(); },
    modules: () => state.registry?.modules || [], open: openFeature, document, window,
  });
  $("#home-button").addEventListener("click", openHome);
  $("#home-sheet-button").addEventListener("click", openHome);
  setupSidebar({ app: $("#app"), nav: $("#nav"), toggle: $("#sidebar-toggle"), document, window });
  setupMoreSheet({ app: $("#app"), more: $("#more-button"), sheet: $("#more-sheet"), nav: $("#nav"), document, window });
  document.querySelectorAll("[data-page]").forEach((btn) => {
    btn.addEventListener("click", openStatus);
  });
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openSearch();
    }
  });

  setupBackup();

  try {
    await loadRegistry();
    // 打开工具箱先看到欢迎页（2026-11-05 用户要求）；地址里写明了页面（书签、链接、刷新）才直接进那一页。
    openRoute(parseHash());
    const showWhatsNew = await setupWhatsNew({ seen: whatsNewSeen, remember: (version) => { whatsNewSeen = version; saveShell(); } });
    // 首页会被重新渲染（openHome 换 innerHTML），所以用事件委托。
    document.addEventListener("click", (event) => { if (event.target instanceof Element && event.target.closest("[data-whats-new]")) void showWhatsNew(); });
    // exe 自动更新（1.3）：后台检查，不挡启动；网页版没有 exe 的命令，直接跳过。
    void setupUpdater({ invoke: window.__TAURI__?.core?.invoke, dialog: window.GT_DIALOG, window });
    // 页面里的 #/模块/功能 链接、手改地址栏。setHash 用的是 replaceState，不会触发这里。
    window.addEventListener("hashchange", () => {
      const route = parseHash();
      if (route && (route.moduleId !== state.current?.moduleId || route.featureId !== state.current?.featureId)) openRoute(route);
    });
  } catch (err) {
    $("#view").innerHTML = `<div class="card error">
      <h2>读不到功能列表</h2>
      <p class="error-text">${escapeHtml(err.message)}</p>
      <p class="muted">刷新页面试试；还不行的话重新下载完整的工具箱。</p>
    </div>`;
  } finally {
    loadWelcomeHd();
    $("#boot-skeleton")?.remove();
    document.documentElement.classList.remove("boot-pending");
  }
}

boot().catch(err => { document.documentElement.classList.remove("boot-pending"); $("#boot-skeleton")?.remove(); console.error(err); });
