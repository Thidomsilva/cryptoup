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

async function getPtaxRate(): Promise<number | null> {
    try {
        const response = await fetch("https://api.bcb.gov.br/dados/serie/bcdata.sgs.10813/dados/ultimos/1?formato=json");
        if (response.ok) {
            const data = await response.json();
            if (data && data[0] && data[0].valor) {
                console.log("Successfully fetched PTAX rate:", data[0].valor);
                return parseFloat(data[0].valor);
            }
        }
        console.warn("Could not fetch PTAX rate from BCB API.");
    } catch (e) {
        console.error("Error fetching PTAX rate:", e);
    }
    return null;
}

async function getBrlToUsdRate(): Promise<number | null> {
    try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=brl');
        if (response.ok) {
            const data = await response.json();
            if (data['usd-coin'] && data['usd-coin'].brl) {
                console.log("Using CoinGecko USDC/BRL rate:", data['usd-coin'].brl);
                return data['usd-coin'].brl;
            }
        }
        console.warn("Could not fetch BRL/USDC direct rate from CoinGecko, falling back to PTAX.");
    } catch (e) {
        console.error("Error fetching BRL/USDC direct rate, falling back to PTAX:", e);
    }
    
    // Fallback to PTAX if CoinGecko fails
    const ptaxRate = await getPtaxRate();
    if (ptaxRate) {
        console.log("Using PTAX rate as fallback:", ptaxRate);
        return ptaxRate;
    }

    console.error("FATAL: Could not determine a reliable BRL/USD conversion rate from any source.");
    return null;
}


export async function getUsdtBrlPrices(): Promise<GetCryptoPricesOutput> {
    try {
        const [brlToUsdRate, tetherResponse] = await Promise.all([
            getBrlToUsdRate(),
            fetch('https://api.coingecko.com/api/v3/coins/tether/tickers?per_page=200')
        ]);
        
        if (!brlToUsdRate) {
            console.error("FATAL: BRL/USD conversion rate is not available. Cannot calculate prices.");
            return []; // Cannot proceed without a conversion rate
        }
        
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

        const allExchangeNames: ExchangeName[] = ['Binance', 'Bybit', 'KuCoin', 'Coinbase'];
        // Store the best price found for each exchange. Priority is 1 for BRL pairs, 0 for USD pairs.
        const prices: { [K in ExchangeName]?: { price: number, priority: number } } = {};

        for (const ticker of tickers) {
            // Skip if the ticker is stale or has no volume, or if it's not a USDT pair
            if (ticker.is_stale || ticker.converted_volume_usd < 1000 || ticker.base.toUpperCase() !== 'USDT') {
                continue;
            }

            const exchangeName = mapExchangeName(ticker.market.name);

            if (exchangeName && allExchangeNames.includes(exchangeName)) {
                let currentPrice: number | null = null;
                let priority = -1; 

                // Prioritize direct BRL pairs. A price > 1 is a sanity check.
                if (ticker.target.toUpperCase() === 'BRL' && ticker.last > 1) {
                     currentPrice = ticker.last;
                     priority = 1; // Higher priority for direct BRL
                }
                // Fallback to USD-based pair for conversion. A price around 1 is a sanity check.
                else if (brlToUsdRate && (ticker.target.toUpperCase() === 'USDT' || ticker.target.toUpperCase() === 'USD') && ticker.last > 0.5 && ticker.last < 1.5) {
                    currentPrice = ticker.last * brlToUsdRate;
                    priority = 0; // Lower priority for converted USD
                }

                if (currentPrice !== null) {
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
                // If price is not found for a specific exchange, create a placeholder using the BRL/USD rate
                // This ensures all exchanges are always present, preventing the frontend error.
                console.warn(`Could not find a specific price for ${name}. Using the general BRL/USD rate as an estimate.`);
                return {
                    name: name,
                    buyPrice: brlToUsdRate, // Using the general rate as a fallback price
                };
            })
            .filter((p): p is { name: ExchangeName; buyPrice: number; } => p !== null);


        if (finalPrices.length === 0) {
            console.error("Could not fetch or calculate any valid USDT prices.");
        }

        return finalPrices;

    } catch (error) {
        console.error('Error fetching or processing cryptocurrency prices:', error);
        return [];
    }
}
