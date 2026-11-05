/* 崩铁抽卡规划的计算（从 modules/honkai-star-rail/features/gacha/api.py 逐行移植）。
 *
 * 2026-11-04 用户决定计算从 Python 搬到 TypeScript。迁移期间 api.py 是标准，
 * tests/pages/gacha-oracle.test.ts 用 Python 算出的完整结果对拍这里（tools/make_gacha_oracle.py 生成基准）。
 *
 * 概率模型
 * --------
 * 设 n 为「距离上一个五星已经抽了多少次 + 1」（也就是这一抽的序号）：
 *   n <  softPityStart：p(n) = baseRate
 *   n >= softPityStart：p(n) = baseRate + softPityStep × (n − softPityStart + 1)
 *   n == hardPity：     p(n) = 1（硬保底）
 * 模型算出的期望抽数取倒数，应该约等于官方公布的综合概率（角色池 1.600%，光锥池 1.870%），check 就是干这个的。
 * 大保底：五星有 upChance 概率是当期 UP；歪了下一个五星必是 UP（角色 50%、光锥 75%）。
 *
 * 移植注意：分布用 Map（和 Python 的 dict 一样按插入顺序遍历），累加顺序和 Python 一致，浮点结果才逐位相同。
 */

export interface Pool {
  id: string;
  name?: string;
  baseRate?: number;
  hardPity?: number;
  softPityStart?: number;
  softPityStep?: number;
  upChance?: number | null;
  officialOverallRate?: number | null;
  [key: string]: unknown;
}

export interface GachaData {
  pools?: Pool[];
  currency?: { name?: string; perPull?: number };
  meta?: Record<string, unknown>;
}

type Distribution = Map<number, number>;

/** Python 的 `x or default`。 */
const or = <T>(value: unknown, fallback: T): T | number | string => (value ? (value as number | string) : fallback);
/** Python 的 int(float(x))：先转浮点再向零取整，转不了就报错。 */
function pyInt(value: unknown): number {
  const number = typeof value === "string" ? Number(value.trim()) : Number(value);
  if (typeof value === "boolean") return value ? 1 : 0;
  if (!Number.isFinite(number) || (typeof value === "string" && value.trim() === "")) {
    throw new Error(`could not convert string to float: '${String(value)}'`);
  }
  return Math.trunc(number);
}
/** Python 的 bool(x)：空列表、空对象、空字符串、0 都是假。 */
function pyBool(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return Boolean(value);
}
const repr = (value: unknown): string => (typeof value === "string" ? `'${value}'` : value === null || value === undefined ? "None" : String(value));

function dataset(data: GachaData): Required<Pick<GachaData, "pools">> & GachaData {
  if (!data?.pools || !data.pools.length) throw new Error("卡池数据缺失：modules/honkai-star-rail/data/gacha_pools.json");
  return data as Required<Pick<GachaData, "pools">> & GachaData;
}

function findPool(data: Required<Pick<GachaData, "pools">>, poolId: unknown): Pool {
  const pools = data.pools;
  const wanted = String(or(poolId, String(pools[0].id)));
  const pool = pools.find((item) => item.id === wanted);
  if (!pool) throw new Error(`未知卡池 ${repr(wanted)}；可选：[${pools.map((item) => repr(item.id)).join(", ")}]`);
  return pool;
}

/** 第 n 抽（自上次五星起算）出五星的概率。 */
export function rateAt(pool: Pool, n: number): number {
  const base = Number(or(pool.baseRate, 0));
  const hard = pyInt(or(pool.hardPity, 90));
  if (n >= hard) return 1.0;
  const start = pyInt(or(pool.softPityStart, hard));
  const step = Number(or(pool.softPityStep, 0));
  if (n < start) return Math.min(1.0, base);
  return Math.min(1.0, base + step * (n - start + 1));
}

/** 距离下一个五星的抽数分布：{抽数: 概率}。 */
export function fiveStarPmf(pool: Pool, startPity = 0): Distribution {
  const hard = pyInt(or(pool.hardPity, 90));
  startPity = Math.max(0, pyInt(startPity));
  if (startPity >= hard) return new Map([[1, 1.0]]);
  const out: Distribution = new Map();
  let survival = 1.0;
  let n = startPity;
  while (n < hard && survival > 1e-15) {
    n += 1;
    const p = rateAt(pool, n);
    out.set(n - startPity, survival * p);
    survival *= 1.0 - p;
  }
  return out;
}

