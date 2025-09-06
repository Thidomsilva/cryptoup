'use server';

import type { GetCryptoPricesOutput, ExchangeName } from '@/lib/types';

// Helper para mapear nomes de exchanges da API para nosso tipo interno ExchangeName
function mapExchangeName(apiName: string): ExchangeName | null {
    const lowerCaseApiName = apiName.toLowerCase();
    if (lowerCaseApiName.includes('binance')) return 'Binance';
    if (lowerCaseApiName.includes('bybit')) return 'Bybit';
    if (lowerCaseApiName.includes('kucoin')) return 'KuCoin';
    if (lowerCaseApiName.includes('coinbase')) return 'Coinbase';
    return null;
}

export async function getUsdtBrlPrices(): Promise<GetCryptoPricesOutput> {
    try {
        const response = await fetch('https://api.coingecko.com/api/v3/coins/tether/tickers');
        
        if (!response.ok) {
            console.error('Falha ao buscar da API CoinGecko:', response.status, response.statusText);
            return [];
        }

        const data = await response.json();

        // Tenta encontrar uma taxa de conversão de USDT para BRL, preferencialmente da Binance.
        const usdtToBrlRate = data.tickers.find(
            (ticker: any) => ticker.target === 'BRL' && ticker.market.name.toLowerCase().includes('binance')
        )?.converted_last?.brl;

        if (!usdtToBrlRate) {
            // Se a taxa BRL não for encontrada, o fluxo dependerá dos tickers em USD,
            // mas um log pode ser útil para depuração.
            console.warn("Não foi possível encontrar uma taxa de conversão direta BRL/USDT na Binance. Tentando via USD.");
        }

        const allExchangeNames: ExchangeName[] = ['Binance', 'Bybit', 'KuCoin', 'Coinbase'];
        const prices: GetCryptoPricesOutput = [];
        const addedExchanges = new Set<ExchangeName>();

        for (const exchangeName of allExchangeNames) {
            // Tenta encontrar um par direto com BRL primeiro
            const brlTicker = data.tickers.find(
                (ticker: any) => ticker.target === 'BRL' && mapExchangeName(ticker.market.name) === exchangeName
            );

            if (brlTicker && brlTicker.converted_last?.brl) {
                if (!addedExchanges.has(exchangeName)) {
                    prices.push({
                        name: exchangeName,
                        buyPrice: brlTicker.converted_last.brl,
                    });
                    addedExchanges.add(exchangeName);
                }
            } else if (usdtToBrlRate) {
                // Se não houver par BRL, tenta encontrar um par com USD e faz a conversão
                const usdTicker = data.tickers.find(
                    (ticker: any) => ticker.target === 'USD' && mapExchangeName(ticker.market.name) === exchangeName
                );

                if (usdTicker && usdTicker.converted_last?.usd) {
                     if (!addedExchanges.has(exchangeName)) {
                        prices.push({
                            name: exchangeName,
                            buyPrice: usdTicker.converted_last.usd * usdtToBrlRate,
                        });
                        addedExchanges.add(exchangeName);
                    }
                } else {
                     console.warn(`Não foi possível encontrar um preço BRL ou USD para ${exchangeName} na CoinGecko.`);
                }
            } else {
                // Caso em que nem a taxa BRL direta nem a taxa de conversão BRL/USD foram encontradas
                console.error(`Não foi possível obter a cotação para ${exchangeName} devido à falta da taxa de conversão para BRL.`);
            }
        }

        if (prices.length === 0) {
            console.error("Não foi possível obter nenhuma cotação de nenhuma exchange.");
        }

        return prices;
    } catch (error) {
        console.error('Erro ao buscar ou processar preços de criptomoedas:', error);
        return [];
    }
}
