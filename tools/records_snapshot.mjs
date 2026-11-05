/** 抓一份最新的角色顶分数据，给 B站 Toy 包随包带上（Toy 版页面不连外网）。
 *
 *   node tools/records_snapshot.mjs [输出文件]     # 默认 build/toy/records-snapshot.json
 *
 * 和页面用同一套镜像和校验（records-ui/src/records.ts）：按顺序试镜像，sha256 对得上、结构检查通过才算数。
 * 全部镜像都连不上就报错，不拿旧数据凑合。tools/package.mjs 打 Toy 包时调用。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beijingNow, tryMirrors } from "../records-ui/src/records.ts";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const SNAPSHOT_OUT = join(ROOT, "build", "toy", "records-snapshot.json");

/** Node 里的下载：超时就放弃这个镜像。 */
async function nodeFetch(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    if (error.name === "AbortError") throw new Error("timed out");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** 返回 { fetched_at, sha256, data }；fetcher 可换（测试用）。 */
export async function fetchRecordsSnapshot({ fetcher = nodeFetch, timeoutMs = 15000, now = () => new Date() } = {}) {
  const { mirror, data, sha, attempts } = await tryMirrors(fetcher, undefined, timeoutMs);
  if (!mirror) {
    const detail = attempts.map((a) => `${a.name}：${a.error}`).join("；");
    throw new Error(`角色顶分数据抓不到，Toy 包没打（${detail}）`);
  }
  return { snapshot: { fetched_at: beijingNow(now()), sha256: sha, data }, mirror: mirror.name };
}

export async function writeRecordsSnapshot(out = SNAPSHOT_OUT, options) {
  const { snapshot, mirror } = await fetchRecordsSnapshot(options);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(snapshot), "utf-8");
  const runs = snapshot.data.targets.reduce((sum, t) => sum + t.records.length, 0);
  console.log(`[OK] 角色顶分数据：${snapshot.data.targets.length} 个关卡、${runs} 组记录，采集于 ${snapshot.data.collected_at ?? "?"}（从 ${mirror} 抓取，${snapshot.fetched_at}）`);
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await writeRecordsSnapshot(process.argv[2] ? resolve(process.argv[2]) : SNAPSHOT_OUT);
  } catch (error) {
    console.error(`[X] ${error.message}`);
    process.exit(1);
  }
}