function convolve(a: Distribution, b: Distribution): Distribution {
  const out: Distribution = new Map();
  for (const [ka, pa] of a) {
    if (pa <= 0) continue;
    for (const [kb, pb] of b) {
      const key = ka + kb;
      out.set(key, (out.get(key) ?? 0.0) + pa * pb);
    }
  }
  return out;
}

const scale = (dist: Distribution, factor: number): Distribution => new Map([...dist].map(([k, v]) => [k, v * factor]));

function add(a: Distribution, b: Distribution): Distribution {
  const out: Distribution = new Map(a);
  for (const [k, v] of b) out.set(k, (out.get(k) ?? 0.0) + v);
  return out;
}

/** Python 的 sum()：从 0 开始按顺序加。 */
const sum = (values: Iterable<number>): number => {
  let total = 0;
  for (const value of values) total += value;
  return total;
};

function summarize(dist: Distribution, perPullCost: number): Record<string, unknown> {
  const total = sum(dist.values());
  if (total <= 0) throw new Error("分布为空，无法统计");
  const items = [...dist].map(([k, v]) => [k, v / total] as [number, number]).sort((x, y) => x[0] - y[0]);
  const mean = sum(items.map(([k, v]) => k * v));
  const variance = sum(items.map(([k, v]) => (k - mean) ** 2 * v));
  let cumulative = 0.0;
  const cdf: { pulls: number; prob: number; cdf: number }[] = [];
  for (const [pulls, prob] of items) {
    cumulative += prob;
    cdf.push({ pulls, prob, cdf: Math.min(1.0, cumulative) });
  }
  const quantile = (q: number): number => {
    let acc = 0.0;
    for (const [pulls, prob] of items) {
      acc += prob;
      if (acc >= q - 1e-12) return pulls;
    }
    return items[items.length - 1][0];
  };
  return {
    expectPulls: mean,
    stdPulls: Math.sqrt(variance),
    medianPulls: quantile(0.5),
    quantiles: { 50: quantile(0.5), 80: quantile(0.8), 90: quantile(0.9), 99: quantile(0.99) },
    maxPulls: items[items.length - 1][0],
    minPulls: items[0][0],
    expectCurrency: mean * perPullCost,
    quantileCurrency: { 50: quantile(0.5) * perPullCost, 80: quantile(0.8) * perPullCost, 90: quantile(0.9) * perPullCost },
    cdf,
  };
}

/** 拿到 copies 个当期 UP 的抽数分布。 */
function upDist(pool: Pool, startPity: number, guaranteed: boolean, copies: number, upChance: number): Distribution {
  let dist: Distribution = new Map([[0, 1.0]]);
  let pity = startPity;
  const singleCache = new Map<number, Distribution>();
  const upCache = new Map<number, Distribution>();
  const single = (pityValue: number): Distribution => {
    if (!singleCache.has(pityValue)) singleCache.set(pityValue, fiveStarPmf(pool, pityValue));
    return singleCache.get(pityValue)!;
  };
  for (let index = 0; index < copies; index++) {
    const first = single(pity);
    let need: Distribution;
    if (guaranteed) {
      need = first;
      guaranteed = false;
    } else {
      // upChance 直接中；否则要两个五星（第二个必中）
      if (!upCache.has(pity)) {
        const second = single(0);
        upCache.set(pity, add(scale(first, upChance), scale(convolve(first, second), 1 - upChance)));
      }
      need = upCache.get(pity)!;
      guaranteed = false;
    }
    dist = convolve(dist, need);
    pity = 0;
  }
  return dist;
}

/** 常驻池：拿到 copies 个五星（不分是不是 UP）。 */
function anyDist(pool: Pool, startPity: number, copies: number): Distribution {
  let dist: Distribution = new Map([[0, 1.0]]);
  const first = fiveStarPmf(pool, startPity);
  const later = startPity === 0 ? first : copies > 1 ? fiveStarPmf(pool, 0) : null;
  for (let index = 0; index < copies; index++) dist = convolve(dist, (index === 0 ? first : later)!);
  return dist;
}

