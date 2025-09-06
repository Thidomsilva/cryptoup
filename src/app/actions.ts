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
        // Usaremos a API da CoinGecko, um popular agregador de dados de criptomoedas gratuito.
        // Estamos buscando os tickers do Tether (USDT).
        const response = await fetch('https://api.coingecko.com/api/v3/coins/tether/tickers');
        
        if (!response.ok) {
            console.error('Falha ao buscar da API CoinGecko:', response.status, response.statusText);
            // Fallback para evitar que o aplicativo quebre, embora em um cenário real,
            // pudéssemos querer um tratamento de erro mais robusto ou um mecanismo de nova tentativa.
            return [];
        }

        const data = await response.json();

        // Encontra um ticker de referência para a conversão BRL/USD, se necessário.
        const usdtToBrlRate = data.tickers.find(
            (ticker: any) => ticker.target === 'BRL' && ticker.market.name.toLowerCase().includes('binance')
        )?.converted_last?.brl;
        
        if (!usdtToBrlRate) {
            console.error("Não foi possível encontrar uma taxa de conversão de BRL. Usando um valor padrão.");
             // Se não encontrarmos uma taxa, não podemos continuar com a conversão de USD.
        }

        const allExchangeNames: ExchangeName[] = ['Binance', 'Bybit', 'KuCoin', 'Coinbase'];
        const prices: GetCryptoPricesOutput = [];
        const addedExchanges = new Set<ExchangeName>();

        for (const exchangeName of allExchangeNames) {
            // Tenta encontrar um par direto com BRL primeiro
            const brlTicker = data.tickers.find(
                (ticker: any) => ticker.target === 'BRL' && mapExchangeName(ticker.market.name) === exchangeName
            );

            if (brlTicker) {
                if (!addedExchanges.has(exchangeName)) {
                    prices.push({
                        name: exchangeName,
                        // 'converted_last' fornece o preço na moeda de destino (BRL)
                        buyPrice: brlTicker.converted_last.brl,
                    });
                    addedExchanges.add(exchangeName);
                }
            } else if (usdtToBrlRate) {
                // Se não houver par BRL, tenta encontrar um par com USD e faz a conversão
                const usdTicker = data.tickers.find(
                    (ticker: any) => ticker.target === 'USD' && mapExchangeName(ticker.market.name) === exchangeName
                );

                if (usdTicker) {
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
            }
        }

        return prices;
    } catch (error) {
        console.error('Erro ao buscar ou processar preços de criptomoedas:', error);
        // Retorna um array vazio ou trata o erro conforme apropriado
        return [];
    }
}
