import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthController } from './health.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { TelegramModule } from './telegram/telegram.module.js';
import { TradingModule } from './trading/trading.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    CacheModule.register({ isGlobal: true }),
    PrismaModule,
    TradingModule,
    TelegramModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
