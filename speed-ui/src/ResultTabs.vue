<script setup lang="ts">
/* 配速查询 · 结果页签：计算明细、行动时间轴、各模式需求、自动推荐。 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import NumField from "./NumField.vue";
import SelectField from "./SelectField.vue";
import { fix } from "./motion.ts";
import { useSpeedPage } from "./page.ts";

const { state, numberOptions, form, result, verdict, tabsBox, activeTab, selectTab, tabInk, KIND_TEXT, tables, viewId, viewTable, recommend, runRecommend, applyRecommend, viewTableMode } = useSpeedPage();
</script>

<template>
  <div ref="tabsBox" class="tabs sp-tabs" role="tablist">
    <button v-for="[tab, label] in [['detail', '计算明细'], ['timeline', '行动时间轴'], ['tables', '各模式需求'], ['recommend', '自动推荐']]" :key="tab" type="button" class="tab" :class="{ active: activeTab === tab }" :data-tab="tab" @click="selectTab(tab)">{{ label }}</button>
    <span ref="tabInk" class="sp-tab-ink" aria-hidden="true"></span>
  </div>

  <div class="sp-panel" :class="{ hidden: activeTab !== 'detail' }" data-panel="detail">
    <h3>实际速度</h3>
    <div class="sp-metrics">
      <div class="sp-metric"><div class="k">初始速度（含行迹）</div><div id="r-base" class="v">{{ result ? fix(result.speed.base, 0) : "-" }}</div></div>
      <div class="sp-metric"><div class="k">速度 % / 固定</div><div id="r-split" class="v small">{{ result ? `+${fix(result.speed.pct, 1)}% / +${fix(result.speed.flat, 1)}` : "-" }}</div></div>
      <div class="sp-metric"><div class="k">单动行动值</div><div id="r-av" class="v small">{{ result ? `${fix(10000 / Math.max(1, result.speed.final), 2)} AV` : "-" }}</div></div>
    </div>
    <p id="r-formula" class="formula">{{ result?.speed.formula || "" }}</p>
    <div id="r-breakdown">
      <template v-if="result">
        <div v-if="result.speed.breakdown.length" class="table-wrap">
          <table class="data">
            <thead><tr><th>来源</th><th class="num">类型</th><th class="num">数值</th></tr></thead>
            <tbody>
              <tr v-for="(item, index) in result.speed.breakdown" :key="index">
                <td>{{ item.label }}<template v-if="item.team"> <span class="pill">全队</span></template><div v-if="item.text" class="muted small">{{ item.text }}</div></td>
                <td class="num">{{ KIND_TEXT[item.kind] || "固定速度" }}</td>
                <td class="num">{{ item.kind === "base" ? "" : "+" }}{{ fix(item.value, 1) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="hint">还没有任何速度来源（只靠基础速度）。</p>
      </template>
    </div>
    <h3>拉条来源</h3>
    <p id="r-advance" class="hint">
      <template v-if="result">
        <template v-if="result.advance.items.length">合计拉条 <b>{{ fix(result.advance.total, 1) }}%</b>（折算 {{ fix(result.advance.distance, 0) }} 行动值距离）：{{ result.advance.items.map((item: any) => item.label).join("；") }}</template>
        <template v-else>没有拉条。</template>
      </template>
    </p>
    <div id="r-verdict"><p v-for="(text, index) in result?.warnings || []" :key="index" class="warnbar">{{ text }}</p></div>
    <div id="r-suggestions">
      <template v-if="result?.suggestions?.length">
        <h3>怎么补上这 {{ fix(Math.abs(result.verdict.gap), 2) }} 速</h3>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>办法</th><th class="num">之后速度</th><th class="num">还需要</th><th>结果</th></tr></thead>
            <tbody>
              <tr v-for="(item, index) in result.suggestions" :key="index"><td>{{ item.label }}</td><td class="num">{{ fix(item.speed, 1) }}</td><td class="num">{{ fix(Math.max(0, item.required), 1) }}</td><td>{{ item.ok ? "✅ 够了" : `还差 ${fix(item.gap, 1)}` }}</td></tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>
  </div>

  <div class="sp-panel" :class="{ hidden: activeTab !== 'timeline' }" data-panel="timeline">
    <div id="r-timeline">
      <p v-if="!result" class="hint">算完之后这里显示每一动的速度和行动值。</p>
      <p v-else-if="!(result.simulation?.timeline || []).length" class="hint">这一套没有需要模拟的行动顺序。</p>
      <template v-else>
        <ol class="sp-timeline">
          <li v-for="(step, index) in result.simulation.timeline" :key="index">
            <span class="sp-tl-no">第 {{ step.action }} 动</span>
            <span class="num">{{ fix(step.speed, 1) }} 速</span>
            <span class="num muted">@ {{ fix(step.av, 0) }} AV</span>
            <span class="muted small sp-tl-active">{{ (step.active || []).join("、") }}</span>
          </li>
        </ol>
        <p v-if="(result.simulation.notes || []).length" class="hint"><template v-for="(note, index) in result.simulation.notes" :key="index"><br v-if="index" />{{ note }}</template></p>
      </template>
    </div>
  </div>

  <div class="sp-panel" :class="{ hidden: activeTab !== 'tables' }" data-panel="tables">
    <h3>需求速度：各模式 × T 数 × 动数</h3>
    <div id="table-modes" class="sp-mode-switch">
      <button v-for="t in tables" :key="t.id" type="button" class="ghost small" :class="{ active: t.id === viewId }" :data-view-mode="t.id" @click="viewTableMode(t.id)">{{ t.name }}{{ t.id === state.target.mode ? " ·目标" : "" }}</button>
    </div>
    <div id="r-tables">
      <template v-if="viewTable">
        <p class="hint">{{ viewTable.note || "" }}　绿色 = 当前速度可达；单元格里是需要的速度。</p>
        <p v-if="(viewTable.stars || []).length" class="hint">星级线：{{ viewTable.stars.map((star: any) => `${star.label} = ${star.cycles} 轮（${star.totalAV} AV）`).join("　") }}</p>
        <div class="table-wrap">
          <table class="data sp-req">
            <thead>
              <tr>
                <th>动数 \ T</th>
                <th v-for="t in viewTable.tValues" :key="t" class="num">{{ t }}T<div class="muted small">{{ Number(viewTable.firstCycleAV ?? 150) + t * Number(viewTable.cycleAV ?? 100) }} AV</div></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in viewTable.rows" :key="row.actions">
                <td>{{ row.actions }} 动</td>
                <td v-for="(cell, index) in row.cells" :key="index" class="num" :class="cell.reachable ? 'reachable' : 'unreachable'">{{ fix(cell.speed, 1) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>
  </div>

  <div class="sp-panel" :class="{ hidden: activeTab !== 'recommend' }" data-panel="recommend">
    <h3>自动推荐配装</h3>
    <p class="hint">
      在这个角色能用的光锥与遗器里穷举一遍，找出「达成当前目标最省」的几套。
      这是自动算出来的最优解，<b>不是社区主流配装表</b>（那个数据源拿不到）。
    </p>
    <div class="sp-form-row sp-rec-row">
      <NumField id="recConeUlts" label="光锥开大次数" :value="form.recConeUlts" min="0" step="1" @input="(v: string) => (form.recConeUlts = v)" />
      <NumField id="recFourUlts" label="风套开大次数" :value="form.recFourUlts" min="0" step="1" @input="(v: string) => (form.recFourUlts = v)" />
      <SelectField id="recS" label="光锥叠影" :value="form.recS" :options="numberOptions([1, 2, 3, 4, 5])" @change="(v: string) => (form.recS = v)" />
      <button id="rec-btn" type="button" class="sp-btn primary" @click="runRecommend">算一下哪套最省</button>
    </div>
    <div id="r-recommend">
      <div v-if="recommend?.loading" class="loading">穷举中…</div>
      <p v-else-if="recommend?.error" class="error-text">{{ recommend.error }}</p>
      <template v-else-if="recommend?.data">
        <p class="hint">
          穷举了 {{ recommend.data.evaluated }} 套组合 · 假设：速度鞋{{ recommend.data.assumptions.speedBoots ? "开" : "关" }}、
          叠影 {{ recommend.data.assumptions.superimpose }}、光锥开大 {{ recommend.data.assumptions.coneUlts }} 次、风套开大 {{ recommend.data.assumptions.fourPieceUlts }} 次{{ recommend.data.assumptions.excludeLastUlt ? "（已按「轴底开大」扣掉最后一次）" : "" }} · 目标 {{ recommend.data.target.totalAV }} AV 内 {{ recommend.data.target.actions }} 动
        </p>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>光锥</th><th>4 件套</th><th>饰品</th><th class="num">速度</th><th class="num">拉条</th><th>结果</th><th></th></tr></thead>
            <tbody>
              <tr v-for="(item, index) in recommend.data.results" :key="index">
                <td>{{ item.coneName }}</td>
                <td>{{ item.fourPieceName }}</td>
                <td>{{ item.ornamentNames.filter(Boolean).join("、") || "—" }}</td>
                <td class="num">{{ fix(item.speed, 1) }}</td>
                <td class="num">{{ fix(item.advance, 0) }}%</td>
                <td>{{ item.ok ? "✅ 够" : `还差 ${fix(item.neededSubstatSpeed, 1)} 副词条` }}<div v-if="item.notes.length" class="muted small">{{ item.notes.join("；") }}</div></td>
                <td><button type="button" class="ghost small" :data-apply="index" @click="applyRecommend(item)">套用</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>
  </div>
</template>
