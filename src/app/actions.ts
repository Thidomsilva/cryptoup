'use server';

import type { GetCryptoPricesOutput, ExchangeName } from '@/lib/types';

// Mapeamento de nomes para URLs de API e funções de extração de preço
const exchangeApiConfig = {
    Binance: {
        url: 'https://api.binance.com/api/v3/ticker/price?symbol=USDTBRL',
        getPrice: (data: any) => data.price ? parseFloat(data.price) : null
    },
    Bybit: {
        url: 'https://api.bybit.com/v5/market/tickers?category=spot&symbol=USDTBRL',
        getPrice: (data: any) => data.result?.list?.[0]?.lastPrice ? parseFloat(data.result.list[0].lastPrice) : null
    },
    KuCoin: {
        url: 'https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=USDT-BRL',
        getPrice: (data: any) => data.data?.price ? parseFloat(data.data.price) : null
    },
    Coinbase: {
        url: 'https://api.coinbase.com/v2/prices/USDT-BRL/spot',
        getPrice: (data: any) => data.data?.amount ? parseFloat(data.data.amount) : null
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
            headers: { 'Accept': 'application/json' },
            next: { revalidate: 30 } // Cache de 30 segundos
        });

        if (!response.ok) {
            // Log do erro, mas não quebra a execução para as outras
            console.warn(`Falha ao buscar preço da ${exchangeName}. Status: ${response.status}. Body: ${await response.text()}`);
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
        console.error(`Erro ao buscar preço da ${exchangeName}:`, error);
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
