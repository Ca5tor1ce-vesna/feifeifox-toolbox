/* 浮在页面上的绯英：可以拖到任何地方，点她弹出搜索。位置记在 shell 存档里，动画都在 style.css。 */
import { escapeHtml } from "./format.js";
import { featureIcon, matchingFeatures, MOBILE } from "./sidebar.js";

/** 移动超过这么多像素才算拖动，手抖一下还是点击。 */
const DRAG_START = 5;
const KEY_STEP = 16;
const EDGE = 6;
/** 电脑上底边留出保存失败的提示条。 */
const STATUS_BAR = 30;

const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));

/** 位置存比例不存像素：窗口变大变小她都在差不多的地方，也不会跑到窗口外面。 */
export function toPoint({ x, y }, box) {
  return { left: box.left + clamp(x, 0, 1) * (box.right - box.left), top: box.top + clamp(y, 0, 1) * (box.bottom - box.top) };
}

export function toFraction({ left, top }, box) {
  const part = (value, min, max) => (max > min ? clamp((value - min) / (max - min), 0, 1) : 0);
  return { x: part(left, box.left, box.right), y: part(top, box.top, box.bottom) };
}

/** 搜索框放在她旁边：优先左边，放不下放右边，和脚底对齐，再收进窗口。 */
export function panelPlace(figure, panel, view, gap = 8) {
  const beside = figure.left - gap - panel.width >= gap ? figure.left - gap - panel.width : figure.right + gap;
  return {
    left: clamp(beside, gap, view.width - panel.width - gap),
    top: clamp(figure.bottom - panel.height, gap, view.height - panel.height - gap),
  };
}

export function searchResults(modules, text) {
  const needle = text.trim().toLowerCase();
  return modules.flatMap((module) => matchingFeatures(module, needle).map((feature) => ({ module, feature })));
}

/** 手机上不打字时不列功能，只有搜索框：底部标签栏里都有，列出来一大串还挡页面。 */
export function listedResults(modules, text, phone) {
  return phone && !text.trim() ? [] : searchResults(modules, text);
}

