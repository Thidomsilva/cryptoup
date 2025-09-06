'use server';
/**
 * @fileOverview An AI flow to get USDT/BRL prices from different exchanges.
 *
 * - getUsdtBrlPrices - A function that returns the current USDT/BRL prices.
 * - GetCryptoPricesOutput - The return type for the getUsdtBrlPrices function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ExchangePriceSchema = z.object({
  name: z.enum(['Binance', 'Bybit', 'KuCoin', 'Coinbase']),
  buyPrice: z.number().describe('The buy price of 1 USDT in BRL.'),
});

const GetCryptoPricesOutputSchema = z.array(ExchangePriceSchema);

export type GetCryptoPricesOutput = z.infer<typeof GetCryptoPricesOutputSchema>;

export async function getUsdtBrlPrices(): Promise<GetCryptoPricesOutput> {
  return getCryptoPricesFlow();
}

const getCryptoPricesFlow = ai.defineFlow(
  {
    name: 'getCryptoPricesFlow',
    outputSchema: GetCryptoPricesOutputSchema,
  },
  async () => {
    // In a real application, you would fetch data from exchange APIs.
    // For this simulation, we'll generate realistic but random prices.
    const basePrice = 5.20;
    const prices: GetCryptoPricesOutput = [
      { name: 'Binance', buyPrice: basePrice + (Math.random() - 0.5) * 0.05 },
      { name: 'Bybit', buyPrice: basePrice + (Math.random() - 0.5) * 0.05 },
      { name: 'KuCoin', buyPrice: basePrice + (Math.random() - 0.5) * 0.05 },
      { name: 'Coinbase', buyPrice: basePrice + (Math.random() - 0.5) * 0.05 },
    ];
    return prices;
  }
);
