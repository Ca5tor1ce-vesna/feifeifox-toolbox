/* 外壳 · 请求浏览器里的后端（shell/src/backend.ts 接住 /api/*）。 */

export async function getJSON(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`接口返回的不是 JSON（${res.status}）：${text.slice(0, 200)}`);
  }
  if (!res.ok || data.ok === false) {
    throw new Error(data && data.error ? data.error : `HTTP ${res.status}`);
  }
  return data;
}

export async function callApi(moduleId, featureId, action, payload = {}) {
  const data = await getJSON("/api/call", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ module: moduleId, feature: featureId, action, payload }),
  });
  return data.result;
}

