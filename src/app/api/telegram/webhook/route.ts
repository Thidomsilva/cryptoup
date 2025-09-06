
import { NextRequest, NextResponse } from 'next/server';
import TelegramBot, { Update } from 'node-telegram-bot-api';
import { getUsdtBrlPrices, runSimulation } from '@/app/actions';
import type { Exchange, SimulationResult, ExchangeDetails } from '@/lib/types';
import { BinanceIcon } from '@/components/icons/binance-icon';
import { BybitIcon } from '@/components/icons/bybit-icon';
import { KucoinIcon } from '@/components/icons/kucoin-icon';
import { CoinbaseIcon } from '@/components/icons/coinbase-icon';

// --- Configuração ---
const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
    throw new Error('O token do Telegram não foi configurado. Por favor, defina TELEGRAM_BOT_TOKEN no seu .env');
}

const bot = new TelegramBot(token);
const CHANNEL_ID = '@upsurechanel'; // ID do canal de destino

const EXCHANGES: ExchangeDetails[] = [
    { name: 'Binance', fee: 0.001, icon: BinanceIcon },
    { name: 'Bybit', fee: 0.001, icon: BybitIcon },
    { name: 'KuCoin', fee: 0.001, icon: KucoinIcon },
    { name: 'Coinbase', fee: 0.005, icon: CoinbaseIcon },
];

let picnicPrice = 5.25; // Preço padrão, pode ser alterado por comando

// --- Funções de Formatação ---
async function formatResults(results: SimulationResult[], amount: number, currentPicnicPrice: number): Promise<string> {
    if (!results.length) {
        return "Não foi possível obter os resultados da simulação. Tente novamente mais tarde.";
    }

    const bestResult = results
        .filter(r => r.profit !== null)
        .reduce((max, current) => ((current.profit ?? -Infinity) > (max.profit ?? -Infinity) ? current : max), results[0]);

    let message = `*Simulação de Arbitragem para ${amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}*\n`;
    message += `_Preço de venda Picnic: ${currentPicnicPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}_\n\n`;

    results.forEach(result => {
        if (result.buyPrice === null || result.profit === null) {
             message += `*${result.exchangeName}*\n`;
             message += `  - Cotação não encontrada.\n\n`;
             return;
        }

        const isBest = result.exchangeName === bestResult.exchangeName && bestResult.profit! > 0;
        const profitIcon = result.profit > 0 ? '🟢' : '🔴';

        message += `*${result.exchangeName}* ${isBest ? '⭐️ *Melhor Opção*' : ''}\n`;
        message += `  - Compra USDT por: ${ result.buyPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })  }\n`;
        message += `  - USDT Recebido: ${result.usdtAmount!.toFixed(4)}\n`;
        message += `  - Lucro/Prejuízo: ${profitIcon} *${result.profit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}* (${result.profitPercentage!.toFixed(2)}%)\n\n`;
    });
    
    try {
        const me = await bot.getMe();
        message += `_Análise feita por @${me.username || 'braitsure_bot'}_`;
    } catch {
        message += `_Análise feita por @braitsure_bot_`;
    }

    return message;
}

// --- Comandos do Bot ---
bot.onText(/\/(start|help)/, async (msg) => {
    const chatId = msg.chat.id;
    const helpMessage = `
*Bem-vindo ao Bot de Simulação de Arbitragem USDT/BRL!*

Você pode usar os comandos em um chat privado comigo ou em um grupo onde eu fui adicionado. A análise será sempre postada no canal ${CHANNEL_ID}.

*Comandos disponíveis:*
- \`/cotap <valor>\`: Simula a operação. A resposta será enviada no chat onde o comando foi executado e também postada no canal.
  _Exemplo: \`/cotap 5000\`_
  
- \`/setpicnic <preço>\`: Define o preço de venda do USDT na Picnic para as simulações.
  _Exemplo: \`/setpicnic 5.28\`_

- \`/help\`: Mostra esta mensagem de ajuda.
    `;
    await bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});

