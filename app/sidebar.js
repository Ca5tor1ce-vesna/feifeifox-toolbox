/* 外壳侧栏的视觉图标和折叠交互。插件未配置专用图标时由调用方使用原图标。 */
const ICONS = {
  "honkai-star-rail/roster": '<path d="M12 3.5 19 7v5c0 4.2-3 7.3-7 8.5-4-1.2-7-4.3-7-8.5V7z"/><path d="m12 8.5 3 3-3 3-3-3z"/>',
  "honkai-star-rail/speed-plan": '<path d="M4.5 18a9 9 0 1 1 15 0M6.5 18h11M12 14l4-5"/><circle cx="12" cy="14" r="1.3"/>',
  "honkai-star-rail/axis": '<path d="M3.5 19h17M7 19v-3.5M12 19v-3.5M17 19v-3.5"/><path d="m12 4 4 4-4 4-4-4z"/>',
  "honkai-star-rail/gacha": '<path d="M4 5.5h16v4a2.5 2.5 0 0 0 0 5v4H4v-4a2.5 2.5 0 0 0 0-5zM8 5.5v13"/><path d="m14 8 .8 2.2 2.2.1-1.7 1.4.6 2.2-1.9-1.2-1.9 1.2.6-2.2-1.7-1.4 2.2-.1z"/>',
  "honkai-star-rail/records": '<path d="M7 4h10v4c0 4-2.2 6.5-5 6.5S7 12 7 8V4Zm0 2H3.5v1.5c0 2.7 1.5 4.2 4 4.2M17 6h3.5v1.5c0 2.7-1.5 4.2-4 4.2M12 14.5V19m-4 1h8M9 19h6"/>',
};

const PAGE_ICONS = {
  status: '<path d="M6 3v6a4 4 0 0 0 8 0V3"/><path d="M10 13v3a4 4 0 0 0 8 0v-2"/><circle cx="18" cy="12" r="2"/>',
};

const svg = (shape) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shape}</svg>`;

export const CHEVRON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m5 9 7 7 7-7"/></svg>';

export function featureIcon(moduleId, featureId) {
  const shape = ICONS[`${moduleId}/${featureId}`];
  return shape ? svg(shape) : null;
}

export function pageIcon(page) {
  return PAGE_ICONS[page] ? svg(PAGE_ICONS[page]) : "";
}

/** 和 style.css 里手机布局的断点一致：760 及以下侧栏变成底部标签栏。 */
export const MOBILE = "(max-width: 760px)";

/** 手机底部标签栏的「更多」：打开侧栏底部那块（首页、存档备份、链接），点外面、按 Esc、选了东西或窗口变宽就收起。 */
export function setupMoreSheet({ app, more, sheet, nav, document: doc, window: win }) {
  const setOpen = (open) => {
    app.classList.toggle("more-open", open);
    more.setAttribute("aria-expanded", String(open));
  };
  more.addEventListener("click", () => setOpen(!app.classList.contains("more-open")));
  sheet.addEventListener("click", (event) => { if (event.target.closest("button, a")) setOpen(false); });
  nav.addEventListener("click", (event) => { if (event.target.closest(".nav-feature")) setOpen(false); });
  doc.addEventListener("pointerdown", (event) => {
    if (app.classList.contains("more-open") && !sheet.contains(event.target) && !more.contains(event.target)) setOpen(false);
  });
  doc.addEventListener("keydown", (event) => { if (event.key === "Escape") setOpen(false); });
  win.matchMedia(MOBILE).addEventListener("change", (event) => { if (!event.matches) setOpen(false); });
}

export function setupSidebar({ app, nav, toggle, document: doc, window: win }) {
  const tip = doc.createElement("div");
  tip.id = "sidebar-tip"; tip.hidden = true; tip.setAttribute("role", "tooltip");
  doc.body.append(tip);
  const hide = () => { tip.hidden = true; };
  toggle.addEventListener("click", () => {
    const collapsed = app.classList.toggle("sidebar-is-collapsed");
    toggle.textContent = collapsed ? "›" : "‹";
    toggle.title = collapsed ? "展开侧栏" : "收起侧栏";
    toggle.setAttribute("aria-label", toggle.title);
    toggle.setAttribute("aria-expanded", String(!collapsed));
    hide();
  });
  // 收起时导航项和左下角作者页入口共用同一个提示。
  const ITEM = ".nav-feature, .nav-page";
  const area = nav.closest("#sidebar") || nav;
  function show(event) {
    const button = event.target.closest(ITEM);
    // 手机上是底部标签栏，名称就在图标下面，不弹提示
    if (!button || !app.classList.contains("sidebar-is-collapsed") || win.matchMedia(MOBILE).matches) return;
    const rect = button.getBoundingClientRect();
    tip.textContent = button.querySelector(".name")?.textContent || "";
    tip.style.left = `${rect.right - 8}px`; tip.style.top = `${rect.top}px`;
    tip.style.height = `${rect.height}px`; tip.hidden = false;
  }
  area.addEventListener("mouseover", show);
  area.addEventListener("focusin", show);
  area.addEventListener("mouseout", event => {
    const button = event.target.closest(ITEM);
    if (button && !button.contains(event.relatedTarget)) hide();
  });
  area.addEventListener("focusout", hide);
  nav.addEventListener("scroll", hide);
  doc.addEventListener("keydown", event => { if (event.key === "Escape") hide(); });
  win.addEventListener("resize", hide);
}
