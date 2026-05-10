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

@Injectable()
export class PhaseBService {
  private readonly log = new Logger(PhaseBService.name);

  constructor(
    private readonly binance: BinanceService,
    private readonly indicators: IndicatorService,
    private readonly cache: PolymarketCacheService,
    private readonly clob: PolymarketClobService,
    private readonly prisma: PrismaService,
    private readonly discovery: PolymarketDiscoveryService,
  ) {}

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
      ohlc1h = await this.binance.getClosedKlines(asset, '1h', 120, endTime);
      ohlc5m = await this.binance.getClosedKlines(asset, '5m', 500, endTime);
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
    const size = Number.parseFloat(user.baseBetUsdc);
    const buy = await this.clob.marketBuyShares({
      tokenId,
      sizeUsdc: Number.isFinite(size) ? size : 10,
    });

    await this.prisma.tradeLog.create({
      data: {
        userPreferenceId: user.id,
        signal,
        executed: !buy.error,
        asset,
        tokenId,
        side: 'BUY',
        size: user.baseBetUsdc,
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
    }
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
