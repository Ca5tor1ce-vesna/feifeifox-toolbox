/** 把排轴页（Vue + motion-v + axis-engine）打成功能目录里的一个 ui.js。
 *
 * 用法：node tools/build_axis_ui.mjs          # 正服 → features/axis/ui.js（要提交）
 *       node tools/build_axis_ui.mjs --beta   # 测试服 → beta/build/axis-ui.js（不进公开仓库）
 * 产物要提交：用户的包里没有 Node.js，外壳和单文件版直接加载这一个文件，里面没有相对导入。
 * tests/axis/bundle.test.ts 会检查它和源码同步，并且不含测试服包。
 */
import { parse, compileScript } from "@vue/compiler-sfc";
import { build } from "esbuild";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const AXIS_UI_FILE = join(ROOT, "modules", "honkai-star-rail", "features", "axis", "ui.js");
export const BETA_ENTRY = join(ROOT, "beta", "axis", "index.ts");
export const BETA_UI_FILE = join(ROOT, "beta", "build", "axis-ui.js");
const BANNER = "/* 由 tools/build_axis_ui.mjs 从 axis-ui/ 和 axis-engine/ 生成，不要手改。 */";

export const vuePlugin = {
  name: "vue-sfc",
  setup(context) {
    context.onLoad({ filter: /\.vue$/ }, async ({ path }) => {
      const source = await readFile(path, "utf-8");
      const { descriptor, errors } = parse(source, { filename: path });
      if (errors.length > 0) return { errors: errors.map((error) => ({ text: String(error.message ?? error) })) };
      const script = compileScript(descriptor, { id: basename(path), inlineTemplate: true });
      return { contents: script.content, loader: "ts", resolveDir: dirname(path) };
    });
  },
};

/** Vue 生产构建的开关，功能页构建（build_pages.mjs）也用。 */
export const VUE_DEFINE = {
  "process.env.NODE_ENV": '"production"',
  __VUE_OPTIONS_API__: "false",
  __VUE_PROD_DEVTOOLS__: "false",
  __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false",
};

/** main.ts 里的 @beta-pack：正服是空包，测试服换成 beta/axis/index.ts。 */
export const betaPackPlugin = (beta) => ({
  name: "beta-pack",
  setup(context) {
    context.onResolve({ filter: /^@beta-pack$/ }, () => ({ path: beta ? BETA_ENTRY : join(ROOT, "axis-ui", "src", "no-beta.ts") }));
  },
});

export async function bundleAxisUi({ beta = false } = {}) {
  if (beta && !existsSync(BETA_ENTRY)) throw new Error("没有 beta/ 测试服包，打不了测试服");
  const result = await build({
    entryPoints: [join(ROOT, "axis-ui", "src", "main.ts")],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2020",
    minify: true,
    legalComments: "none",
    logLevel: "silent",
    banner: { js: BANNER },
    define: VUE_DEFINE,
    plugins: [vuePlugin, betaPackPlugin(beta)],
  });
  return result.outputFiles[0].text;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const beta = process.argv.includes("--beta");
  const text = await bundleAxisUi({ beta });
  const target = beta ? BETA_UI_FILE : AXIS_UI_FILE;
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, text, "utf-8");
  console.log(`[OK] 已生成 ${target}（${Math.round(text.length / 1024)} KB）`);
}
