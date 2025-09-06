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

async function getBrlUsdRate(tickers: any[]): Promise<number | null> {
    // Try to find a direct USDT/BRL rate from a major exchange first
    const brlTicker = tickers.find(
        (ticker: any) => ticker.target === 'BRL' && ticker.market.name.toLowerCase().includes('binance')
    );
    if (brlTicker?.converted_last?.brl) {
        return brlTicker.converted_last.brl / brlTicker.converted_last.usd;
    }
    
    // As a fallback, try to get a general BRL/USD rate from another reliable pair if USDT/BRL is not available
    try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=usd&vs_currencies=brl');
        if(response.ok) {
            const data = await response.json();
            if (data.usd && data.usd.brl) {
                return data.usd.brl;
            }
        }
    } catch(e) {
        console.error("Could not fetch BRL/USD fallback rate", e);
    }


    console.warn("Could not find a reliable BRL/USD conversion rate.");
    return null;
}


export async function getUsdtBrlPrices(): Promise<GetCryptoPricesOutput> {
    try {
        const response = await fetch('https://api.coingecko.com/api/v3/coins/tether/tickers');
        
        if (!response.ok) {
            console.error('Failed to fetch from CoinGecko API:', response.status, response.statusText);
            return [];
        }

        const data = await response.json();
        const tickers = data.tickers;

        if (!tickers || !Array.isArray(tickers)) {
            console.error('CoinGecko API returned invalid tickers data.');
            return [];
        }

        const brlToUsdRate = await getBrlUsdRate(tickers);

        if (!brlToUsdRate) {
            console.error("Fatal: Could not determine BRL/USD conversion rate. Cannot calculate prices.");
            return [];
        }

        const allExchangeNames: ExchangeName[] = ['Binance', 'Bybit', 'KuCoin', 'Coinbase'];
        const prices: GetCryptoPricesOutput = [];
        const addedExchanges = new Set<ExchangeName>();

        for (const exchangeName of allExchangeNames) {
            // Find a ticker for the exchange, preferably a USD one as it's most common
            const usdTicker = tickers.find(
                (ticker: any) => ticker.target === 'USD' && mapExchangeName(ticker.market.name) === exchangeName
            );

            if (usdTicker && usdTicker.converted_last?.usd) {
                 if (!addedExchanges.has(exchangeName)) {
                    prices.push({
                        name: exchangeName,
                        buyPrice: usdTicker.converted_last.usd * brlToUsdRate,
                    });
                    addedExchanges.add(exchangeName);
                }
            } else {
                 console.warn(`Could not find a USD price for ${exchangeName} on CoinGecko.`);
            }
        }

        if (prices.length === 0) {
            console.error("Could not fetch any quotes from any exchange via CoinGecko.");
        }

        return prices;
    } catch (error) {
        console.error('Error fetching or processing cryptocurrency prices:', error);
        return [];
    }
}
