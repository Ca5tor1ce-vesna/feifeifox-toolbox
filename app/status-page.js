/* 外壳 · 「模块状态」页的内容：加载概况、诊断、每个模块的功能表。纯函数，只拼 HTML。 */
import { escapeHtml } from "./format.js";

export function statusPageHtml(reg) {
  const scan = reg?.scan || {};
  const errors = reg?.errors || [];

  const moduleCards = (reg?.modules || [])
    .map(
      (m) => `
      <div class="card">
        <h2>${escapeHtml(m.name)} <span class="pill">${escapeHtml(m.id)}</span></h2>
        <p class="muted small">${escapeHtml(m.description || "（没有描述）")}</p>
        <p class="muted small">目录：<code>modules/${escapeHtml(m.folder)}</code> · 版本 ${escapeHtml(m.version)}
          ${m.gameVersion ? ` · 数据版本 ${escapeHtml(m.gameVersion)}` : ""}</p>
        <table class="data">
          <thead><tr><th>功能</th><th>ID</th><th>前端</th><th>后端动作</th></tr></thead>
          <tbody>
            ${(m.features || [])
              .map(
                (f) => `<tr>
                  <td><strong>${escapeHtml(f.name)}</strong></td>
                  <td class="mono">${escapeHtml(f.id)}</td>
                  <td>${f.hasUi ? "✓" : "—"}</td>
                  <td class="mono">${(f.actions || []).join(", ") || "—"}</td>
                </tr>`,
              )
              .join("")}
          </tbody>
        </table>
      </div>`,
    )
    .join("");

  return `
    <div class="card">
      <h2>加载概况</h2>
      <div class="stat-grid">
        <div class="stat"><div class="k">模块</div><div class="v">${scan.modules ?? (reg?.modules || []).length}</div></div>
        <div class="stat"><div class="k">功能</div><div class="v">${scan.features ?? "-"}</div></div>
        <div class="stat"><div class="k">后端动作已加载</div><div class="v">${scan.apisLoaded ?? "-"}</div></div>
        <div class="stat ${scan.apisFailed ? "accent" : ""}"><div class="k">加载失败</div><div class="v">${scan.apisFailed ?? 0}</div></div>
      </div>
    </div>

    <div class="card ${errors.length ? "error" : ""}">
      <h2>诊断（${errors.length} 条）</h2>
      ${
        errors.length
          ? `<table class="data"><thead><tr><th>位置</th><th>问题</th></tr></thead><tbody>${errors
              .map(
                (e) =>
                  `<tr><td class="mono">${escapeHtml(e.scope || "-")}</td><td>${escapeHtml(e.error || "")}${
                    e.file ? `<div class="muted small mono">${escapeHtml(e.file)}</div>` : ""
                  }</td></tr>`,
              )
              .join("")}</tbody></table>`
          : `<p class="muted">一切正常。</p>`
      }
    </div>

    ${moduleCards}
  `;
}
