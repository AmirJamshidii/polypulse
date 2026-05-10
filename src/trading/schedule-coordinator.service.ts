import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PhaseAService } from './phase-a.service.js';
import { PhaseBService } from './phase-b.service.js';
import { nextCloseTime, parseAssetsJson, periodMs } from './schedule.util.js';

interface SlotState {
  phaseA: boolean;
  phaseB: boolean;
}

@Injectable()
export class ScheduleCoordinatorService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly log = new Logger(ScheduleCoordinatorService.name);
  private readonly states = new Map<string, SlotState>();
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly phaseA: PhaseAService,
    private readonly phaseB: PhaseBService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.tick();
    }, 2_000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private key(
    telegramUserId: string,
    asset: string,
    boundaryMs: number,
  ): string {
    return `${telegramUserId}:${asset}:${boundaryMs}`;
  }

  private async tick(): Promise<void> {
    const users = await this.prisma.userPreference.findMany();
    const now = Date.now();
    for (const user of users) {
      const p = periodMs(user.executionInterval);
      const boundary = nextCloseTime(now, p);
      const assets = parseAssetsJson(user.assets);
      for (const asset of assets) {
        const k = this.key(user.telegramUserId, asset, boundary);
        if (now > boundary + 3 * 60_000) {
          this.states.delete(k);
          continue;
        }
        let s = this.states.get(k);
        if (!s) {
          s = { phaseA: false, phaseB: false };
          this.states.set(k, s);
        }
        if (!s.phaseA && now >= boundary - 60_000 && now < boundary) {
          s.phaseA = true;
          try {
            await this.phaseA.prefetchForBoundary(user, asset, boundary);
          } catch (e) {
            this.log.warn(`Phase A error: ${(e as Error).message}`);
          }
        }
        // Evaluate signal only in the last 10 seconds before candle close.
        if (!s.phaseB && now >= boundary - 10_000 && now < boundary) {
          s.phaseB = true;
          try {
            await this.phaseB.executeForUserAndAsset(user, asset, boundary);
          } catch (e) {
            this.log.warn(`Phase B error: ${(e as Error).message}`);
          }
        }
      }
    }
  }

  /** Manual: run Phase B for the current interval close for this user. */
  async runManualPhaseB(telegramUserId: string): Promise<void> {
    const user = await this.prisma.userPreference.findUnique({
      where: { telegramUserId },
    });
    if (!user) throw new Error('No preferences; use /start');
    const p = periodMs(user.executionInterval);
    const boundary = nextCloseTime(Date.now(), p);
    await this.phaseB.executeAllAssets(user, boundary, {
      endTimeMs: Date.now() - 1,
      allowDiscovery: true,
    });
  }
}
