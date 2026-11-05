/** 把 axis-engine 打成一个不含相对导入的 ES 模块。
 *
 * 用法：node tools/build_axis_engine.mjs [输出文件]，默认 build/axis-engine.js。
 * esbuild 只在开发时使用，用户拿到的包不需要 Node.js。
 */
import { build } from "esbuild";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

export async function buildAxisEngine({ outfile = join(ROOT, "build", "axis-engine.js") } = {}) {
  await build({
    entryPoints: [join(ROOT, "axis-engine", "src", "index.ts")],
    outfile,
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2020",
    legalComments: "none",
    logLevel: "silent",
  });
  return outfile;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outfile = await buildAxisEngine(process.argv[2] ? { outfile: resolve(process.argv[2]) } : {});
  console.log(`[OK] 已生成 ${outfile}`);
}