const costOf = (data: GachaData): number => Number(or(data.currency?.perPull, 160));

export function createGachaApi(raw: GachaData) {
  const actions: Record<string, (payload: Record<string, unknown>) => unknown> = {
    /** 卡池列表 + 货币信息 + 参数来源。 */
    pools: () => {
      const data = dataset(raw);
      return { pools: data.pools, currency: data.currency || { name: "星琼", perPull: 160 }, meta: data.meta || {} };
    },
    /** 距离下一个五星。 */
    single: (payload) => {
      const data = dataset(raw);
      const pool = findPool(data, payload.pool);
      const pity = Math.max(0, pyInt(or(payload.pity, 0)));
      const hard = pyInt(or(pool.hardPity, 90));
      return {
        ...summarize(fiveStarPmf(pool, pity), costOf(data)),
        pool, pity, pityToHard: Math.max(0, hard - pity), kind: "fiveStar", note: "这是“下一个五星”的分布，不区分是否 UP。",
      };
    },
    /** 拿到 N 个当期 UP（或 N 个五星）需要多少抽。 */
    plan: (payload) => {
      const data = dataset(raw);
      const pool = findPool(data, payload.pool);
      const pity = Math.max(0, pyInt(or(payload.pity, 0)));
      const copies = Math.max(1, Math.min(pyInt(or(payload.copies, 1)), 20));
      const guaranteed = pyBool(payload.guaranteed);
      const cost = costOf(data);
      const hard = pyInt(or(pool.hardPity, 90));
      const upChance = pool.upChance;
      let dist: Distribution;
      let kind: string;
      let targetLabel: string;
      if (upChance === null || upChance === undefined) {
        dist = anyDist(pool, pity, copies);
        kind = "fiveStar";
        targetLabel = `${copies} 个五星`;
      } else {
        dist = upDist(pool, pity, guaranteed, copies, Number(upChance));
        kind = "up";
        targetLabel = `${copies} 个当期 UP`;
      }
      const summary: Record<string, unknown> = { ...summarize(dist, cost), pool, pity, copies, guaranteed, kind, targetLabel, pityToHard: Math.max(0, hard - pity) };
      const have = payload.havePulls;
      if (have !== null && have !== undefined && have !== "") {
        const havePulls = Math.max(0, pyInt(have));
        let cumulative = 0.0;
        for (const [pulls, prob] of [...dist].sort((x, y) => x[0] - y[0])) if (pulls <= havePulls) cumulative += prob;
        summary.havePulls = havePulls;
        summary.probWithinHave = cumulative;
        summary.currencyWithinHave = havePulls * cost;
      }
      if (pity >= hard) summary.warning = "垫抽已达硬保底：下一抽必出五星。";
      else if (guaranteed && upChance !== null && upChance !== undefined) summary.warning = "当前是大保底状态：下一个五星必定是当期 UP。";
      return summary;
    },
    /** 参数自检：模型算出的期望抽数取倒数，和官方综合概率对一下。 */
    check: () => {
      const data = dataset(raw);
      const rows = data.pools.map((pool) => {
        const mean = sum([...fiveStarPmf(pool, 0)].map(([k, v]) => k * v));
        const official = pool.officialOverallRate;
        const modelRate = mean ? 1.0 / mean : 0.0;
        const deviation = official ? Math.abs(modelRate - Number(official)) / Number(official) : null;
        return {
          id: pool.id, name: pool.name, hardPity: pool.hardPity, baseRate: pool.baseRate, softPityStart: pool.softPityStart,
          modelExpectPulls: mean, modelOverallRate: modelRate, officialOverallRate: official, deviation,
          ok: deviation !== null && deviation < 0.02,
        };
      });
      return { rows, note: "偏差在 2% 以内算通过；对不上通常说明游戏改过概率，去 data/gacha_pools.json 调软保底参数。" };
    },
  };
  return {
    call(action: string, payload?: unknown): unknown {
      const handler = actions[action];
      if (!handler) throw new Error(`未知动作 ${repr(action)}`);
      return handler(payload && typeof payload === "object" ? payload as Record<string, unknown> : {});
    },
  };
}
