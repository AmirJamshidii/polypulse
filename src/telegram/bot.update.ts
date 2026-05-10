import { Action, Command, Ctx, Update } from 'nestjs-telegraf';
import { ConfigService } from '@nestjs/config';
import { Markup } from 'telegraf';
import type { Context } from 'telegraf';
import { ExecutionInterval } from '../../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PolymarketClobService } from '../polymarket/polymarket-clob.service.js';
import { ScheduleCoordinatorService } from '../trading/schedule-coordinator.service.js';

function tgId(ctx: Context): string {
  const id = ctx.from?.id;
  if (id === undefined) throw new Error('No telegram user');
  return String(id);
}

@Update()
export class BotUpdate {
  private readonly allowedUserIds: Set<string>;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly coordinator: ScheduleCoordinatorService,
    private readonly clob: PolymarketClobService,
  ) {
    const raw = this.config.get<string>('ALLOWED_TELEGRAM_USER_IDS') ?? '';
    this.allowedUserIds = new Set(
      raw
        .split(',')
        .map((x) => x.trim())
        .filter((x) => x.length > 0),
    );
  }

  private async requireAllowed(ctx: Context): Promise<string | null> {
    const id = tgId(ctx);
    if (this.allowedUserIds.has(id)) return id;
    await ctx.reply('You are not allowed to use this bot.');
    return null;
  }

  @Command('start')
  async start(@Ctx() ctx: Context): Promise<void> {
    const id = await this.requireAllowed(ctx);
    if (!id) return;
    await this.prisma.userPreference.upsert({
      where: { telegramUserId: id },
      create: { telegramUserId: id },
      update: {},
    });
    await ctx.reply(
      'Polymarkulse bot ready.\n/strategy — cadence, assets, threshold\n/positions — balance & recent trades\n/buy_now — run signal + trade now',
    );
  }

  @Command('positions')
  async positions(@Ctx() ctx: Context): Promise<void> {
    const id = await this.requireAllowed(ctx);
    if (!id) return;
    const bal = await this.clob.getBalanceUsdc();
    const orders = await this.clob.getOpenOrdersSummary();
    const logs = await this.prisma.tradeLog.findMany({
      where: { userPreference: { telegramUserId: id } },
      orderBy: { createdAt: 'desc' },
      take: 12,
    });
    const lines = logs.map(
      (l) =>
        `• ${l.createdAt.toISOString()} ${l.signal} exec=${l.executed} ${l.polymarketUrl ?? ''}`,
    );
    await ctx.reply(
      [
        'USDC / collateral (CLOB):',
        bal.raw ?? `Error: ${bal.error}`,
        '',
        'Open orders (summary):',
        orders.raw ?? `Error: ${orders.error}`,
        '',
        'Recent logs:',
        lines.length ? lines.join('\n') : '—',
      ].join('\n'),
    );
  }

  @Command('strategy')
  async strategy(@Ctx() ctx: Context): Promise<void> {
    const id = await this.requireAllowed(ctx);
    if (!id) return;
    await ctx.reply(
      'Configure strategy:',
      Markup.inlineKeyboard([
        [
          Markup.button.callback('Cadence: 1H', 'cad_h1'),
          Markup.button.callback('Cadence: 15m', 'cad_m15'),
        ],
        [
          Markup.button.callback('Asset: BTC', 'ast_BTCUSDT'),
          Markup.button.callback('Asset: ETH', 'ast_ETHUSDT'),
        ],
        [
          Markup.button.callback('Threshold 55', 'thr_55'),
          Markup.button.callback('Threshold 60', 'thr_60'),
        ],
        [
          Markup.button.callback('Bet $5', 'bet_5'),
          Markup.button.callback('Bet $10', 'bet_10'),
        ],
      ]),
    );
  }

  @Action('cad_h1')
  async onCadH1(@Ctx() ctx: Context): Promise<void> {
    await this.setCadence(ctx, ExecutionInterval.H1);
  }

  @Action('cad_m15')
  async onCadM15(@Ctx() ctx: Context): Promise<void> {
    await this.setCadence(ctx, ExecutionInterval.M15);
  }

  private async setCadence(
    ctx: Context,
    interval: ExecutionInterval,
  ): Promise<void> {
    const id = await this.requireAllowed(ctx);
    if (!id) return;
    const row = await this.prisma.userPreference.findUnique({
      where: { telegramUserId: id },
    });
    if (!row) {
      await ctx.answerCbQuery('Use /start first');
      return;
    }
    await this.prisma.userPreference.update({
      where: { telegramUserId: id },
      data: { executionInterval: interval },
    });
    await ctx.answerCbQuery(`Cadence → ${interval}`);
  }

  @Action(/^ast_(.+)$/)
  async onAsset(@Ctx() ctx: Context): Promise<void> {
    const id = await this.requireAllowed(ctx);
    if (!id) return;
    const m = (ctx as unknown as { match: RegExpExecArray }).match;
    const sym = m[1];
    const row = await this.prisma.userPreference.findUnique({
      where: { telegramUserId: id },
    });
    if (!row) {
      await ctx.answerCbQuery('Use /start first');
      return;
    }
    const assets = JSON.stringify([sym]);
    await this.prisma.userPreference.update({
      where: { telegramUserId: id },
      data: { assets },
    });
    await ctx.answerCbQuery(`Asset → ${sym}`);
  }

  @Action(/^thr_(\d+)$/)
  async onThr(@Ctx() ctx: Context): Promise<void> {
    const id = await this.requireAllowed(ctx);
    if (!id) return;
    const m = (ctx as unknown as { match: RegExpExecArray }).match;
    const thr = Number.parseInt(m[1], 10);
    const row = await this.prisma.userPreference.findUnique({
      where: { telegramUserId: id },
    });
    if (!row) {
      await ctx.answerCbQuery('Use /start first');
      return;
    }
    await this.prisma.userPreference.update({
      where: { telegramUserId: id },
      data: { signalThreshold: thr },
    });
    await ctx.answerCbQuery(`Threshold → ${thr}`);
  }

  @Action(/^bet_(\d+)$/)
  async onBet(@Ctx() ctx: Context): Promise<void> {
    const id = await this.requireAllowed(ctx);
    if (!id) return;
    const m = (ctx as unknown as { match: RegExpExecArray }).match;
    const row = await this.prisma.userPreference.findUnique({
      where: { telegramUserId: id },
    });
    if (!row) {
      await ctx.answerCbQuery('Use /start first');
      return;
    }
    await this.prisma.userPreference.update({
      where: { telegramUserId: id },
      data: { baseBetUsdc: m[1] },
    });
    await ctx.answerCbQuery(`Bet → $${m[1]}`);
  }

  @Command('buy_now')
  async buyNow(@Ctx() ctx: Context): Promise<void> {
    const id = await this.requireAllowed(ctx);
    if (!id) return;
    await ctx.reply('Running Phase B (signal + trade if not WAIT)…');
    try {
      await this.coordinator.runManualPhaseB(id);
      await ctx.reply('Done. Check /positions and DB logs.');
    } catch (e) {
      await ctx.reply(`Error: ${(e as Error).message}`);
    }
  }
}
