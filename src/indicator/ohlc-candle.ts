export interface OhlcCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isUp: boolean;
}

export function candleFromBinanceRow(k: (string | number)[]): OhlcCandle {
  const open = +k[1];
  const close = +k[4];
  return {
    time: +k[0],
    open,
    high: +k[2],
    low: +k[3],
    close,
    volume: +k[5],
    isUp: close >= open,
  };
}
