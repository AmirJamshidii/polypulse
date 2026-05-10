import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import type { CachedMarketTokens } from './polymarket.types.js';

interface GammaMarket {
  id?: string;
  question?: string;
  conditionId?: string;
  condition_id?: string;
  clobTokenIds?: string[];
  active?: boolean;
  closed?: boolean;
}

@Injectable()
export class PolymarketDiscoveryService {
  private readonly log = new Logger(PolymarketDiscoveryService.name);

  constructor(private readonly config: ConfigService) {}

  private gammaBase(): string {
    return (
      this.config.get<string>('GAMMA_API_URL') ??
      'https://gamma-api.polymarket.com'
    );
  }

  /**
   * Resolve YES/NO token IDs for the upcoming window. Uses env overrides when set.
   */
  async resolveMarket(params: {
    searchQuery: string;
    boundaryMs: number;
    asset: string;
  }): Promise<CachedMarketTokens | null> {
    const conditionId = this.config.get<string>('POLYMARKET_CONDITION_ID');
    const yes = this.config.get<string>('POLYMARKET_YES_TOKEN_ID');
    const no = this.config.get<string>('POLYMARKET_NO_TOKEN_ID');
    if (conditionId && yes && no) {
      return {
        conditionId,
        yesTokenId: yes,
        noTokenId: no,
        polymarketUrl: `https://polymarket.com/condition/${conditionId}`,
        boundaryMs: params.boundaryMs,
        asset: params.asset,
      };
    }

    const q = params.searchQuery.trim().toLowerCase();
    try {
      const url = `${this.gammaBase().replace(/\/$/, '')}/markets`;
      const { data } = await axios.get<GammaMarket[] | { data?: GammaMarket[] }>(
        url,
        {
          params: { active: true, closed: false, limit: 200 },
          timeout: 15_000,
        },
      );
      const markets = Array.isArray(data)
        ? data
        : Array.isArray((data as { data?: GammaMarket[] }).data)
          ? (data as { data: GammaMarket[] }).data
          : [];
      const match = markets.find((m) => {
        const question = (m.question ?? '').toLowerCase();
        if (!question) return false;
        return q.split(/\s+/).every((word) => question.includes(word));
      });
      if (!match) {
        this.log.warn(`No Gamma market matched query: ${params.searchQuery}`);
        return null;
      }
      const cid = match.conditionId ?? match.condition_id;
      const tokens = match.clobTokenIds;
      if (!cid || !tokens || tokens.length < 2) {
        this.log.warn('Matched market missing conditionId or clobTokenIds');
        return null;
      }
      return {
        conditionId: cid,
        yesTokenId: tokens[0],
        noTokenId: tokens[1],
        polymarketUrl: `https://polymarket.com/condition/${cid}`,
        question: match.question,
        boundaryMs: params.boundaryMs,
        asset: params.asset,
      };
    } catch (e) {
      this.log.warn(`Gamma discovery failed: ${(e as Error).message}`);
      return null;
    }
  }
}
