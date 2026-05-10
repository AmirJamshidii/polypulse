import { ExecutionInterval } from '../../generated/prisma/enums.js';

export function periodMs(interval: ExecutionInterval): number {
  return interval === 'H1' ? 60 * 60 * 1000 : 15 * 60 * 1000;
}

/**
 * Next Binance-aligned candle **close** instant (UTC, epoch ms).
 * Same pattern as `Math.floor((now-1)/p)*p + p`.
 */
export function nextCloseTime(now: number, p: number): number {
  return Math.floor((now - 1) / p) * p + p;
}

export function parseAssetsJson(assets: string): string[] {
  try {
    const a = JSON.parse(assets) as unknown;
    if (Array.isArray(a) && a.every((x) => typeof x === 'string')) return a;
  } catch {
    /* fallthrough */
  }
  return ['BTCUSDT'];
}

export function defaultMarketQuery(
  asset: string,
  interval: ExecutionInterval,
): string {
  const sym = asset.replace(/USDT$/i, '').replace(/USD$/i, '');
  return interval === 'M15' ? `${sym} up down 15m` : `${sym} up down 1h`;
}
