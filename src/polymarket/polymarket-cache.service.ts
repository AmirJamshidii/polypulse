import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import type { CachedMarketTokens } from './polymarket.types.js';

const TTL_MS = 10 * 60 * 1000;

@Injectable()
export class PolymarketCacheService {
  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  private key(userId: string, asset: string, boundaryMs: number): string {
    return `pm:${userId}:${asset}:${boundaryMs}`;
  }

  async setWarmMarket(userId: string, data: CachedMarketTokens): Promise<void> {
    await this.cache.set(
      this.key(userId, data.asset, data.boundaryMs),
      data,
      TTL_MS,
    );
  }

  async get(
    userId: string,
    asset: string,
    boundaryMs: number,
  ): Promise<CachedMarketTokens | undefined> {
    const v = await this.cache.get<CachedMarketTokens>(
      this.key(userId, asset, boundaryMs),
    );
    return v ?? undefined;
  }
}
