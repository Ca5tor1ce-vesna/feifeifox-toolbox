/** 打包产物要能独立运行：不依赖 Node.js、不残留相对导入（用户的包里没有 Node.js，外壳直接加载它）。 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import { buildAxisEngine } from "../../tools/build_axis_engine.mjs";
import { AXIS_UI_FILE, bundleAxisUi } from "../../tools/build_axis_ui.mjs";

test("排轴页的 ui.js 和源码同步，能单文件加载", async () => {
  const fresh = await bundleAxisUi();
  const committed = readFileSync(AXIS_UI_FILE, "utf-8").replaceAll("\r\n", "\n");
  assert.equal(committed === fresh.replaceAll("\r\n", "\n"), true, "ui.js 过期了，运行 npm run build:axis-ui");
  assert.doesNotMatch(fresh, /(^|[;}])\s*import\s*[\w{*]/m);
  assert.doesNotMatch(fresh, /from\s*["']\.{0,2}\//);
  assert.match(fresh, /export\s*\{[^}]*as default/);
});

test("打包结果与源码算出相同的时间轴", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gt-axis-bundle-"));
  try {
    const outfile = join(dir, "axis-engine.js");
    await buildAxisEngine({ outfile });
    const code = readFileSync(outfile, "utf-8");
    assert.doesNotMatch(code, /^\s*import\s/m);
    assert.doesNotMatch(code, /require\(/);
    assert.doesNotMatch(code, /node:/);

    const bundled = await import(pathToFileURL(outfile).href);
    const source = await import("../../axis-engine/src/index.ts");
    const config = { maxAV: 300, units: [{ id: "a", name: "a", baseSpd: 134, maxEnergy: 120 }] };
    assert.deepEqual(new bundled.AxisEngine(config).run(), new source.AxisEngine(config).run());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
