/* 白天 / 夜晚模式。第一次打开跟随系统，手动切换后以手动为准。
 * 只存在 localStorage：index.html 要在页面画出来之前就读到，存档要等异步读完，来不及。 */
export const THEME_KEY = "gt-theme";

/** 存过的选择优先，没存过跟随系统。 */
export function resolveTheme(saved, systemDark) {
  if (saved === "night" || saved === "day") return saved;
  return systemDark ? "night" : "day";
}

export function setupTheme({ buttons, document: doc, window: win }) {
  const system = win.matchMedia("(prefers-color-scheme: dark)");
  const read = () => {
    try {
      return win.localStorage.getItem(THEME_KEY);
    } catch {
      return null;
    }
  };
  const apply = (theme) => {
    doc.documentElement.classList.toggle("night", theme === "night");
    const label = theme === "night" ? "切换到白天模式" : "切换到夜晚模式";
    buttons.forEach((button) => {
      button.title = label;
      button.setAttribute("aria-label", label);
      button.setAttribute("aria-pressed", String(theme === "night"));
    });
  };
  apply(resolveTheme(read(), system.matches));
  system.addEventListener("change", () => apply(resolveTheme(read(), system.matches)));
  buttons.forEach((button) => button.addEventListener("click", () => {
    const next = doc.documentElement.classList.contains("night") ? "day" : "night";
    try {
      win.localStorage.setItem(THEME_KEY, next);
    } catch {
      /* 存不了就只在这次打开时生效 */
    }
    apply(next);
  }));
}