bot.onText(/\/cotap (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!match || !match[1]) {
        await bot.sendMessage(chatId, "Comando inválido. Use o formato: `/cotap <valor>`");
        return;
    }
    
    const amount = parseFloat(match[1]);

    if (isNaN(amount) || amount <= 0) {
        await bot.sendMessage(chatId, "Valor inválido. Use, por exemplo: `/cotap 5000`");
        return;
    }

    await bot.sendMessage(chatId, `🔍 Buscando cotações para ${amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}...`);

    try {
        const prices = await getUsdtBrlPrices();
        if (!prices || prices.length === 0) {
            throw new Error("Could not fetch prices");
        }
        
        const exchangeRates: Exchange[] = prices.map(price => {
            const details = EXCHANGES.find(e => e.name === price.name);
            return details ? { ...details, buyPrice: price.buyPrice } : null;
        }).filter((e): e is Exchange => e !== null);

        const results = await runSimulation(amount, exchangeRates, picnicPrice);
        const responseMessage = await formatResults(results, amount, picnicPrice);
        
        // Responde no chat de origem
        await bot.sendMessage(chatId, responseMessage, { parse_mode: 'Markdown' });
        
        // Posta no canal, se o comando não foi enviado do próprio canal
        const channelChat = await bot.getChat(CHANNEL_ID).catch(() => null);
        if (channelChat && chatId !== channelChat.id) {
             await bot.sendMessage(CHANNEL_ID, responseMessage, { parse_mode: 'Markdown' });
        }

    } catch (error) {
        console.error("Erro ao processar /cotap:", error);
        const errorMsg = "❌ Erro: Não foi possível buscar as cotações. As APIs podem estar indisponíveis. Tente novamente mais tarde.";
        await bot.sendMessage(chatId, errorMsg);
    }
});


bot.onText(/\/setpicnic (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!match || !match[1]) {
        await bot.sendMessage(chatId, "Comando inválido. Use o formato: `/setpicnic <preço>`");
        return;
    }

    const price = parseFloat(match[1]);

     if (isNaN(price) || price <= 0) {
        await bot.sendMessage(chatId, "Preço inválido. Use, por exemplo: `/setpicnic 5.28`");
        return;
    }
    picnicPrice = price;
    const successMsg = `✅ Preço de venda na Picnic atualizado para *${price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}*.`;
    await bot.sendMessage(chatId, successMsg, { parse_mode: 'Markdown' });
});


// --- Handler do Webhook ---
export async function POST(request: NextRequest) {
    try {
        const body: Update = await request.json();
        bot.processUpdate(body);
        return NextResponse.json({ status: 'ok' });
    } catch (error) {
        console.error('Erro no webhook do Telegram:', error);
        return NextResponse.json({ status: 'error', message: 'Internal server error' });
    }
}


// Rota GET para registrar o webhook (chame isso uma vez)
export async function GET(request: NextRequest) {
    try {
        const host = request.headers.get('host');
        if (!host) {
            throw new Error('Não foi possível determinar a URL do host a partir da requisição.');
        }

        // Use 'https' para produção, mas permita 'http' para localhost
        const protocol = host.includes('localhost') ? 'http' : 'https';
        const webhookUrl = `${protocol}://${host}/api/telegram/webhook`;
        
        // Registra o Webhook
        await bot.setWebHook(webhookUrl);
        
        // Registra os comandos no Telegram
        await bot.setMyCommands([
            { command: 'cotap', description: 'Simula arbitragem (ex: /cotap 5000)' },
            { command: 'setpicnic', description: 'Define o preço de venda da Picnic (ex: /setpicnic 5.28)' },
            { command: 'help', description: 'Mostra esta mensagem de ajuda' },
        ]);

        return NextResponse.json({ 
            success: true, 
            message: `Webhook configurado com sucesso para ${webhookUrl} e comandos registrados.` 
        });
    } catch (error) {
        console.error('Erro ao configurar o webhook:', error);
        const errorMessage = error instanceof Error ? error.message : 'Um erro desconhecido ocorreu.';
        return NextResponse.json({ success: false, message: 'Falha ao configurar o webhook.', error: errorMessage }, { status: 500 });
    }
}
