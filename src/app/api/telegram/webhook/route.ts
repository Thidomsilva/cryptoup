
import { NextRequest, NextResponse } from 'next/server';
const TelegramBot = require('node-telegram-bot-api');
import type { Update } from 'node-telegram-bot-api';
import { getUsdtBrlPrices, runSimulation } from '@/app/actions';
import type { Exchange, SimulationResult, ExchangeDetails } from '@/lib/types';
import { BinanceIcon } from '@/components/icons/binance-icon';
import { BybitIcon } from '@/components/icons/bybit-icon';
import { KucoinIcon } from '@/components/icons/kucoin-icon';
import { CoinbaseIcon } from '@/components/icons/coinbase-icon';

// --- Configuração ---
const token = process.env.TELEGRAM_BOT_TOKEN;
const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/telegram/webhook`;
const CHANNEL_ID = '@upsurechanel'; // ID do canal de destino

const EXCHANGES: ExchangeDetails[] = [
    { name: 'Binance', fee: 0.001, icon: BinanceIcon },
    { name: 'Bybit', fee: 0.001, icon: BybitIcon },
    { name: 'KuCoin', fee: 0.001, icon: KucoinIcon },
    { name: 'Coinbase', fee: 0.005, icon: CoinbaseIcon },
];

let picnicPrice = 5.25; // Preço padrão, pode ser sobreposto pelo comando /setpicnic

// --- Funções de Formatação ---
async function formatResults(bot: any, results: SimulationResult[], amount: number, currentPicnicPrice: number): Promise<string> {
    if (!results.length) {
        return "Não foi possível obter os resultados da simulação. Tente novamente mais tarde.";
    }

    const successfulResults = results.filter(r => typeof r.buyPrice === 'number' && r.profit !== null);

    const bestResult = successfulResults.length > 0 ? successfulResults
        .filter(r => r.profit! > 0)
        .reduce((max, current) => ((current.profit ?? -Infinity) > (max.profit ?? -Infinity) ? current : max), null) : null;

    let message = `*Simulação de Arbitragem para ${amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}*\n`;
    message += `_Preço de venda Picnic: ${currentPicnicPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}_\n\n`;

    results.forEach(result => {
        if (typeof result.buyPrice !== 'number') {
             message += `*${result.exchangeName}*\n`;
             message += `  - 🟥 *Falha na Cotação:*\n`;
             message += `  \`\`\`\n  ${result.buyPrice || 'Nenhuma resposta da API.'}\n  \`\`\`\n\n`;
             return;
        }

        const isBest = bestResult && result.exchangeName === bestResult.exchangeName;
        const profitIcon = result.profit! > 0 ? '🟢' : '🔴';

        message += `*${result.exchangeName}* ${isBest ? '⭐️ *Melhor Opção*' : ''}\n`;
        message += `  - Compra USDT por: ${ result.buyPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })  }\n`;
        message += `  - USDT Recebido: ${result.usdtAmount!.toFixed(4)}\n`;
        message += `  - Lucro/Prejuízo: ${profitIcon} *${result.profit!.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}* (${result.profitPercentage!.toFixed(2)}%)\n\n`;
    });
    
    try {
        const me = await bot.getMe();
        message += `_Análise feita por @${me.username || 'braitsure_bot'}_`;
    } catch {
        message += `_Análise feita por @braitsure_bot_`;
    }

    return message;
}

