/* 外壳 · 更新内容弹窗：每个版本第一次打开时弹一次，关掉后这一版不再出现；第一次用的新用户不弹（对他没有「更新」）。
 * 内容是 app/whats-new.json（tools/build_pages.mjs 从修改记录里这一版那一节生成）。 */
import { escapeHtml } from "./format.js";

/** 看过的版本 seen、当前版本 current → 弹（show）还是只记下版本（silent）。 */
export function shouldShowWhatsNew(seen, current) {
  if (!current) return "silent";
  if (!seen) return "silent";
  return seen === current ? "silent" : "show";
}

/** 只认修改记录用到的那点格式：「- 」列表、**粗体**；其余一律当文字（先转义，不执行任何 HTML）。 */
export function renderWhatsNew(markdown) {
  const inline = (text) => escapeHtml(text).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  const out = [];
  let list = false;
  for (const raw of String(markdown || "").split(/\r?\n/)) {
    const line = raw.trim();
    const item = line.match(/^[-*]\s+(.*)$/);
    if (item) {
      if (!list) { out.push("<ul>"); list = true; }
      out.push(`<li>${inline(item[1])}</li>`);
      continue;
    }
    if (list) { out.push("</ul>"); list = false; }
    if (line) out.push(`<p>${inline(line)}</p>`);
  }
  if (list) out.push("</ul>");
  return out.join("");
}

async function loadWhatsNew() {
  const response = await fetch(new URL("app/whats-new.json", document.baseURI), { cache: "no-cache" });
  if (!response.ok) throw new Error(`读不到更新内容（HTTP ${response.status}）`);
  return response.json();
}

function openDialog(data) {
  const dialog = document.createElement("dialog");
  dialog.className = "gt-dialog gt-whats-new";
  dialog.setAttribute("aria-labelledby", "gt-whats-new-title");
  dialog.innerHTML = `<h2 id="gt-whats-new-title">v${escapeHtml(data.version)} 更新了什么</h2>`
    + (data.date ? `<p class="muted small">${escapeHtml(data.date)}</p>` : "")
    + `<div class="gt-whats-new-body">${renderWhatsNew(data.markdown) || "<p>这一版没有写更新内容。</p>"}</div>`
    + `<div class="gt-dialog-actions"><button type="button" class="gt-dialog-primary">知道了</button></div>`;
  const close = () => { if (dialog.open) dialog.close(); };
  dialog.querySelector("button").addEventListener("click", close);
  dialog.addEventListener("click", (event) => { if (event.target === dialog) close(); });
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}

/**
 * 启动时调用：seen 是存档里记的版本，remember(version) 把当前版本记下来。
 * 返回打开弹窗的函数，首页的「更新内容」入口也用它。
 */
export async function setupWhatsNew({ seen, remember }) {
  let data = null;
  const show = async () => {
    try {
      data ??= await loadWhatsNew();
      openDialog(data);
    } catch {
      /* 读不到就算了，不影响使用 */
    }
  };
  try {
    data = await loadWhatsNew();
  } catch {
    return show;
  }
  const decision = shouldShowWhatsNew(seen, data.version);
  remember(data.version);
  if (decision === "show") openDialog(data);
  return show;
}
