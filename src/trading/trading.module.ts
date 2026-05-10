import { Module } from '@nestjs/common';
import { BinanceModule } from '../binance/binance.module.js';
import { IndicatorModule } from '../indicator/indicator.module.js';
import { PolymarketModule } from '../polymarket/polymarket.module.js';
import { PhaseAService } from './phase-a.service.js';
import { PhaseBService } from './phase-b.service.js';
import { ScheduleCoordinatorService } from './schedule-coordinator.service.js';

@Module({
  imports: [BinanceModule, IndicatorModule, PolymarketModule],
  providers: [PhaseAService, PhaseBService, ScheduleCoordinatorService],
  exports: [ScheduleCoordinatorService, PhaseBService, PhaseAService],
})
export class TradingModule {}
