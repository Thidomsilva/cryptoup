import type { ComponentType, SVGProps } from "react";

export type ExchangeName = 'Binance' | 'Bybit' | 'KuCoin' | 'Coinbase';

export interface Exchange {
  name: ExchangeName;
  buyPrice: number;
  fee: number;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

export interface SimulationResult {
  exchangeName: ExchangeName;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  initialBRL: number;
  usdtAmount: number;
  finalBRL: number;
  profit: number;
  profitPercentage: number;
}
