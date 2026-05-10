import { Injectable } from '@nestjs/common';
import { getSignal5m, type Signal5mResult } from './indicators.js';
import type { OhlcCandle } from './ohlc-candle.js';

export type TradeSignal = 'UP' | 'DOWN' | 'WAIT';

export interface EvaluateResult extends Signal5mResult {
  signal: TradeSignal;
}

@Injectable()
export class IndicatorService {
  /**
   * Evaluate last closed 1H candle (index = arr1h.length - 1) with 5m series.
   */
  evaluate(
    ohlc1h: OhlcCandle[],
    ohlc5m: OhlcCandle[],
    threshold: number,
  ): EvaluateResult | null {
    if (ohlc1h.length < 3 || ohlc5m.length < 40) return null;
    const i = ohlc1h.length - 1;
    const raw = getSignal5m(ohlc1h, i, ohlc5m, threshold);
    if (!raw) return null;
    const signal: TradeSignal = raw.dir ?? 'WAIT';
    return { ...raw, signal };
  }
}
