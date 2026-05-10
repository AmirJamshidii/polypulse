import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AssetType,
  Chain,
  ClobClient,
  OrderType,
  Side,
} from '@polymarket/clob-client';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygon } from 'viem/chains';

@Injectable()
export class PolymarketClobService {
  private readonly log = new Logger(PolymarketClobService.name);
  private client: ClobClient | null = null;

  constructor(private readonly config: ConfigService) {}

  private host(): string {
    return (
      this.config.get<string>('CLOB_HOST') ?? 'https://clob.polymarket.com'
    );
  }

  private walletFromPk(): ReturnType<typeof createWalletClient> {
    const pk = this.config.get<string>('PRIVATE_KEY');
    if (!pk) throw new Error('PRIVATE_KEY is not set');
    const key = pk.startsWith('0x') ? pk : `0x${pk}`;
    const account = privateKeyToAccount(key as `0x${string}`);
    return createWalletClient({
      account,
      chain: polygon,
      transport: http(),
    });
  }

  private async getClient(): Promise<ClobClient> {
    if (this.client) return this.client;
    const signer = this.walletFromPk();
    const base = new ClobClient(this.host(), Chain.POLYGON, signer);
    const creds = await base.createOrDeriveApiKey();
    this.client = new ClobClient(this.host(), Chain.POLYGON, signer, creds);
    return this.client;
  }

  async getBalanceUsdc(): Promise<{ raw?: string; error?: string }> {
    try {
      const c = await this.getClient();
      const collateral = await c.getBalanceAllowance({
        asset_type: AssetType.COLLATERAL,
      });
      return { raw: JSON.stringify(collateral) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }

  /**
   * Market buy on outcome token (FOK).
   */
  async marketBuyShares(params: {
    tokenId: string;
    sizeUsdc: number;
  }): Promise<{ orderId?: string; raw?: unknown; error?: string }> {
    if (this.config.get<string>('DRY_RUN') === 'true') {
      this.log.log(
        `DRY_RUN market buy skip token=${params.tokenId} size=${params.sizeUsdc}`,
      );
      return { raw: { dryRun: true } };
    }
    try {
      const c = await this.getClient();
      const res: unknown = await c.createAndPostMarketOrder(
        {
          tokenID: params.tokenId,
          side: Side.BUY,
          amount: params.sizeUsdc,
        },
        undefined,
        OrderType.FOK,
      );
      const oid =
        res &&
        typeof res === 'object' &&
        'orderID' in res &&
        typeof res.orderID === 'string'
          ? (res as { orderID: string }).orderID
          : undefined;
      return { raw: res, orderId: oid };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }

  async getOpenOrdersSummary(): Promise<{ raw?: string; error?: string }> {
    try {
      const c = await this.getClient();
      const oo = await c.getOpenOrders({}, true);
      return { raw: JSON.stringify(oo) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }
}