// --- Handler do Webhook ---
export async function POST(request: NextRequest) {
    if (!token) {
        console.error('O token do Telegram não foi configurado.');
        return NextResponse.json({ status: 'error', message: 'Bot token not configured' }, { status: 500 });
    }

    try {
        const bot = new TelegramBot(token);
        const body: Update = await request.json();

        if (body.message) {
            const { text, chat: { id: chatId } } = body.message;

            if (text) {
                const startHelpRegex = /\/(start|help)/;
                const cotapRegex = /\/cotap (.+)/;
                const setPicnicRegex = /\/setpicnic (.+)/;

                if (startHelpRegex.test(text)) {
                    const helpMessage = `
*Bem-vindo ao Bot de Simulação de Arbitragem USDT/BRL!*

Você pode usar os comandos em um chat privado comigo ou em um grupo onde eu fui adicionado. A análise será sempre postada no canal ${CHANNEL_ID}.

*Comandos disponíveis:*
- \`/cotap <valor>\`: Simula a operação. A resposta será enviada no chat onde o comando foi executado e também postada no canal.
  _Exemplo: \`/cotap 5000\`_
  
- \`/setpicnic <preço>\`: Define o preço de venda do USDT na Picnic para as simulações. Este valor é temporário e resetado a cada reinicialização do servidor.
  _Exemplo: \`/setpicnic 5.28\`_

- \`/help\`: Mostra esta mensagem de ajuda.
    `;
                    await bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
                } else if (cotapRegex.test(text)) {
                    const match = text.match(cotapRegex);
                    const amountStr = match ? match[1] : null;

                    if (!amountStr) {
                        await bot.sendMessage(chatId, "Comando inválido. Use o formato: `/cotap <valor>`");
                        return NextResponse.json({ status: 'ok' });
                    }
                    
                    const amount = parseFloat(amountStr);

                    if (isNaN(amount) || amount <= 0) {
                        await bot.sendMessage(chatId, "Valor inválido. Use, por exemplo: `/cotap 5000`");
                        return NextResponse.json({ status: 'ok' });
                    }

                    await bot.sendMessage(chatId, `🔍 Analisando cotações para *${amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}*... Por favor, aguarde.`, { parse_mode: 'Markdown' });

                    try {
                        const prices = await getUsdtBrlPrices();
                        
                        const exchangeRates: Exchange[] = prices.map(price => {
                            const details = EXCHANGES.find(e => e.name === price.name);
                            return details ? { ...details, buyPrice: price.buyPrice } : null;
                        }).filter((e): e is Exchange => e !== null);

                        const results = await runSimulation(amount, exchangeRates, picnicPrice);
                        const responseMessage = await formatResults(bot, results, amount, picnicPrice);
                        
                        // Enviar resposta no chat atual
                        await bot.sendMessage(chatId, responseMessage, { parse_mode: 'Markdown', disable_web_page_preview: true });
                        
                        // Postar no canal se houver pelo menos um sucesso e se o comando não veio do próprio canal
                        const hasSuccess = results.some(r => typeof r.buyPrice === 'number');
                        const channelChat = await bot.getChat(CHANNEL_ID).catch(() => null);
                        if (hasSuccess && channelChat && String(chatId) !== String(channelChat.id)) {
                             await bot.sendMessage(CHANNEL_ID, responseMessage, { parse_mode: 'Markdown', disable_web_page_preview: true });
                        }

                    } catch (error) {
                        console.error("Erro ao processar /cotap:", error);
                        const errorMsg = "❌ *Erro crítico na Simulação.*\n\nOcorreu uma falha inesperada ao processar sua solicitação. A equipe de desenvolvimento já foi notificada.";
                        await bot.sendMessage(chatId, errorMsg, { parse_mode: 'Markdown' });
                    }
                } else if (setPicnicRegex.test(text)) {
                    const match = text.match(setPicnicRegex);
                    const priceStr = match ? match[1] : null;

                    if (!priceStr) {
                        await bot.sendMessage(chatId, "Comando inválido. Use o formato: `/setpicnic <preço>`");
                        return NextResponse.json({ status: 'ok' });
                    }

                    const price = parseFloat(priceStr);

                     if (isNaN(price) || price <= 0) {
                        await bot.sendMessage(chatId, "Preço inválido. Use, por exemplo: `/setpicnic 5.28`");
                        return NextResponse.json({ status: 'ok' });
                    }
                    picnicPrice = price; // Atualiza o preço globalmente (enquanto o servidor estiver ativo)
                    const successMsg = `✅ Preço de venda na Picnic *temporariamente* atualizado para *${price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}*.`;
                    await bot.sendMessage(chatId, successMsg, { parse_mode: 'Markdown' });
                }
            }
        }
        
        return NextResponse.json({ status: 'ok' });

    } catch (error) {
        console.error('Erro no corpo do webhook:', error);
        return NextResponse.json({ status: 'error', message: 'Invalid request body' }, { status: 400 });
    }
}


// Rota GET para registrar o webhook (chame isso uma vez APÓS o deploy)
export async function GET() {
    if (!token || !process.env.NEXT_PUBLIC_APP_URL) {
        return NextResponse.json({ 
            success: false, 
            message: 'BOT_TOKEN ou NEXT_PUBLIC_APP_URL não configurados no ambiente.' 
        }, { status: 500 });
    }
    const bot = new TelegramBot(token);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    const finalWebhookUrl = `${appUrl}/api/telegram/webhook`;
    
    try {
        // Registra o webhook
        await bot.setWebHook(finalWebhookUrl);
        
        // Registra os comandos
        await bot.setMyCommands([
            { command: 'cotap', description: 'Simula arbitragem (ex: /cotap 5000)' },
            { command: 'setpicnic', description: 'Define o preço de venda da Picnic (ex: /setpicnic 5.28)' },
            { command: 'help', description: 'Mostra esta mensagem de ajuda' },
        ]);

        return NextResponse.json({ 
            success: true, 
            message: `Webhook configurado com sucesso. O Telegram agora enviará atualizações para ${finalWebhookUrl}. Comandos também foram registrados.` 
        });
    } catch (error) {
        console.error('Error setting webhook:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
        return NextResponse.json({ 
            success: false, 
            message: 'Falha ao configurar o webhook.', 
            error: errorMessage 
        }, { status: 500 });
    }
}
