# **App Name**: USDT Arbitrage Bot

## Core Features:

- Currency Conversion: Convert BRL to USDT based on exchange rates from Binance, Bybit, KuCoin, and Coinbase.
- Arbitrage Simulation: Simulate selling USDT on Picnic based on a user-defined or default price to calculate potential profit or loss. Applies configurable fees.
- Command Processing: Process the `/cotap <valor_em_reais>` command to initiate arbitrage simulations. Also supports `/setpicnic <preco_brl_por_usdt>` to set Picnic exchange rate.
- Profit/Loss Display: Display profit or loss in BRL and percentage for each exchange, using green (positive) and red (negative) icons. 
- Best Route Highlighting: Automatically highlight the most profitable arbitrage route across exchanges (if a positive spread exists).
- Input Validation: Validate user input for the `/cotap` command, ensuring a valid numerical value is provided; returns an instructional message for invalid inputs.

## Style Guidelines:

- Primary color: Strong blue (#29ABE2) to convey trust and reliability in financial calculations.
- Background color: Very light blue (#E5F5F9) for a clean, professional interface.
- Accent color: Light green (#90EE90) for positive indicators, and bright red (#FF0000) for negative indicators to provide clear visual feedback.
- Body font: 'PT Sans', a clear, modern sans-serif, for body text and labels.
- Headline font: 'Space Grotesk', a modern sans-serif, for headlines to give a technical feel to the information displayed
- Use simple, recognizable icons for exchanges (Binance, Bybit, etc.) and profit/loss indicators (green up arrow, red down arrow).
- Present arbitrage data in a clear, tabular format with key metrics (exchange rate, profit/loss) easily accessible.