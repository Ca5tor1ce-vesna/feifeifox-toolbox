/* 外壳 · exe 自动更新（1.3）：只在 exe 里有，网页版（含 Toy）没有 exe 的命令，直接跳过。
 * 检查、下载、校验签名和替换都在 exe 里做（desktop/src/update.rs），下载地址也只写在那边；这里只负责问用户。
 * 连不上更新地址时 exe 返回 null，什么都不显示。 */
import { renderWhatsNew } from "./whats-new.js";

/** exe 返回的新版信息 → 弹窗的文字和按钮。writable 为 false（放在不能写入的文件夹）时只能手动下载。 */
export function updatePrompt(info) {
  const version = String(info?.version || "");
  const from = info?.current ? `，现在是 v${info.current}` : "";
  if (info?.writable === false) {
    return {
      action: "open",
      title: `有新版 v${version}`,
      message: `工具箱放在不能写入的文件夹里，没法自动更新。可以打开下载页手动下载新版，把旧的 userdata 文件夹复制过去，存档就不会丢。`,
      ok: "打开下载页",
      cancel: "以后再说",
    };
  }
  return {
    action: "install",
    title: `有新版 v${version}`,
    message: `${info?.date ? `${info.date} 发布` : "新版已发布"}${from}。更新后工具箱会自动重启，userdata 里的存档不受影响。`,
    ok: "更新并重启",
    cancel: "以后再说",
  };
}

/** 失败说明（exe 返回的是文字）→ 弹窗正文。 */
export function failureMessage(error) {
  const reason = typeof error === "string" ? error : error?.message || String(error);
  return `${reason}\n\n旧版照常能用。也可以打开下载页手动下载新版，把旧的 userdata 文件夹复制过去，存档就不会丢。`;
}

function notesNode(document, notes) {
  if (!notes) return null;
  const box = document.createElement("div");
  box.className = "gt-whats-new-body";
  box.innerHTML = renderWhatsNew(notes); // renderWhatsNew 先转义，只认列表和粗体
  return box;
}

const showStatus = (window, text, failed = false) => window.dispatchEvent(new window.CustomEvent("gt-save-status", { detail: { text, failed } }));

/** 别的弹窗（比如更新内容）还开着时先等它关掉，不叠两层。 */
const waitIdle = (document) => new Promise((resolve) => {
  const check = () => (document.querySelector("dialog[open]") ? setTimeout(check, 400) : resolve());
  check();
});

/**
 * 启动时调用（不用等它）。invoke 是 exe 的命令；没有就是网页版，直接返回。
 * 返回做了什么（测试用）：none / later / opened / installing / failed。
 */
export async function setupUpdater({ invoke, dialog, window, document = window.document }) {
  if (typeof invoke !== "function" || typeof dialog !== "function") return "none";
  let info;
  try {
    info = await invoke("check_update");
  } catch {
    return "none";
  }
  if (!info?.version) return "none";
  await waitIdle(document);
  const prompt = updatePrompt(info);
  const accepted = await dialog(prompt.message, true, { title: prompt.title, ok: prompt.ok, cancel: prompt.cancel, details: notesNode(document, info.notes), wide: true });
  if (!accepted) return "later";
  if (prompt.action === "open") {
    await invoke("open_release_page").catch(() => {});
    return "opened";
  }
  showStatus(window, `正在下载 v${info.version}，下好后工具箱会自动重启…`);
  try {
    await invoke("install_update");
    showStatus(window, `v${info.version} 已装好，正在重启…`);
    return "installing";
  } catch (error) {
    showStatus(window, "");
    if (await dialog(failureMessage(error), true, { title: "自动更新没成功", ok: "打开下载页", cancel: "关闭" })) {
      await invoke("open_release_page").catch(() => {});
    }
    return "failed";
  }
}
