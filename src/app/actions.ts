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
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=brl');
        if (response.ok) {
            const data = await response.json();
            if (data.tether && data.tether.brl) {
                return data.tether.brl;
            }
        }
    } catch (e) {
        console.error("Could not fetch BRL/USDT direct rate", e);
    }

    try {
        // Fallback to a general USD to BRL rate
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=usd&vs_currencies=brl');
        if (response.ok) {
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
            console.error("Fatal: Could not determine BRL/USD conversion rate. Cannot calculate prices.");
            // Even if rate is missing, try to find direct BRL prices as a last resort
        }

        const allExchangeNames: ExchangeName[] = ['Binance', 'Bybit', 'KuCoin', 'Coinbase'];
        const prices: GetCryptoPricesOutput = [];
        const addedExchanges = new Set<ExchangeName>();

        // Prioritize direct BRL tickers if available
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

        // For exchanges not found with BRL, use USD tickers and the conversion rate
        if (brlToUsdRate) {
            for (const ticker of tickers) {
                const exchangeName = mapExchangeName(ticker.market.name);
                 if (exchangeName && allExchangeNames.includes(exchangeName) && !addedExchanges.has(exchangeName)) {
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
            console.error("Could not fetch any quotes from any exchange via CoinGecko.");
        }

        return prices;
    } catch (error) {
        console.error('Error fetching or processing cryptocurrency prices:', error);
        return [];
    }
}
