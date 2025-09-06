"use client";

import type { FC } from "react";
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowUpCircle, ArrowDownCircle, Bot, Terminal, ChevronRight } from 'lucide-react';
import type { Exchange, SimulationResult, ExchangeDetails, GetCryptoPricesOutput } from '@/lib/types';
import { BinanceIcon } from './icons/binance-icon';
import { BybitIcon } from './icons/bybit-icon';
import { KucoinIcon } from './icons/kucoin-icon';
import { CoinbaseIcon } from './icons/coinbase-icon';
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { getUsdtBrlPrices } from "@/app/actions";

const EXCHANGES: ExchangeDetails[] = [
    { name: 'Binance', fee: 0.001, icon: BinanceIcon },
    { name: 'Bybit', fee: 0.001, icon: BybitIcon },
    { name: 'KuCoin', fee: 0.001, icon: KucoinIcon },
    { name: 'Coinbase', fee: 0.005, icon: CoinbaseIcon },
];

const PICNIC_SELL_FEE = 0.002;

const ResultsDisplay: FC<{ results: SimulationResult[] }> = ({ results }) => {
    if (results.length === 0) return null;

    const bestResult = results.reduce((max, current) => (current.profit > max.profit ? current : max), results[0]);

    return (
        <div className="mt-4">
            <h3 className="font-headline text-lg mb-4">Simulation Results</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {results.map((result, index) => {
                    const isBest = result.exchangeName === bestResult.exchangeName && bestResult.profit > 0;
                    const profitColor = result.profit > 0 ? 'text-green-500' : 'text-red-600';
                    const ProfitIcon = result.profit > 0 ? ArrowUpCircle : ArrowDownCircle;

                    return (
                        <Card key={index} className={`flex flex-col ${isBest ? 'border-primary shadow-lg' : ''}`}>
                            <CardHeader>
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-3">
                                        <result.icon className="w-8 h-8" />
                                        <CardTitle className="font-headline">{result.exchangeName}</CardTitle>
                                    </div>
                                    {isBest && <Badge variant="default">Best Option</Badge>}
                                </div>
                            </CardHeader>
                            <CardContent className="flex-grow grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                <span className="text-muted-foreground">Invested BRL:</span>
                                <span className="text-right font-mono">{result.initialBRL.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                                
                                <span className="text-muted-foreground">Received USDT:</span>
                                <span className="text-right font-mono">{result.usdtAmount.toFixed(4)}</span>

                                <span className="text-muted-foreground">Final BRL:</span>
                                <span className="text-right font-mono">{result.finalBRL.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                            </CardContent>
                            <CardFooter className="mt-auto">
                                <div className={`flex items-center gap-2 font-bold text-base ${profitColor}`}>
                                    <ProfitIcon className="w-5 h-5" />
                                    <span>
                                        {result.profit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                        <span className="ml-2 font-mono">({result.profitPercentage.toFixed(2)}%)</span>
                                    </span>
                                </div>
                            </CardFooter>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
};

const LoadingSkeleton: FC = () => (
    <div className="mt-4">
        <h3 className="font-headline text-lg mb-4">
             <Skeleton className="h-6 w-48" />
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
                <Card key={i}>
                    <CardHeader>
                        <div className="flex justify-between items-start">
                            <div className="flex items-center gap-3">
                                <Skeleton className="w-8 h-8 rounded-full" />
                                <Skeleton className="h-6 w-24" />
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-4 w-20 ml-auto" />
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 w-16 ml-auto" />
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-4 w-24 ml-auto" />
                    </CardContent>
                     <CardFooter>
                         <Skeleton className="h-6 w-40" />
                    </CardFooter>
                </Card>
            ))}
        </div>
    </div>
);


export default function ArbitrageSimulator() {
    const [history, setHistory] = useState<Array<{ id: number; component: React.ReactNode }>>([]);
    const [inputValue, setInputValue] = useState('');
    const [picnicPrice, setPicnicPrice] = useState(5.25);
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    

    const addHistory = useCallback((component: React.ReactNode) => {
        setHistory(prev => [...prev, { id: Date.now() + Math.random(), component }]);
    }, []);

    const runCotaP = useCallback(async (amountStr: string) => {
        const amount = parseFloat(amountStr);
        if (isNaN(amount) || amount <= 0) {
            toast({
                variant: "destructive",
                title: "Invalid Value",
                description: "Please provide a positive number for /cotap. Example: /cotap 5000",
            });
            return;
        }

        setIsLoading(true);
        addHistory(<LoadingSkeleton />);

        try {
            const prices = await getUsdtBrlPrices();

            if (!prices || prices.length === 0) {
                 throw new Error("Could not fetch prices");
            }

            const exchangeDataMap = new Map(EXCHANGES.map(e => [e.name, e]));

            const exchangeRates: Exchange[] = prices.map(price => {
                const details = exchangeDataMap.get(price.name);
                if (!details) {
                    // Silently ignore exchanges we don't have details for
                    return null;
                }
                return { ...details, buyPrice: price.buyPrice };
            }).filter((e): e is Exchange => e !== null);

            const results: SimulationResult[] = exchangeRates.map(exchange => {
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
                };
            });
            
            setHistory(prev => prev.slice(0, -1)); // Remove skeleton
            addHistory(<ResultsDisplay results={results} />);
        } catch(error) {
             setHistory(prev => prev.slice(0, -1)); // Remove skeleton
             toast({
                variant: "destructive",
                title: "Error fetching prices",
                description: "Could not fetch real-time crypto prices. Please try again later.",
            });
             console.error(error);
        } finally {
            setIsLoading(false);
        }

    }, [picnicPrice, addHistory, toast]);

    const runSetPicnic = useCallback((priceStr: string) => {
        const price = parseFloat(priceStr);
        if (isNaN(price) || price <= 0) {
            toast({
                variant: "destructive",
                title: "Invalid Price",
                description: "Please provide a positive number for the Picnic price. Example: /setpicnic 5.28",
            });
            return;
        }
        setPicnicPrice(price);
        addHistory(
            <p className="text-green-500">
                ✅ Picnic sell price updated to {price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.
            </p>
        );
    }, [addHistory, toast]);

    const runHelp = useCallback(() => {
        addHistory(
            <div className="space-y-2 text-sm">
                <p className="font-bold font-headline">Available Commands:</p>
                <p><code className="font-mono bg-muted p-1 rounded-md">/cotap &lt;amount&gt;</code> - Simulates an arbitrage operation with the given BRL amount.</p>
                <p><code className="font-mono bg-muted p-1 rounded-md">/setpicnic &lt;price&gt;</code> - Sets the USDT sell price on Picnic.</p>
                <p><code className="font-mono bg-muted p-1 rounded-md">/clear</code> - Clears the command history.</p>
                <p><code className="font-mono bg-muted p-1 rounded-md">/help</code> - Shows this help message.</p>
            </div>
        );
    }, [addHistory]);

    const processCommand = useCallback((command: string) => {
        addHistory(
            <div className="flex items-center">
                <ChevronRight className="w-4 h-4 text-primary" />
                <p className="font-mono">{command}</p>
            </div>
        );

        const [cmd, ...args] = command.trim().split(/\s+/);

        switch (cmd.toLowerCase()) {
            case '/cotap':
                runCotaP(args[0]);
                break;
            case '/setpicnic':
                runSetPicnic(args[0]);
                break;
            case '/help':
                runHelp();
                break;
            case '/clear':
                setHistory([]);
                break;
            default:
                addHistory(<p className="text-red-500">Command not found: "{cmd}". Type /help for a list of commands.</p>);
        }
    }, [addHistory, runCotaP, runSetPicnic, runHelp]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue.trim() || isLoading) return;
        processCommand(inputValue);
        setInputValue('');
    };

    useEffect(() => {
        if (history.length === 0) {
            addHistory(
                <div className="flex items-start gap-3">
                    <Bot className="w-8 h-8 text-primary flex-shrink-0 mt-1" />
                    <div>
                        <p className="font-bold font-headline">Welcome to the USDT/BRL Arbitrage Bot!</p>
                        <p className="text-sm text-muted-foreground">
                            Type <code className="font-mono bg-muted px-1 py-0.5 rounded-md">/help</code> to see available commands. The current Picnic sell price is {picnicPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.
                        </p>
                    </div>
                </div>
            );
        }
    }, [addHistory, picnicPrice, history.length]);

    useEffect(() => {
        if (scrollAreaRef.current) {
            scrollAreaRef.current.scrollTo({
                top: scrollAreaRef.current.scrollHeight,
                behavior: 'smooth'
            });
        }
    }, [history]);
    

    return (
        <Card className="w-full max-w-4xl shadow-2xl bg-card/80 backdrop-blur-sm">
            <CardHeader>
                <div className="flex items-center gap-3">
                    <Terminal className="w-8 h-8 text-primary" />
                    <div>
                        <CardTitle className="font-headline text-2xl">Arbitrage Bot Simulator</CardTitle>
                        <CardDescription>Enter commands to simulate USDT/BRL arbitrage.</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-[50vh] w-full rounded-md border p-4" ref={scrollAreaRef}>
                    <div className="flex flex-col gap-4">
                        {history.map(item => (
                            <div key={item.id}>{item.component}</div>
                        ))}
                    </div>
                </ScrollArea>
                <form onSubmit={handleSubmit} className="mt-4">
                    <div className="relative">
                        <ChevronRight className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                        <Input
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            placeholder="Type a command... (e.g., /cotap 5000)"
                            className="pl-10 font-mono"
                            disabled={isLoading}
                            aria-label="Command input"
                        />
                        <Button type="submit" className="absolute right-1 top-1/2 -translate-y-1/2 h-8" disabled={isLoading}>
                            Send
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
}
