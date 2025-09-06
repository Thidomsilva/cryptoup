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
            fetch('https://api.coingecko.com/api/v3/coins/tether/tickers?per_page=100')
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
        const prices: GetCryptoPricesOutput = [];
        const addedExchanges = new Set<ExchangeName>();

        // We will iterate through all tickers and pick the first valid price for each exchange we need.
        for (const ticker of tickers) {
            const exchangeName = mapExchangeName(ticker.market.name);

            // If we have an exchange we care about and haven't added it yet
            if (exchangeName && allExchangeNames.includes(exchangeName) && !addedExchanges.has(exchangeName)) {
                
                // Prioritize direct BRL pairs if they exist and seem valid
                if (ticker.target === 'BRL' && ticker.last > 1) { // Check if 'last' seems like a BRL price
                     prices.push({
                        name: exchangeName,
                        buyPrice: ticker.last,
                    });
                    addedExchanges.add(exchangeName);
                    continue; // Move to the next ticker
                }

                // Otherwise, use a USD-based pair for conversion
                if ((ticker.target === 'USDT' || ticker.target === 'USD') && ticker.last > 0.5 && ticker.last < 1.5) { // Sanity check for a ~1.0 price
                    prices.push({
                        name: exchangeName,
                        buyPrice: ticker.last * brlToUsdRate,
                    });
                    addedExchanges.add(exchangeName);
                    continue; // Move to the next ticker
                }
            }
        }
        
        // Final check to see if we got all exchanges we wanted
        if (addedExchanges.size < allExchangeNames.length) {
            console.warn("Could not find prices for all desired exchanges:", allExchangeNames.filter(e => !addedExchanges.has(e)));
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
