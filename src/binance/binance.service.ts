import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import {
  candleFromBinanceRow,
  type OhlcCandle,
} from '../indicator/ohlc-candle.js';

const BINANCE_KLINES = 'https://api.binance.com/api/v3/klines';

@Injectable()
export class BinanceService {
  private readonly log = new Logger(BinanceService.name);
  private readonly intervalMs: Record<'1h' | '15m' | '5m', number> = {
    '1h': 60 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '5m': 5 * 60 * 1000,
  };

  /**
   * Completed candles only: drop the last kline if its close time is still in the future.
   */
  async getClosedKlines(
    symbol: string,
    interval: '1h' | '15m' | '5m',
    limit: number,
    endTimeMs?: number,
  ): Promise<OhlcCandle[]> {
    const params: Record<string, string | number> = { symbol, interval, limit };
    if (endTimeMs !== undefined) params.endTime = endTimeMs;
    try {
      const { data } = await axios.get<(string | number)[][]>(BINANCE_KLINES, {
        params,
        timeout: 10_000,
      });
      const now = Date.now();
      const rows = data.filter((k) => +k[6] <= now - 1);
      return rows.map(candleFromBinanceRow);
    } catch (e) {
      this.log.warn(`Binance klines failed: ${(e as Error).message}`);
      throw e;
    }
  }

  /**
   * Optionally includes currently forming candle as the last element.
   */
  async getKlines(
    symbol: string,
    interval: '1h' | '15m' | '5m',
    limit: number,
    options?: { endTimeMs?: number; includeOpen?: boolean },
  ): Promise<OhlcCandle[]> {
    const params: Record<string, string | number> = { symbol, interval, limit };
    if (options?.endTimeMs !== undefined) params.endTime = options.endTimeMs;
    try {
      const { data } = await axios.get<(string | number)[][]>(BINANCE_KLINES, {
        params,
        timeout: 10_000,
      });
      const now = Date.now();
      const rows = data.filter((k) => {
        if (options?.includeOpen) return true;
        return +k[6] <= now - 1;
      });
      const candles = rows.map(candleFromBinanceRow);
      if (!options?.includeOpen) return candles;

      const ms = this.intervalMs[interval];
      if (!candles.length) return candles;
      // If Binance returned an obviously stale "open" candle, drop it.
      const last = candles[candles.length - 1];
      const openAge = now - last.time;
      if (openAge > ms * 2) return candles.slice(0, -1);
      return candles;
    } catch (e) {
      this.log.warn(`Binance klines failed: ${(e as Error).message}`);
      throw e;
    }
  }
}
