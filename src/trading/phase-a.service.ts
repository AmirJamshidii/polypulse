import { Injectable, Logger } from '@nestjs/common';
import type { UserPreference } from '../../generated/prisma/client.js';
import { PolymarketCacheService } from '../polymarket/polymarket-cache.service.js';
import { PolymarketDiscoveryService } from '../polymarket/polymarket-discovery.service.js';
import { defaultMarketQuery } from './schedule.util.js';

@Injectable()
export class PhaseAService {
  private readonly log = new Logger(PhaseAService.name);

  constructor(
    private readonly discovery: PolymarketDiscoveryService,
    private readonly cache: PolymarketCacheService,
  ) {}

  async prefetchForBoundary(
    user: UserPreference,
    asset: string,
    boundaryMs: number,
  ): Promise<boolean> {
    const q =
      user.polymarketSearchQuery?.trim() ||
      defaultMarketQuery(asset, user.executionInterval);
    const resolved = await this.discovery.resolveMarket({
      searchQuery: q,
      boundaryMs,
      asset,
    });
    if (!resolved) return false;
    await this.cache.setWarmMarket(user.telegramUserId, {
      ...resolved,
      boundaryMs,
      asset,
    });
    this.log.log(
      `Phase A cached ${asset} boundary=${boundaryMs} condition=${resolved.conditionId}`,
    );
    return true;
  }
}
