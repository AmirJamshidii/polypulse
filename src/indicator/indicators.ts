import type { OhlcCandle } from './ohlc-candle.js';

/** ESCGO: fraction of green candles in lookback × 100 (from reference HTML). */
export function calcESCGO(
  arr: OhlcCandle[],
  i: number,
  period = 14,
): number | null {
  if (i < period - 1) return null;
  const slice = arr.slice(i - period + 1, i + 1);
  const greens = slice.filter((c) => c.isUp).length;
  return (greens / period) * 100;
}

/** RSI as in reference HTML (14-period simplified smoothing). */
export function calcRSI(arr: OhlcCandle[], i: number, period = 14): number {
  if (i < period) return 50;
  let g = 0;
  let l = 0;
  for (let j = i - period + 1; j <= i; j++) {
    const d = arr[j].close - arr[j - 1].close;
    if (d > 0) g += d;
    else l -= d;
  }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l);
}

export interface StochRsiPoint {
  k: number;
  d: number;
}

/** Stoch RSI: rp=14, sp=14, D = mean of last 3 K (reference HTML). */
export function calcStochRSI(
  arr: OhlcCandle[],
  i: number,
  rp = 14,
  sp = 14,
): StochRsiPoint {
  if (i < rp + sp) return { k: 50, d: 50 };
  const rsis: number[] = [];
  for (let j = i - sp + 1; j <= i; j++) {
    rsis.push(calcRSI(arr, j, rp));
  }
  const mn = Math.min(...rsis);
  const mx = Math.max(...rsis);
  const k = mx === mn ? 50 : ((rsis[rsis.length - 1] - mn) / (mx - mn)) * 100;
  const kArr: number[] = [];
  for (let j = Math.max(0, i - 2); j <= i; j++) {
    const r2: number[] = [];
    for (let m = j - sp + 1; m <= j; m++) {
      if (m >= 0) r2.push(calcRSI(arr, m, rp));
    }
    if (r2.length < sp) {
      kArr.push(50);
      continue;
    }
    const mn2 = Math.min(...r2);
    const mx2 = Math.max(...r2);
    kArr.push(
      mx2 === mn2 ? 50 : ((r2[r2.length - 1] - mn2) / (mx2 - mn2)) * 100,
    );
  }
  return { k, d: kArr.reduce((a, b) => a + b, 0) / kArr.length };
}

export function find5mIndexFor1h(
  arr1h: OhlcCandle[],
  i1h: number,
  arr5m: OhlcCandle[],
): number {
  if (!arr5m?.length) return -1;
  const c = arr1h[i1h];
  if (!c) return -1;
  const endTime = c.time + 60 * 60 * 1000;
  for (let j = arr5m.length - 1; j >= 0; j--) {
    if (arr5m[j].time < endTime && arr5m[j].time >= c.time) return j;
    if (arr5m[j].time < c.time) return j;
  }
  return -1;
}

export type SignalDir = 'UP' | 'DOWN';

export interface Signal5mResult {
  dir: SignalDir | null;
  escgo: number;
  stoch: number;
  stochD: number;
  conf: number;
  thr: number;
}

export function getSignal5m(
  arr1h: OhlcCandle[],
  i: number,
  arr5m: OhlcCandle[],
  thr: number,
): Signal5mResult | null {
  if (i < 2) return null;
  const idx5 = find5mIndexFor1h(arr1h, i, arr5m);
  if (idx5 < 30) return null;
  const e = calcESCGO(arr5m, idx5);
  const s = calcStochRSI(arr5m, idx5);
  if (e === null) return null;
  const eUp = e >= thr;
  const eDn = e <= 100 - thr;
  const sOB = s.k >= thr;
  const sOS = s.k <= 100 - thr;
  const dir: SignalDir | null = eUp && sOB ? 'UP' : eDn && sOS ? 'DOWN' : null;
  const conf =
    dir === 'UP'
      ? Math.round((e + s.k) / 2)
      : dir === 'DOWN'
        ? Math.round((100 - e + (100 - s.k)) / 2)
        : 0;
  return { dir, escgo: e, stoch: s.k, stochD: s.d, conf, thr };
}
