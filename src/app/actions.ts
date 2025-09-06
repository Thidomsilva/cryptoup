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
        // This is a reliable endpoint for a direct BRL to USD spot rate.
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=brl');
        if (response.ok) {
            const data = await response.json();
            if (data['usd-coin'] && data['usd-coin'].brl) {
                return data['usd-coin'].brl;
            }
        }
        console.warn("Could not fetch BRL/USDC direct rate from CoinGecko.");
    } catch (e) {
        console.error("Error fetching BRL/USDC direct rate:", e);
    }
    
    // Fallback if the direct USDC rate is not available
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
            fetch('https://api.coingecko.com/api/v3/coins/tether/tickers?per_page=200')
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
            console.error("FATAL: BRL/USD conversion rate is not available. Cannot calculate prices.");
            return [];
        }

        const allExchangeNames: ExchangeName[] = ['Binance', 'Bybit', 'KuCoin', 'Coinbase'];
        const prices: { [K in ExchangeName]?: { price: number, priority: number } } = {};

        for (const ticker of tickers) {
            const exchangeName = mapExchangeName(ticker.market.name);

            if (exchangeName && allExchangeNames.includes(exchangeName)) {
                let currentPrice: number | null = null;
                let priority = 0; // 0 for USD-based, 1 for BRL-based

                // Prioritize direct BRL pairs
                if (ticker.target === 'BRL' && ticker.last > 1) {
                     currentPrice = ticker.last;
                     priority = 1;
                }
                // Fallback to USD-based pair for conversion
                else if ((ticker.target === 'USDT' || ticker.target === 'USD') && ticker.last > 0.5 && ticker.last < 1.5) {
                    currentPrice = ticker.last * brlToUsdRate;
                    priority = 0;
                }

                if (currentPrice !== null) {
                    // If we don't have a price for this exchange yet, or if the new one is higher priority (BRL)
                    if (!prices[exchangeName] || priority > (prices[exchangeName]?.priority ?? -1)) {
                         prices[exchangeName] = { price: currentPrice, priority: priority };
                    }
                }
            }
        }

        const finalPrices: GetCryptoPricesOutput = allExchangeNames
            .map(name => {
                if (prices[name]) {
                    return {
                        name: name,
                        buyPrice: prices[name]!.price,
                    };
                }
                return null;
            })
            .filter((p): p is { name: ExchangeName; buyPrice: number; } => p !== null);


        if (finalPrices.length < allExchangeNames.length) {
            console.warn("Could not find prices for all desired exchanges:", allExchangeNames.filter(e => !finalPrices.some(p => p.name === e)));
        }

        if (finalPrices.length === 0) {
            console.error("Could not fetch any valid USDT/BRL or USDT/USD quotes from the specified exchanges via CoinGecko.");
        }

        return finalPrices;

    } catch (error) {
        console.error('Error fetching or processing cryptocurrency prices:', error);
        return [];
    }
}
