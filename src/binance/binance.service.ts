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

  /**
   * Completed candles only: drop the last kline if its close time is still in the future.
   */
  async getClosedKlines(
    symbol: string,
    interval: '1h' | '5m',
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
}
