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

async function getBrlToUsdRate(): Promise<number | null> {
    try {
        // First, try to get the direct price of USDT in BRL, which is the most accurate for conversion.
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=brl');
        if (response.ok) {
            const data = await response.json();
            if (data.tether && data.tether.brl) {
                return data.tether.brl;
            }
        }
        console.warn("Could not fetch BRL/USDT direct rate from CoinGecko.");
    } catch (e) {
        console.error("Error fetching BRL/USDT direct rate:", e);
    }
    
    // Fallback if the direct USDT rate is not available
    try {
        const response = await fetch('https://api.coingecko.com/api/v3/exchange_rates');
         if (response.ok) {
            const data = await response.json();
            if (data.rates && data.rates.brl && data.rates.usd) {
                return data.rates.brl.value / data.rates.usd.value;
            }
        }
        console.warn("Could not fetch BRL/USD fallback rate from CoinGecko exchange_rates.");
    } catch(e) {
        console.error("Error fetching BRL/USD fallback rate:", e);
    }

    console.error("FATAL: Could not determine a reliable BRL/USD conversion rate.");
    return null;
}


export async function getUsdtBrlPrices(): Promise<GetCryptoPricesOutput> {
    try {
        const [brlToUsdRate, tetherResponse] = await Promise.all([
            getBrlToUsdRate(),
            fetch('https://api.coingecko.com/api/v3/coins/tether/tickers')
        ]);
        
        if (!tetherResponse.ok) {
            console.error('Failed to fetch from CoinGecko API:', tetherResponse.status, tetherResponse.statusText);
            return [];
        }

        const data = await tetherResponse.json();
        const tickers = data.tickers;

        if (!tickers || !Array.isArray(tickers)) {
            console.error('CoinGecko API returned invalid tickers data.');
            return [];
        }

        if (!brlToUsdRate) {
            // If we absolutely cannot get a conversion rate, we can only rely on direct BRL prices.
            console.warn("Warning: BRL/USD conversion rate is not available. Only direct BRL prices will be used.");
        }

        const allExchangeNames: ExchangeName[] = ['Binance', 'Bybit', 'KuCoin', 'Coinbase'];
        const prices: GetCryptoPricesOutput = [];
        const addedExchanges = new Set<ExchangeName>();

        // First pass: Prioritize direct BRL tickers if available
        for (const ticker of tickers) {
            const exchangeName = mapExchangeName(ticker.market.name);
            if (exchangeName && allExchangeNames.includes(exchangeName) && !addedExchanges.has(exchangeName)) {
                if (ticker.target === 'BRL' && ticker.converted_last?.brl) {
                    prices.push({
                        name: exchangeName,
                        buyPrice: ticker.converted_last.brl,
                    });
                    addedExchanges.add(exchangeName);
                }
            }
        }

        // Second pass: For exchanges not found with a direct BRL pair, use USD tickers and the conversion rate
        if (brlToUsdRate) {
            for (const ticker of tickers) {
                const exchangeName = mapExchangeName(ticker.market.name);
                 if (exchangeName && allExchangeNames.includes(exchangeName) && !addedExchanges.has(exchangeName)) {
                    // Use USDT as the primary target, but fall back to USD if needed.
                    if ((ticker.target === 'USDT' || ticker.target === 'USD') && ticker.converted_last?.usd) {
                        prices.push({
                            name: exchangeName,
                            buyPrice: ticker.converted_last.usd * brlToUsdRate,
                        });
                        addedExchanges.add(exchangeName);
                    }
                }
            }
        }

        if (prices.length === 0) {
            console.error("Could not fetch any valid USDT/BRL or USDT/USD quotes from the specified exchanges via CoinGecko.");
        }

        return prices;
    } catch (error) {
        console.error('Error fetching or processing cryptocurrency prices:', error);
        return [];
    }
}
