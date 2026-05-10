import { Module } from '@nestjs/common';
import { IndicatorService } from './indicator.service.js';

@Module({
  providers: [IndicatorService],
  exports: [IndicatorService],
})
export class IndicatorModule {}
