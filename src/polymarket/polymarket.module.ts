import { Module } from '@nestjs/common';
import { PolymarketCacheService } from './polymarket-cache.service.js';
import { PolymarketClobService } from './polymarket-clob.service.js';
import { PolymarketDiscoveryService } from './polymarket-discovery.service.js';

@Module({
  providers: [
    PolymarketDiscoveryService,
    PolymarketClobService,
    PolymarketCacheService,
  ],
  exports: [
    PolymarketDiscoveryService,
    PolymarketClobService,
    PolymarketCacheService,
  ],
})
export class PolymarketModule {}
