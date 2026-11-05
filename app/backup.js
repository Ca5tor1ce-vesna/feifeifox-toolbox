/* 外壳 · 存档备份按钮（侧栏底部 / 手机「更多」面板里的导出、导入存档）。 */

/* 存档备份：配装、队伍和页面草稿导出成一个 JSON；也能导入以前 userdata 里的 speed-plan-presets.json、aha-team-presets.json。
   网页版（B站 Toy）的存档在浏览器里，靠它备份和换设备；exe 版的存档在 userdata 文件夹，导出导入只是多一种办法。 */
export function setupBackup() {
  const backend = window.GT_BACKEND;
  const exportButton = document.querySelector("#export-saves");
  const importButton = document.querySelector("#import-saves");
  const fileInput = document.querySelector("#import-saves-file");
  if (!backend || !exportButton || !importButton || !fileInput) return;
  exportButton.addEventListener("click", async () => {
    try {
      const data = await backend.exportAll();
      const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      link.download = `绯绯狐工具箱存档-${stamp}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } catch (err) {
      await window.GT_DIALOG(`导出失败：${err.message}`);
    }
  });
  importButton.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const files = [...fileInput.files];
    fileInput.value = "";
    if (!files.length) return;
    try {
      const names = await backend.importFiles(await Promise.all(files.map(async (file) => ({ name: file.name, text: await file.text() }))));
      await window.GT_DIALOG(`导入了 ${names.length} 份存档，页面会刷新。`);
      location.reload();
    } catch (err) {
      await window.GT_DIALOG(`导入失败：${err.message}`);
    }
  });
}

