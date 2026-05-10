import { Injectable, Logger } from '@nestjs/common';
import type { UserPreference } from '../../generated/prisma/client.js';
import { BinanceService } from '../binance/binance.service.js';
import { IndicatorService } from '../indicator/indicator.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PolymarketCacheService } from '../polymarket/polymarket-cache.service.js';
import { PolymarketClobService } from '../polymarket/polymarket-clob.service.js';
import { PolymarketDiscoveryService } from '../polymarket/polymarket-discovery.service.js';
import type { CachedMarketTokens } from '../polymarket/polymarket.types.js';
import { defaultMarketQuery, parseAssetsJson } from './schedule.util.js';

interface ProgressionState {
  lastBoundaryMs: number;
  lastSignal: 'UP' | 'DOWN';
  lastStake: number;
}

const BET_LIMIT_USDC = 16;

@Injectable()
export class PhaseBService {
  private readonly log = new Logger(PhaseBService.name);
  private readonly progression = new Map<string, ProgressionState>();

  constructor(
    private readonly binance: BinanceService,
    private readonly indicators: IndicatorService,
    private readonly cache: PolymarketCacheService,
    private readonly clob: PolymarketClobService,
    private readonly prisma: PrismaService,
    private readonly discovery: PolymarketDiscoveryService,
  ) {}

  private stateKey(user: UserPreference, asset: string): string {
    return `${user.telegramUserId}:${asset}`;
  }

  private intervalToBinance(
    interval: UserPreference['executionInterval'],
  ): '1h' | '15m' {
    return interval === 'H1' ? '1h' : '15m';
  }

  private async resolveNextStake(
    user: UserPreference,
    asset: string,
    boundaryMs: number,
  ): Promise<number> {
    const base = Number.parseFloat(user.baseBetUsdc);
    const baseStake = Number.isFinite(base) ? base : 10;
    const key = this.stateKey(user, asset);
    const prev = this.progression.get(key);
    if (!prev) return Math.min(baseStake, BET_LIMIT_USDC);

    const periodMs =
      this.intervalToBinance(user.executionInterval) === '1h'
        ? 60 * 60 * 1000
        : 15 * 60 * 1000;
    if (prev.lastBoundaryMs !== boundaryMs - periodMs) {
      this.progression.delete(key);
      return Math.min(baseStake, BET_LIMIT_USDC);
    }

    try {
      const outcomeCandle = await this.binance.getClosedKlines(
        asset,
        this.intervalToBinance(user.executionInterval),
        1,
        boundaryMs - 1,
      );
      const c = outcomeCandle[outcomeCandle.length - 1];
      if (!c) return Math.min(baseStake, BET_LIMIT_USDC);
      const won = (prev.lastSignal === 'UP') === c.isUp;
      if (won) {
        this.progression.delete(key);
        return Math.min(baseStake, BET_LIMIT_USDC);
      }
      return Math.min(prev.lastStake * 2, BET_LIMIT_USDC);
    } catch {
      return Math.min(baseStake, BET_LIMIT_USDC);
    }
  }

  async executeForUserAndAsset(
    user: UserPreference,
    asset: string,
    boundaryMs: number,
    options?: { endTimeMs?: number; allowDiscovery?: boolean },
  ): Promise<void> {
    const endTime = options?.endTimeMs ?? boundaryMs - 1;
    let ohlc1h: Awaited<ReturnType<BinanceService['getClosedKlines']>>;
    let ohlc5m: Awaited<ReturnType<BinanceService['getClosedKlines']>>;
    try {
      // Check signal on the currently forming candle (last 10s window before close).
      ohlc1h = await this.binance.getKlines(asset, '1h', 120, {
        endTimeMs: endTime,
        includeOpen: true,
      });
      ohlc5m = await this.binance.getKlines(asset, '5m', 500, {
        endTimeMs: endTime,
        includeOpen: true,
      });
    } catch {
      await this.prisma.tradeLog.create({
        data: {
          userPreferenceId: user.id,
          signal: 'WAIT',
          executed: false,
          asset,
          error: 'binance_fetch_failed',
        },
      });
      return;
    }

    const evald = this.indicators.evaluate(
      ohlc1h,
      ohlc5m,
      user.signalThreshold,
    );
    if (!evald) {
      await this.prisma.tradeLog.create({
        data: {
          userPreferenceId: user.id,
          signal: 'WAIT',
          executed: false,
          asset,
          error: 'indicator_insufficient_data',
        },
      });
      return;
    }

    const signal = evald.signal;
    const nextStake = await this.resolveNextStake(user, asset, boundaryMs);
    let warm: CachedMarketTokens | undefined = await this.cache.get(
      user.telegramUserId,
      asset,
      boundaryMs,
    );

    if (!warm && options?.allowDiscovery) {
      const q =
        user.polymarketSearchQuery?.trim() ||
        defaultMarketQuery(asset, user.executionInterval);
      const resolved = await this.discovery.resolveMarket({
        searchQuery: q,
        boundaryMs,
        asset,
      });
      if (resolved) {
        await this.cache.setWarmMarket(user.telegramUserId, resolved);
        warm = resolved;
      }
    }

    if (signal === 'WAIT') {
      this.progression.delete(this.stateKey(user, asset));
      await this.prisma.tradeLog.create({
        data: {
          userPreferenceId: user.id,
          signal: 'WAIT',
          executed: false,
          asset,
          escgo: String(evald.escgo),
          stochK: String(evald.stoch),
          stochD: String(evald.stochD),
          conf: String(evald.conf),
          conditionId: warm?.conditionId,
          polymarketUrl: warm?.polymarketUrl,
        },
      });
      return;
    }

    if (!warm) {
      await this.prisma.tradeLog.create({
        data: {
          userPreferenceId: user.id,
          signal,
          executed: false,
          asset,
          escgo: String(evald.escgo),
          stochK: String(evald.stoch),
          stochD: String(evald.stochD),
          conf: String(evald.conf),
          error: 'no_warm_market_cache',
        },
      });
      return;
    }

    const tokenId = signal === 'UP' ? warm.yesTokenId : warm.noTokenId;
    const buy = await this.clob.marketBuyShares({
      tokenId,
      sizeUsdc: nextStake,
    });

    await this.prisma.tradeLog.create({
      data: {
        userPreferenceId: user.id,
        signal,
        executed: !buy.error,
        asset,
        tokenId,
        side: 'BUY',
        size: String(nextStake),
        orderId: buy.orderId,
        polymarketUrl: warm.polymarketUrl,
        error: buy.error,
        escgo: String(evald.escgo),
        stochK: String(evald.stoch),
        stochD: String(evald.stochD),
        conf: String(evald.conf),
        conditionId: warm.conditionId,
      },
    });

    if (buy.error) {
      this.log.warn(`Order failed: ${buy.error}`);
      return;
    }
    this.progression.set(this.stateKey(user, asset), {
      lastBoundaryMs: boundaryMs,
      lastSignal: signal,
      lastStake: nextStake,
    });
  }

  async executeAllAssets(
    user: UserPreference,
    boundaryMs: number,
    options?: { endTimeMs?: number; allowDiscovery?: boolean },
  ): Promise<void> {
    const assets = parseAssetsJson(user.assets);
    for (const asset of assets) {
      await this.executeForUserAndAsset(user, asset, boundaryMs, options);
    }
  }
}
