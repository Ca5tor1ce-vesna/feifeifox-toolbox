/** 开发用的静态服务：把仓库当成站点（/ 是 app/index.html），工具箱不再需要 Python 服务。
 *
 *   node tools/serve.mjs            # http://127.0.0.1:8960
 *   node tools/serve.mjs 8970       # 换端口
 *   node tools/serve.mjs 8970 build/site   # 看构建好的站点（exe 和 B站 Toy 用的就是它）
 *
 * 只开放站点用到的几个目录；api.py、userdata、.git 这些一律 404。存档在浏览器里（见 shell/src/store.ts）。
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const port = Number(process.argv[2] || 8960);
const siteDir = resolve(ROOT, process.argv[3] || ".");
const isRepo = siteDir === ROOT;
const ALLOWED_TOP = new Set(["app", "modules"]);
const BLOCKED = /(^|\/)(api\.py|__pycache__|.*\.pyc)$/;
export const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".md": "text/markdown; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".webm": "video/webm", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
};

function resolvePath(urlPath) {
  const path = decodeURIComponent(urlPath.split("?")[0]);
  if (path === "/" || path === "/index.html") return isRepo ? join(ROOT, "app", "index.html") : join(siteDir, "index.html");
  const rel = normalize(path).replace(/^[/\\]+/, "");
  if (rel.split(sep)[0] === ".." || BLOCKED.test(rel.replaceAll("\\", "/"))) return null;
  if (isRepo && !ALLOWED_TOP.has(rel.split(/[/\\]/)[0])) return null;
  const file = resolve(siteDir, rel);
  return file.startsWith(siteDir + sep) ? file : null;
}

const server = createServer((request, response) => {
  const file = resolvePath(request.url || "/");
  if (!file || !existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("没有这个文件");
    return;
  }
  // 改完 ui.js 刷新就是新的，不用清缓存。
  response.writeHead(200, { "Content-Type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream", "Cache-Control": "no-store" });
  createReadStream(file).pipe(response);
});
server.listen(port, "127.0.0.1", () => console.log(`[OK] 工具箱：http://127.0.0.1:${port}/  （站点目录 ${siteDir}）`));
