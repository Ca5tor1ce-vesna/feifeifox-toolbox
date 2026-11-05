/* 外壳 · 文字处理：转义、数字格式、极简 Markdown（扩展指南页用）。纯函数，不碰页面。 */

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const fmt = {
  num(value, digits = 2) {
    if (value === null || value === undefined || Number.isNaN(value)) return "-";
    const n = Number(value);
    if (!Number.isFinite(n)) return "-";
    return n.toFixed(digits);
  },
  int(value) {
    if (value === null || value === undefined) return "-";
    return String(Math.round(Number(value)));
  },
  pct(value, digits = 2) {
    if (value === null || value === undefined) return "-";
    return `${(Number(value) * 100).toFixed(digits)}%`;
  },
  money(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "-";
    return Math.round(n).toLocaleString("zh-CN");
  },
};
