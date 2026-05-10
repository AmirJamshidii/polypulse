import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TelegrafModule } from 'nestjs-telegraf';
import { PolymarketModule } from '../polymarket/polymarket.module.js';
import { TradingModule } from '../trading/trading.module.js';
import { BotUpdate } from './bot.update.js';

@Module({
  imports: [
    TelegrafModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        token: config.getOrThrow<string>('TELEGRAM_BOT_TOKEN'),
        launchOptions: {
          allowedUpdates: ['message', 'callback_query'],
        },
      }),
      inject: [ConfigService],
    }),
    TradingModule,
    PolymarketModule,
  ],
  providers: [BotUpdate],
})
export class TelegramModule {}
