/* 统一的应用草稿存储。服务版以 userdata 为准；单文件版落浏览器。
 * 只保存输入及界面状态，不存 DOM、计算结果、图片或远程数据快照。
 */
(function (global) {
  const copy = value => JSON.parse(JSON.stringify(value));
  const record = value => value && typeof value === "object" && !Array.isArray(value);
  let entries = {}, storageKey = "gt-ui-state-v1", remote = false, clock = 0, timer;
  const dirty = new Map();
  let queue = Promise.resolve();
  // 保存成功不打扰用户，只用空文本收起之前的失败提示；失败必须显示。
  function status(text, failed = false) {
    global.dispatchEvent(new CustomEvent("gt-save-status", { detail: { text, failed } }));
  }
  function readLocal() {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};
    let data;
    try { data = JSON.parse(raw); }
    catch (err) { localStorage.setItem(`${storageKey}/corrupt-${Date.now()}`, raw); throw err; }
    if (!record(data) || data.version !== 1 || !record(data.entries) || !Object.values(data.entries).every(e => record(e) && e.version === 1 && record(e.value) && Number.isFinite(e.updatedAt) && e.updatedAt > 0)) {
      localStorage.setItem(`${storageKey}/corrupt-${Date.now()}`, raw);
      throw Error("本地编辑状态版本或格式不支持，已保留原数据。");
    }
    return data.entries;
  }
  function mirror() {
    localStorage.setItem(storageKey, JSON.stringify({ version: 1, entries }));
  }
  async function flush(keepalive = false) {
    clearTimeout(timer);
    const batch = [...dirty];
    dirty.clear();
    if (!remote || !batch.length) return;
    const work = async () => {
      for (const [key, entry] of batch) {
        try {
          const response = await fetch("/api/ui-state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, entry }), keepalive });
          const result = await response.json();
          if (!result.ok) throw Error(result.error || "本地文件写入失败");
          if (!result.saved && result.entry.updatedAt > entries[key].updatedAt) { entries[key] = result.entry; mirror(); }
        } catch (err) {
          for (const [pendingKey, pendingEntry] of batch) {
            if (!dirty.has(pendingKey) || dirty.get(pendingKey).updatedAt < pendingEntry.updatedAt) dirty.set(pendingKey, pendingEntry);
          }
          status(`保存到本机失败：${err.message}；当前页面仍保留编辑内容。`, true);
          return;
        }
      }
      if (!dirty.size) status("");
    };
    // 关闭窗口时立即发送最新快照，服务端时间戳保护可防止旧请求倒写。
    if (keepalive) return work();
    queue = queue.then(work, work);
    return queue;
  }
  async function init(server = false) {
    remote = server;
    try {
      if (server) {
        const result = await (await fetch("/api/ui-state")).json();
        if (!result.ok) throw Error(result.error || "读取本地编辑状态失败");
        storageKey = `gt-ui-state-v1/${result.storageId}`;
        entries = result.entries;
        let backup = {};
        try { backup = readLocal(); } catch (err) { status(err.message, true); }
        for (const [key, entry] of Object.entries(backup)) {
          if (record(entry) && entry.version === 1 && record(entry.value) && Number.isFinite(entry.updatedAt) && (!entries[key] || entry.updatedAt > entries[key].updatedAt)) {
            entries[key] = entry; dirty.set(key, entry);
          }
        }
        await flush();
      } else entries = readLocal();
      try { mirror(); } catch (err) { status(`浏览器备份不可用：${err.message}`, true); }
    } catch (err) {
      status(`自动恢复不可用：${err.message}`, true);
      throw err;
    }
  }
  function save(key, value) {
    const snapshot = copy(value);
    if (JSON.stringify(entries[key]?.value) === JSON.stringify(snapshot)) return;
    clock = Math.max(Date.now(), clock + 0.001, (entries[key]?.updatedAt || 0) + 0.001);
    const entry = { version: 1, updatedAt: clock, value: snapshot };
    entries[key] = entry;
    let mirrored = true;
    try { mirror(); } catch (err) { mirrored = false; status(`浏览器自动保存失败：${err.message}`, true); }
    if (remote) {
      dirty.set(key, entry); clearTimeout(timer); timer = setTimeout(() => flush(), 120);
    } else if (mirrored) status("");
  }
  const fieldKey = (el, i) => el.id ? `id:${el.id}` : `index:${i}:${el.tagName}:${el.type}`;
  const fields = root => [...root.querySelectorAll('input:not([type="password"]):not([type="file"]), select, textarea')];
  const detailKey = (el, i) => el.id || (el.dataset.eventIndex ? `event:${el.dataset.eventIndex}` : `${el.closest('[data-slot]')?.dataset.slot || ""}/${el.querySelector('summary')?.textContent.trim()}/${i}`);
  function forms(root) {
    return Object.fromEntries(fields(root).map((el, i) => [fieldKey(el, i), el.type === "checkbox" || el.type === "radio" ? el.checked : el.value]));
  }
  function scope(key) {
    let capture, skipCapture = false, restorePending = entries[key]?.value?.ui;
    const load = () => copy(entries[key]?.value || {});
    function restoreForms(root, emit = false) {
      const saved = load().forms || {};
      fields(root).forEach((el, i) => {
        const value = saved[fieldKey(el, i)];
        if (value === undefined || (el.tagName === "SELECT" && ![...el.options].some(o => o.value === value))) return;
        if (el.type === "checkbox" || el.type === "radio") el.checked = !!value;
        else el.value = value;
        if (emit) { el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }
      });
    }
    function restoreUI(root) {
      if (!restorePending) return;
      const ui = restorePending;
      root.querySelectorAll("details").forEach((el, i) => { if (Object.hasOwn(ui.details || {}, detailKey(el, i))) el.open = ui.details[detailKey(el, i)]; });
      root.scrollTop = ui.scrollTop || 0;
      root.querySelectorAll("[id]").forEach(el => { if (ui.scrolls?.[el.id] != null) el.scrollTop = ui.scrolls[el.id]; });
    }
    function bind(root, getter) {
      let stopped = false, scheduled = false, idle;
      if (!getter) restoreForms(root, true);
      restoreUI(root);
      capture = () => {
        if (stopped || skipCapture) return;
        const previous = load().ui || {};
        const ui = {
          scrollTop: root.scrollTop,
          details: Object.fromEntries([...root.querySelectorAll("details")].map((el, i) => [detailKey(el, i), el.open])),
          scrolls: Object.fromEntries([...root.querySelectorAll("[id]")].filter(el => el.scrollTop > 0).map(el => [el.id, el.scrollTop])),
        };
        // 首次异步渲染尚未完成时不丢掉已保存的内部滚动位置。
        if (restorePending) {
          ui.scrolls = { ...previous.scrolls, ...ui.scrolls };
          ui.scrollTop = restorePending.scrollTop || 0;
        }
        save(key, { data: getter ? getter() : {}, forms: forms(root), ui });
      };
      const schedule = () => {
        clearTimeout(idle);
        if (scheduled) return;
        scheduled = true;
        queueMicrotask(() => { scheduled = false; capture(); });
      };
      const changed = event => {
        if (["input", "change"].includes(event?.type)) skipCapture = false;
        if (!["toggle", "scroll"].includes(event?.type)) restorePending = null;
        // 滚动和滚轮会连续触发，停下后再记一次位置；切页和关闭窗口时另有 capture 兜底。
        if (["scroll", "wheel"].includes(event?.type)) { clearTimeout(idle); idle = setTimeout(schedule, 300); return; }
        schedule();
      };
      const events = ["input", "change", "click", "toggle", "scroll", "wheel", "pointerdown", "keydown"];
      for (const name of events) root.addEventListener(name, changed, name === "toggle" || name === "scroll");
      const hide = () => { capture(); flush(true); };
      global.addEventListener("pagehide", hide);
      requestAnimationFrame(() => restoreUI(root));
      return () => {
        clearTimeout(idle); capture(); stopped = true;
        for (const name of events) root.removeEventListener(name, changed, name === "toggle" || name === "scroll");
        global.removeEventListener("pagehide", hide); flush();
      };
    }
    return { load, save: value => save(key, value), reset: () => { skipCapture = true; restorePending = null; save(key, {}); }, restoreForms, restoreUI, bind, capture: () => capture?.() };
  }
  global.GT_LOCAL_STATE = { init, scope, flush };
})(window);