/** 返回「打开搜索」给 Ctrl K 用。saved 是存档里的位置，remember 在她挪动后保存新位置。 */
export function setupMascot({ root, toggle, panel, input, list, saved, remember, modules, open, document: doc, window: win }) {
  let spot = Number.isFinite(saved?.x) && Number.isFinite(saved?.y) ? saved : { x: 1, y: 1 };
  let hits = [];
  let active = -1;
  let drag = null;
  let skipClick = false;
  const isPhone = () => win.matchMedia(MOBILE).matches;
  const isOpen = () => !panel.hidden;
  const topbarBottom = () => doc.querySelector("#topbar").getBoundingClientRect().bottom;

  // 手机上不挡顶栏和底部标签栏（顶栏在 B站 App 里还留着 App 按钮的位置）。
  const limits = () => {
    const size = toggle.getBoundingClientRect();
    const top = isPhone() ? topbarBottom() : 0;
    const floor = isPhone() ? doc.querySelector("#sidebar").getBoundingClientRect().top : win.innerHeight - STATUS_BAR;
    return { left: EDGE, top: top + EDGE, right: win.innerWidth - size.width - EDGE, bottom: floor - size.height - EDGE };
  };

  // 手机上输入法从下面弹出来，搜索框固定在顶栏下面；左右靠样式撑满。
  const placePanel = () => {
    if (!isOpen()) return;
    if (isPhone()) {
      panel.style.left = "";
      panel.style.top = `${topbarBottom() + 8}px`;
      return;
    }
    const { left, top } = panelPlace(toggle.getBoundingClientRect(), panel.getBoundingClientRect(), { width: win.innerWidth, height: win.innerHeight });
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  };

  const place = () => {
    const { left, top } = toPoint(spot, limits());
    toggle.style.left = `${left}px`;
    toggle.style.top = `${top}px`;
    placePanel();
  };

  const mark = () => {
    list.querySelectorAll(".mascot-hit").forEach((item, index) => {
      item.classList.toggle("is-active", index === active);
      item.setAttribute("aria-selected", String(index === active));
      if (index === active) item.scrollIntoView({ block: "nearest" });
    });
    if (active >= 0) input.setAttribute("aria-activedescendant", `mascot-hit-${active}`);
    else input.removeAttribute("aria-activedescendant");
  };

  const render = () => {
    const typed = !!input.value.trim();
    hits = listedResults(modules(), input.value, isPhone());
    active = typed && hits.length ? 0 : -1;
    root.classList.toggle("no-match", typed && !hits.length);
    root.classList.toggle("has-match", typed && hits.length > 0);
    list.innerHTML = hits.length
      ? hits.map(({ module, feature }, index) => `
        <button type="button" class="mascot-hit" id="mascot-hit-${index}" role="option" tabindex="-1" data-index="${index}" aria-selected="false">
          <span class="icon">${featureIcon(module.id, feature.id) || escapeHtml(feature.icon || "•")}</span>
          <span class="text"><b>${escapeHtml(feature.name)}</b><small>${escapeHtml(feature.description || module.name)}</small></span>
        </button>`).join("")
      : typed ? `<div class="mascot-empty">没有匹配的功能，换个词试试。</div>` : "";
    list.hidden = !typed && !hits.length;
    mark();
    placePanel();
  };

  const setOpen = (value) => {
    panel.hidden = !value;
    root.classList.toggle("is-open", value);
    toggle.setAttribute("aria-expanded", String(value));
    input.setAttribute("aria-expanded", String(value));
    if (value) render();
    else {
      input.value = "";
      root.classList.remove("no-match", "has-match");
    }
  };

  const show = () => {
    setOpen(true);
    input.focus();
    input.select();
  };

  const choose = (index) => {
    const hit = hits[index];
    if (!hit) return;
    setOpen(false);
    open(hit.module.id, hit.feature.id);
  };

  toggle.addEventListener("click", () => {
    if (skipClick) {
      skipClick = false;
      return;
    }
    if (isOpen()) setOpen(false);
    else show();
  });

  toggle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const box = toggle.getBoundingClientRect();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: event.clientX - box.left, dy: event.clientY - box.top, moved: false };
    skipClick = false;
    toggle.setPointerCapture(event.pointerId);
  });
  toggle.addEventListener("pointermove", (event) => {
    if (drag?.id !== event.pointerId) return;
    if (!drag.moved) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < DRAG_START) return;
      drag.moved = true;
      root.classList.add("is-dragging");
      setOpen(false);
    }
    spot = toFraction({ left: event.clientX - drag.dx, top: event.clientY - drag.dy }, limits());
    place();
  });
  const drop = (event) => {
    if (drag?.id !== event.pointerId) return;
    skipClick = drag.moved;
    if (drag.moved) {
      root.classList.remove("is-dragging");
      remember(spot);
    }
    drag = null;
  };
  toggle.addEventListener("pointerup", drop);
  toggle.addEventListener("pointercancel", drop);

  // 不用鼠标也能挪：聚焦在她身上时按方向键。
  toggle.addEventListener("keydown", (event) => {
    const step = { ArrowLeft: [-KEY_STEP, 0], ArrowRight: [KEY_STEP, 0], ArrowUp: [0, -KEY_STEP], ArrowDown: [0, KEY_STEP] }[event.key];
    if (!step) return;
    event.preventDefault();
    const box = toggle.getBoundingClientRect();
    spot = toFraction({ left: box.left + step[0], top: box.top + step[1] }, limits());
    place();
    remember(spot);
  });

  input.addEventListener("input", render);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      toggle.focus();
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(active);
    } else if ((event.key === "ArrowDown" || event.key === "ArrowUp") && hits.length) {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      active = active < 0 && step < 0 ? hits.length - 1 : (active + step + hits.length) % hits.length;
      mark();
    }
  });
  list.addEventListener("click", (event) => {
    const item = event.target instanceof Element && event.target.closest(".mascot-hit");
    if (item) choose(Number(item.dataset.index));
  });

  // 点外面用 pointerdown：有的浏览器点按钮不给焦点，只靠失焦判断不到。
  doc.addEventListener("pointerdown", (event) => { if (isOpen() && !root.contains(event.target)) setOpen(false); });
  root.addEventListener("focusout", (event) => { if (event.relatedTarget && !root.contains(event.relatedTarget)) setOpen(false); });
  win.addEventListener("resize", place);

  toggle.hidden = false;
  place();
  return show;
}
