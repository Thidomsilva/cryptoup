import type { ComponentType, SVGProps } from "react";

export type ExchangeName = 'Binance' | 'Bybit' | 'KuCoin' | 'Coinbase';

export interface ExchangeDetails {
  name: ExchangeName;
  fee: number;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

export interface Exchange extends ExchangeDetails {
  buyPrice: number | string | null;
}

export interface SimulationResult {
  exchangeName: ExchangeName;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  initialBRL: number;
  usdtAmount: number | null;
  finalBRL: number | null;
  profit: number | null;
  profitPercentage: number | null;
  buyPrice: number | string | null;
}

export interface ExchangePrice {
  name: 'Binance' | 'Bybit' | 'KuCoin' | 'Coinbase';
  buyPrice: number | string | null;
}

export type GetCryptoPricesOutput = ExchangePrice[];
