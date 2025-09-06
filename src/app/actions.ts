'use server';

import type { GetCryptoPricesOutput, ExchangeName } from '@/lib/types';

// Helper to map API exchange names to our internal ExchangeName type
function mapExchangeName(apiName: string): ExchangeName | null {
    const lowerCaseApiName = apiName.toLowerCase();
    if (lowerCaseApiName.includes('binance')) return 'Binance';
    if (lowerCaseApiName.includes('bybit')) return 'Bybit';
    if (lowerCaseApiName.includes('kucoin')) return 'KuCoin';
    if (lowerCaseApiName.includes('coinbase')) return 'Coinbase';
    return null;
}

export async function getUsdtBrlPrices(): Promise<GetCryptoPricesOutput> {
    try {
        // We will use the CoinGecko API, which is a popular free crypto data aggregator.
        // We are fetching the tickers for Tether (USDT).
        const response = await fetch('https://api.coingecko.com/api/v3/coins/tether/tickers');
        
        if (!response.ok) {
            console.error('Failed to fetch from CoinGecko API:', response.status, response.statusText);
            // Fallback to avoid crashing the app, though in a real scenario,
            // we might want more robust error handling or a retry mechanism.
            return [];
        }

        const data = await response.json();

        const brlTickers = data.tickers.filter(
            (ticker: any) => ticker.target === 'BRL'
        );

        const prices: GetCryptoPricesOutput = [];
        const addedExchanges = new Set<ExchangeName>();

        for (const ticker of brlTickers) {
            const exchangeName = mapExchangeName(ticker.market.name);
            if (exchangeName && !addedExchanges.has(exchangeName)) {
                prices.push({
                    name: exchangeName,
                    // 'converted_last' provides the price in the target currency (BRL)
                    buyPrice: ticker.converted_last.brl,
                });
                addedExchanges.add(exchangeName);
            }
        }

        // Ensure we have prices for all our exchanges, even if the API doesn't return them
        // This is a simple fallback. A more advanced version could try other API endpoints or sources.
        const allExchangeNames: ExchangeName[] = ['Binance', 'Bybit', 'KuCoin', 'Coinbase'];
        for (const name of allExchangeNames) {
            if (!addedExchanges.has(name)) {
                // Try to find a USD price and convert it as a last resort
                const usdTicker = data.tickers.find((t: any) => mapExchangeName(t.market.name) === name && t.target === 'USD');
                if (usdTicker) {
                    // This is a rough estimation, assuming 1 USD is close to the BRL price of USDT.
                    // Not perfect, but better than nothing.
                     const brlPriceOfUsd = data.tickers.find((t: any) => t.base === 'USDT' && t.target === 'BRL')?.converted_last.brl || 5.2;
                     prices.push({ name, buyPrice: usdTicker.converted_last.usd * brlPriceOfUsd });
                } else {
                    // If no price is found, we won't include this exchange in the results.
                    console.warn(`Could not find a BRL or USD price for ${name} on CoinGecko.`);
                }
            }
        }


        return prices;
    } catch (error) {
        console.error('Error fetching or processing crypto prices:', error);
        // Return an empty array or handle the error as appropriate
        return [];
    }
}
