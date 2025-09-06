'use server';

import type { Exchange, ExchangeName, SimulationResult, GetCryptoPricesOutput } from '@/lib/types';

// Mapeamento de nomes para URLs de API e funções de extração de preço
const exchangeApiConfig = {
    Binance: {
        url: 'https://api.binance.com/api/v3/ticker/24hr?symbol=USDTBRL',
        // A API da Binance retorna um objeto com 'lastPrice'.
        getPrice: (data: any) => {
            if (data && typeof data === 'object' && !Array.isArray(data) && data.lastPrice) {
                return parseFloat(data.lastPrice);
            }
            return null;
        }
    },
    Bybit: {
        url: 'https://api.bybit.com/v5/market/tickers?category=spot&symbol=USDTBRL',
        // A API da Bybit retorna { result: { list: [...] } }
        getPrice: (data: any) => {
             if (data?.result?.list && data.result.list.length > 0 && data.result.list[0].lastPrice) {
                return parseFloat(data.result.list[0].lastPrice);
            }
            return null;
        }
    },
    KuCoin: {
        url: 'https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=USDT-BRL',
        // A API da KuCoin retorna { data: { price: ... } }
        getPrice: (data: any) => data?.data?.price ? parseFloat(data.data.price) : null
    },
    Coinbase: {
        url: 'https://api.coinbase.com/v2/prices/USDT-BRL/spot',
        // A API da Coinbase retorna { data: { amount: ... } }
        getPrice: (data: any) => data?.data?.amount ? parseFloat(data.data.amount) : null
    }
};

async function fetchPriceFromExchange(exchangeName: ExchangeName): Promise<number | null> {
    const config = exchangeApiConfig[exchangeName];
    if (!config) {
        console.error(`Configuração não encontrada para a exchange: ${exchangeName}`);
        return null;
    }

    try {
        const response = await fetch(config.url, {
            headers: { 
                'Accept': 'application/json', 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36'
            },
            signal: AbortSignal.timeout(10000) // 10 segundos de timeout
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`Erro na API da ${exchangeName}. Status: ${response.status}. Body: ${errorBody}`);
            return null;
        }
        
        const data = await response.json();
        const price = config.getPrice(data);

        if (price === null || isNaN(price)) {
            console.warn(`Não foi possível extrair o preço da resposta da ${exchangeName}. Data:`, JSON.stringify(data));
            return null;
        }
        
        console.log(`Preço da ${exchangeName} obtido com sucesso: ${price}`);
        return price;

    } catch (error) {
        if (error instanceof Error) {
            console.error(`Erro ao buscar preço da ${exchangeName}: ${error.name} - ${error.message}`);
        } else {
             console.error(`Erro desconhecido ao buscar preço da ${exchangeName}:`, error);
        }
        return null;
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
        if (exchange.buyPrice === null) {
            return {
                exchangeName: exchange.name,
                icon: exchange.icon,
                initialBRL: amount,
                buyPrice: null,
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
