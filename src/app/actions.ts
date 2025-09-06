'use server';

import type { Exchange, ExchangeName, SimulationResult, GetCryptoPricesOutput } from '@/lib/types';

// Mapeamento de nomes para URLs de API e funções de extração de preço
const exchangeApiConfig = {
    Binance: {
        url: 'https://api.binance.com/api/v3/ticker/24hr?symbol=USDTBRL',
        getPrice: (data: any): number | null => {
            if (data && typeof data === 'object' && !Array.isArray(data) && data.lastPrice) {
                return parseFloat(data.lastPrice);
            }
            if (Array.isArray(data) && data.length > 0 && data[0].symbol === 'USDTBRL' && data[0].lastPrice) {
                return parseFloat(data[0].lastPrice);
            }
            return null;
        }
    },
    Bybit: {
        url: 'https://api.bybit.com/v5/market/tickers?category=spot&symbol=USDTBRL',
        getPrice: (data: any): number | null => {
             if (data?.result?.list && data.result.list.length > 0 && data.result.list[0].lastPrice) {
                return parseFloat(data.result.list[0].lastPrice);
            }
            return null;
        }
    },
    KuCoin: {
        url: 'https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=USDT-BRL',
        getPrice: (data: any): number | null => {
            if (data?.data?.price) {
                return parseFloat(data.data.price);
            }
            return null;
        }
    },
    Coinbase: {
        url: 'https://api.coinbase.com/v2/prices/USDT-BRL/spot',
        getPrice: (data: any): number | null => {
            if (data?.data?.amount) {
                return parseFloat(data.data.amount);
            }
            return null;
        }
    }
};

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/109.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/109.0'
];

function getRandomUserAgent() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}


async function fetchPriceFromExchange(exchangeName: ExchangeName): Promise<number | string | null> {
    const config = exchangeApiConfig[exchangeName];
    if (!config) return `Config not found for ${exchangeName}`;

    let responseText = '';
    try {
        const response = await fetch(config.url, {
            cache: 'no-store',
            headers: { 
                'Accept': 'application/json', 
                'User-Agent': getRandomUserAgent()
            },
            signal: AbortSignal.timeout(15000)
        });
        
        responseText = await response.text();

        if (!response.ok) {
            return `API Error ${exchangeName}: Status ${response.status}. Body: ${responseText}`;
        }
        
        const data = JSON.parse(responseText);
        const price = config.getPrice(data);

        if (price === null || isNaN(price)) {
            return `Failed to parse price from ${exchangeName}. Raw data: ${responseText}`;
        }
        
        return price;

    } catch (error) {
        if (error instanceof Error) {
            return `Fetch Error ${exchangeName}: ${error.name} - ${error.message}. Raw text: ${responseText}`;
        }
        return `Unknown error for ${exchangeName}.`;
    }
}

export async function getUsdtBrlPrices(): Promise<GetCryptoPricesOutput> {
    const allExchangeNames: ExchangeName[] = ['Binance', 'Bybit', 'KuCoin', 'Coinbase'];

    const pricePromises = allExchangeNames.map(name => fetchPriceFromExchange(name));

    const prices = await Promise.all(pricePromises);

    const finalPrices: GetCryptoPricesOutput = allExchangeNames.map((name, index) => ({
        name: name,
        buyPrice: prices[index],
    }));
    
    return finalPrices;
}


const PICNIC_SELL_FEE = 0.002;

export async function runSimulation(amount: number, rates: Exchange[], picnicPrice: number): Promise<SimulationResult[]> {
    return rates.map(exchange => {
        if (typeof exchange.buyPrice !== 'number') {
            return {
                exchangeName: exchange.name,
                icon: exchange.icon,
                initialBRL: amount,
                buyPrice: exchange.buyPrice, // Will be string or null
                usdtAmount: null,
                finalBRL: null,
                profit: null,
                profitPercentage: null,
            };
        }

        const usdtBought = amount / exchange.buyPrice;
        const usdtAfterFee = usdtBought * (1 - exchange.fee);
        const brlFromSale = usdtAfterFee * picnicPrice;
        const finalBRL = brlFromSale * (1 - PICNIC_SELL_FEE);
        const profit = finalBRL - amount;
        const profitPercentage = (profit / amount) * 100;

        return {
            exchangeName: exchange.name,
            icon: exchange.icon,
            initialBRL: amount,
            usdtAmount: usdtAfterFee,
            finalBRL,
            profit,
            profitPercentage,
            buyPrice: exchange.buyPrice,
        };
    });
}
