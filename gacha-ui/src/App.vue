<script setup lang="ts">
/* 抽卡规划：期望 / 分位 / 星琼成本 / 概率曲线 / 参数自检。
 * 计算在 calc.ts（从 gacha/api.py 移植，tests/pages/gacha-oracle.test.ts 对拍）；元素 id 和以前一样，
 * 外壳按 id 保存和恢复输入框（ctx.persistence.restoreForms），不用另外存状态。
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, onBeforeUnmount, reactive, ref, shallowRef, watch } from "vue";

const props = defineProps<{
  call: (action: string, payload?: unknown) => any;
  expose: (api: { run: () => void }) => void;
}>();

const fallback = { pools: [] as any[], currency: { name: "星琼", perPull: 160 }, meta: {} as any };
const dataset = shallowRef<any>(fallback);
const loadError = ref("");
try {
  dataset.value = props.call("pools");
} catch (error) {
  loadError.value = (error as Error).message;
}
const currency = computed(() => dataset.value.currency || fallback.currency);

const form = reactive({ pool: String(dataset.value.pools?.[0]?.id ?? ""), pity: "0", copies: "1", have: "", guaranteed: false });
const currentPool = computed<any>(() => (dataset.value.pools || []).find((pool: any) => pool.id === form.pool) || {});
const hasUp = computed(() => currentPool.value.upChance !== null && currentPool.value.upChance !== undefined);
const poolLabel = (pool: any): string => `${pool.name}（${pool.hardPity} 抽保底${pool.upChance ? `，UP ${pool.upChance * 100}%` : ""}）`;

// ---- 计算 ---- //
const result = shallowRef<{ error?: string; data?: any } | null>(null);
function run(): void {
  try {
    result.value = {
      data: props.call("plan", {
        pool: form.pool,
        pity: Number(form.pity || 0),
        copies: Number(form.copies || 1),
        guaranteed: form.guaranteed,
        havePulls: form.have === "" ? null : Number(form.have),
      }),
    };
  } catch (error) {
    result.value = { error: (error as Error).message };
  }
}
const res = computed(() => result.value?.data);
const zh = (value: number): string => value.toLocaleString("zh-CN");
const stats = computed(() => {
  const r = res.value;
  if (!r) return [];
  const q = r.quantiles;
  const cards = [
    { label: "期望抽数", value: r.expectPulls.toFixed(1), sub: `±${r.stdPulls.toFixed(1)}` },
    { label: "中位数", value: String(r.medianPulls), sub: "一半人比这少", accent: true },
    { label: "80% 把握", value: String(q["80"]), sub: `90% 需要 ${q["90"]} 抽` },
    { label: "期望成本", value: zh(r.expectCurrency), sub: currency.value.name },
    { label: "最坏情况", value: String(r.maxPulls), sub: `硬保底上限 · 90% 成本约 ${zh(q["90"] * currency.value.perPull)} ${currency.value.name}` },
  ];
  if (r.probWithinHave !== undefined) {
    cards.push({ label: `手上 ${r.havePulls} 抽能拿到的概率`, value: `${(r.probWithinHave * 100).toFixed(1)}%`, sub: `${zh(r.currencyWithinHave)} ${currency.value.name}`, accent: true });
  }
  return cards;
});
const tableRows = computed(() => {
  const r = res.value;
  if (!r) return [];
  const every = Math.max(1, Math.ceil(r.maxPulls / 40));
  return r.cdf.filter((d: any) => d.pulls % every === 0 || d.pulls === r.maxPulls);
});

// ---- 累计概率曲线 ---- //
// 按图表实际宽度画（最宽 800），文字就是真实字号；固定 800 宽再整体缩小的话，手机上的刻度字只有 4px。
const chartBox = ref<HTMLElement | null>(null);
const chartWidth = ref(800);
const W = computed(() => Math.max(280, Math.min(800, Math.round(chartWidth.value))));
const H = computed(() => (W.value < 500 ? 200 : 240));
// 图表在算出结果后才出现，所以等元素出现再开始量。
const chartObserver = typeof ResizeObserver === "undefined" ? null
  : new ResizeObserver(([entry]) => { if (entry.contentRect.width) chartWidth.value = entry.contentRect.width; });
watch(chartBox, (el, old) => {
  if (old) chartObserver?.unobserve(old);
  if (el) chartObserver?.observe(el);
});
onBeforeUnmount(() => chartObserver?.disconnect());
const PAD = { left: 46, right: 14, top: 14, bottom: 30 };
const chart = computed(() => {
  const r = res.value;
  const cdf = r?.cdf;
  if (!cdf || !cdf.length) return null;
  const maxX = cdf[cdf.length - 1].pulls;
  const minX = cdf[0].pulls;
  const spanX = Math.max(1, maxX - minX);
  const w = W.value;
  const h = H.value;
  const px = (pulls: number): number => PAD.left + ((pulls - minX) / spanX) * (w - PAD.left - PAD.right);
  const py = (prob: number): number => h - PAD.bottom - prob * (h - PAD.top - PAD.bottom);
  const points = cdf.map((d: any) => `${px(d.pulls).toFixed(1)},${py(d.cdf).toFixed(1)}`).join(" ");
  const area = `${px(minX).toFixed(1)},${py(0).toFixed(1)} ${points} ${px(maxX).toFixed(1)},${py(0).toFixed(1)}`;
  const guides = [0.5, 0.8].map((q) => ({ y: Number(py(q).toFixed(1)), label: `${q * 100}%` }));
  // 分位标签可能挨得很近（比如 80% 与 90% 只差几抽），太挤就只画线不写字
  let lastLabelX = -Infinity;
  const marks = [
    { pulls: r.medianPulls, label: "中位" },
    { pulls: r.quantiles["80"], label: "80%" },
    { pulls: r.quantiles["90"], label: "90%" },
  ].map((mark) => {
    const x = px(mark.pulls);
    const showLabel = x - lastLabelX >= 34;
    if (showLabel) lastLabelX = x;
    return { x: x.toFixed(1), text: showLabel ? `${mark.label} ${mark.pulls}` : "" };
  });
  const tickCount = w < 500 ? 4 : 5;
  const ticks = Array.from({ length: tickCount }, (_, i) => {
    const value = Math.round(minX + (spanX * i) / (tickCount - 1));
    return { x: px(value).toFixed(1), value };
  });
  return { points, area, guides, marks, ticks, baseY: py(0).toFixed(1) };
});

// ---- 参数自检 ---- //
const checkResult = shallowRef<{ error?: string; data?: any } | null>(null);
function runCheck(): void {
  try {
    checkResult.value = { data: props.call("check", {}) };
  } catch (error) {
    checkResult.value = { error: (error as Error).message };
  }
}
const deviationText = (row: any): string => (row.ok ? "✅ 通过" : row.deviation === null ? "—" : `⚠️ 偏差 ${(row.deviation * 100).toFixed(1)}%`);

props.expose({ run });
</script>

<template>
  <div class="gacha-layout">
    <div class="card gacha-input">
      <h2>算算要准备多少抽</h2>
      <div class="gacha-fields">
        <div class="field"><label>卡池</label><select id="pool" v-model="form.pool" class="input wide"><option v-for="pool in dataset.pools || []" :key="pool.id" :value="pool.id">{{ poolLabel(pool) }}</option></select></div>
        <div class="field"><label>当前垫抽（距上次五星）</label><input id="pity" v-model="form.pity" class="input narrow" type="number" min="0" step="1" /></div>
        <div class="field"><label>目标个数</label><input id="copies" v-model="form.copies" class="input narrow" type="number" min="1" max="20" step="1" /></div>
        <div class="field"><label>手上还有多少抽</label><input id="have" v-model="form.have" class="input narrow" type="number" min="0" step="1" placeholder="可留空" /></div>
        <div id="guaranteed-wrap" class="field check" :class="{ hidden: currentPool.baseRate !== undefined && !hasUp }">
          <input id="guaranteed" v-model="form.guaranteed" type="checkbox" /><label for="guaranteed">当前是大保底</label>
        </div>
        <button id="go" class="btn" type="button" @click="run">计算</button>
      </div>
      <p id="pool-hint" class="hint">
        <span v-if="loadError" class="error-text">读不到卡池数据：{{ loadError }}</span>
        <template v-else-if="currentPool.baseRate !== undefined">
          基础 5★ 概率 {{ (currentPool.baseRate * 100).toFixed(1) }}% · 软保底从第 {{ currentPool.softPityStart }} 抽起每抽 +{{ (currentPool.softPityStep * 100).toFixed(0) }}% · 硬保底 {{ currentPool.hardPity }} 抽{{ hasUp ? ` · UP 概率 ${currentPool.upChance * 100}%（歪了下次必中）` : " · 常驻池没有 UP 概念" }}<br />数据版本 {{ dataset.meta?.version || "?" }}；每抽 {{ currency.perPull }} {{ currency.name }}。
        </template>
      </p>
    </div>

    <div class="gacha-output">
      <div id="result">
        <div v-if="result?.error" class="card error"><p class="error-text">{{ result.error }}</p></div>
        <div v-else-if="res" class="card">
          <h2>结果：{{ res.targetLabel }}{{ res.pity ? `（已垫 ${res.pity} 抽）` : "" }}</h2>
          <p v-if="res.warning" class="warnbar" style="margin: 0 0 12px">{{ res.warning }}</p>
          <div class="stat-grid">
            <div v-for="card in stats" :key="card.label" class="stat" :class="{ accent: card.accent }">
              <div class="k">{{ card.label }}</div>
              <div class="v" :class="{ small: card.value.length > 9 }">{{ card.value }}</div>
              <div v-if="card.sub" class="k small">{{ card.sub }}</div>
            </div>
          </div>
          <div ref="chartBox" class="gacha-chart">
            <h3>累计概率曲线</h3>
            <svg v-if="chart" :viewBox="`0 0 ${W} ${H}`" width="100%" style="height: auto; display: block" role="img" aria-label="累计概率曲线">
              <rect x="0" y="0" :width="W" :height="H" fill="transparent" />
              <template v-for="guide in chart.guides" :key="guide.label">
                <line :x1="PAD.left" :y1="guide.y" :x2="W - PAD.right" :y2="guide.y" stroke="#eadce3" stroke-dasharray="4 4" />
                <text :x="PAD.left - 6" :y="guide.y + 4" fill="#a4919c" font-size="10" text-anchor="end">{{ guide.label }}</text>
              </template>
              <polygon :points="chart.area" fill="rgba(217,54,112,0.05)" />
              <polyline :points="chart.points" fill="none" stroke="#d93670" stroke-width="2.2" stroke-linejoin="round" />
              <line :x1="PAD.left" :y1="chart.baseY" :x2="W - PAD.right" :y2="chart.baseY" stroke="#eadce3" />
              <template v-for="(mark, index) in chart.marks" :key="index">
                <line :x1="mark.x" :y1="PAD.top" :x2="mark.x" :y2="H - PAD.bottom" stroke="#ecc3d4" stroke-width="1" stroke-dasharray="3 3" />
                <text v-if="mark.text" :x="mark.x" :y="PAD.top - 2" fill="#d93670" font-size="11" text-anchor="middle">{{ mark.text }}</text>
              </template>
              <text v-for="tick in chart.ticks" :key="tick.x" :x="tick.x" :y="H - 8" fill="#a4919c" font-size="10" text-anchor="middle">{{ tick.value }}</text>
              <text :x="PAD.left" :y="H - 8" fill="#806d7d" font-size="10">抽数</text>
            </svg>
            <p class="hint">横轴是抽数，纵轴是“这么多抽内拿到的概率”。虚线是中位 / 80% / 90% 分位。</p>
          </div>
          <div class="gacha-table">
            <h3>概率明细</h3>
            <div style="max-height: 300px; overflow: auto; margin-top: 12px">
              <table class="data">
                <thead><tr><th>抽数</th><th class="num">这一抽出货</th><th class="num">累计概率</th></tr></thead>
                <tbody>
                  <tr v-for="d in tableRows" :key="d.pulls" :class="{ highlight: d.pulls === res.medianPulls || d.pulls === res.quantiles['80'] }">
                    <td>{{ d.pulls }}</td><td class="num">{{ (d.prob * 100).toFixed(2) }}%</td><td class="num">{{ (d.cdf * 100).toFixed(1) }}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <h2>参数自检</h2>
        <p class="muted small">用模型算出的期望抽数取倒数，和官方公布的综合概率对比。对不上说明游戏改过概率。</p>
        <button id="check" class="btn secondary" type="button" @click="runCheck">跑一次自检</button>
        <div id="check-result">
          <p v-if="checkResult?.error" class="error-text">{{ checkResult.error }}</p>
          <template v-else-if="checkResult?.data">
            <table class="data" style="margin-top: 12px">
              <thead><tr><th>卡池</th><th class="num">硬保底</th><th class="num">模型期望抽数</th><th class="num">模型综合概率</th><th class="num">官方综合概率</th><th>结果</th></tr></thead>
              <tbody>
                <tr v-for="row in checkResult.data.rows" :key="row.id">
                  <td>{{ row.name }}</td>
                  <td class="num">{{ row.hardPity }}</td>
                  <td class="num">{{ row.modelExpectPulls.toFixed(2) }}</td>
                  <td class="num">{{ (row.modelOverallRate * 100).toFixed(3) }}%</td>
                  <td class="num">{{ row.officialOverallRate ? `${(row.officialOverallRate * 100).toFixed(3)}%` : "—" }}</td>
                  <td>{{ deviationText(row) }}</td>
                </tr>
              </tbody>
            </table>
            <p class="hint">{{ checkResult.data.note }}</p>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
