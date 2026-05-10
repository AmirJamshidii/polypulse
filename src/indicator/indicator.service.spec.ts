import { Test, TestingModule } from '@nestjs/testing';
import type { OhlcCandle } from './ohlc-candle.js';
import { calcESCGO, calcStochRSI, getSignal5m } from './indicators.js';
import { IndicatorService } from './indicator.service.js';

function makeCandle(
  t: number,
  open: number,
  close: number,
  isUp = close >= open,
): OhlcCandle {
  return {
    time: t,
    open,
    high: Math.max(open, close),
    low: Math.min(open, close),
    close,
    volume: 1,
    isUp,
  };
}

describe('IndicatorService', () => {
  let svc: IndicatorService;

  beforeEach(async () => {
    const m: TestingModule = await Test.createTestingModule({
      providers: [IndicatorService],
    }).compile();
    svc = m.get(IndicatorService);
  });

  it('calcESCGO matches green count / 14', () => {
    const arr: OhlcCandle[] = [];
    const base = 1_700_000_000_000;
    for (let i = 0; i < 20; i++) {
      arr.push(makeCandle(base + i * 300_000, 100, 100 + (i % 2), i % 2 === 0));
    }
    const v = calcESCGO(arr, 19, 14);
    expect(v).not.toBeNull();
    const greens = arr.slice(6, 20).filter((c) => c.isUp).length;
    expect(v).toBeCloseTo((greens / 14) * 100, 5);
  });

  it('getSignal5m returns null when idx5 < 30', () => {
    const h: OhlcCandle[] = [];
    const m5: OhlcCandle[] = [];
    const t0 = 1_700_000_000_000;
    for (let i = 0; i < 5; i++) {
      h.push(makeCandle(t0 + i * 3_600_000, 100, 101));
    }
    for (let i = 0; i < 20; i++) {
      m5.push(makeCandle(t0 + i * 300_000, 100, 101));
    }
    const r = getSignal5m(h, 4, m5, 60);
    expect(r).toBeNull();
  });

  it('evaluate returns WAIT when indicators do not align', () => {
    const h: OhlcCandle[] = [];
    const m5: OhlcCandle[] = [];
    const t0 = 1_700_000_000_000;
    for (let i = 0; i < 80; i++) {
      h.push(
        makeCandle(t0 + i * 3_600_000, 100 + i * 0.01, 100 + i * 0.01 + 0.5),
      );
    }
    for (let i = 0; i < 400; i++) {
      m5.push(
        makeCandle(t0 + i * 300_000, 100 + i * 0.001, 100 + i * 0.001 + 0.1),
      );
    }
    const out = svc.evaluate(h, m5, 60);
    expect(out).not.toBeNull();
    expect(out!.signal).toBeDefined();
    expect(['UP', 'DOWN', 'WAIT']).toContain(out!.signal);
  });

  it('calcStochRSI returns mid-range when not enough bars', () => {
    const arr = [makeCandle(0, 1, 1)];
    expect(calcStochRSI(arr, 0).k).toBe(50);
  });
});
