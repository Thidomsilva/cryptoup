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
        // This is a reliable endpoint for a direct BRL to USD spot rate via USDC.
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=brl');
        if (response.ok) {
            const data = await response.json();
            if (data['usd-coin'] && data['usd-coin'].brl) {
                // The price of 1 USDC in BRL is effectively the BRL/USD exchange rate.
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
                // Calculate BRL per 1 USD
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
            console.error("FATAL: BRL/USD conversion rate is not available. Cannot calculate prices based on USD pairs.");
            // We can still proceed if we find direct BRL pairs, but USD-based ones will be skipped.
        }

        const allExchangeNames: ExchangeName[] = ['Binance', 'Bybit', 'KuCoin', 'Coinbase'];
        // Store the best price found for each exchange. Priority is 1 for BRL pairs, 0 for USD pairs.
        const prices: { [K in ExchangeName]?: { price: number, priority: number } } = {};

        for (const ticker of tickers) {
            // Skip if the ticker is stale or has no volume
            if (ticker.is_stale || ticker.converted_volume_usd < 1000) {
                continue;
            }

            const exchangeName = mapExchangeName(ticker.market.name);

            if (exchangeName && allExchangeNames.includes(exchangeName)) {
                let currentPrice: number | null = null;
                let priority = -1; 

                // Prioritize direct BRL pairs. A price > 1 is a sanity check.
                if (ticker.target === 'BRL' && ticker.last > 1) {
                     currentPrice = ticker.last;
                     priority = 1; // Higher priority for direct BRL
                }
                // Fallback to USD-based pair for conversion. A price around 1 is a sanity check.
                else if (brlToUsdRate && (ticker.target === 'USDT' || ticker.target === 'USD') && ticker.last > 0.5 && ticker.last < 1.5) {
                    currentPrice = ticker.last * brlToUsdRate;
                    priority = 0; // Lower priority for converted USD
                }

                if (currentPrice !== null) {
                    // If we don't have a price for this exchange yet, or if the new one is higher priority (BRL),
                    // we store it. This ensures a BRL price overwrites a USD-converted one.
                    if (!prices[exchangeName] || priority > (prices[exchangeName]?.priority ?? -1)) {
                         prices[exchangeName] = { price: currentPrice, priority };
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
