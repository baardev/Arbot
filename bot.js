process.removeAllListeners('warning');
process.env.NODE_NO_WARNINGS = '1';
require('dotenv').config();

const Web3 = require('web3');
const ethers = require('ethers');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

const LOG_LEVELS = {
    'error': 0,
    'warn': 1,
    'info': 2,
    'debug': 3
};

// Simple argument parser
function parseArgs() {
    const args = process.argv.slice(2);
    let logLevel = 'info'; // default
    let liveTrading = false; // default to test mode

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--log-level' || args[i] === '-l') {
            logLevel = args[i + 1];
        }
        if (args[i] === '--live' || args[i] === '-x') {
            liveTrading = true;
        }
    }

    // Validate log level
    if (!LOG_LEVELS.hasOwnProperty(logLevel)) {
        console.warn(`Invalid log level: ${logLevel}. Using 'info'`);
        logLevel = 'info';
    }

    return { logLevel, liveTrading };
}

// Get command line arguments
const args = parseArgs();

process.on('unhandledRejection', (error, promise) => {
    console.log('⚠️ Unhandled Promise Rejection:', {
        error: error.message,
        stack: error.stack
    });
});

process.on('uncaughtException', (error) => {
    console.log('⚠️ Uncaught Exception:', {
        error: error.message,
        stack: error.stack
    });
});

class ArbitrageScanner {
    constructor(config) {
        this.config = config;
        this.currentLogLevel = LOG_LEVELS[args.logLevel];
        this.liveTrading = args.liveTrading;

        // Add prominent mode display
        console.log('\n' + '='.repeat(80));
        console.log(`🤖 Bot running in ${this.liveTrading ? '\x1b[31mLIVE TRADING MODE\x1b[0m' : '\x1b[32mTEST MODE\x1b[0m'}`);
        if (this.liveTrading) {
            console.log('\x1b[31m⚠️  WARNING: Live trading is enabled - Real transactions will be executed!\x1b[0m');
        } else {
            console.log('\x1b[32m✓ Test mode - No real transactions will be executed\x1b[0m');
        }
        console.log('='.repeat(80) + '\n');

        this.colors = {
            reset: '\x1b[0m',
            red: '\x1b[31m',
            green: '\x1b[32m',
            yellow: '\x1b[33m',
            blue: '\x1b[34m',
            magenta: '\x1b[35m',
            cyan: '\x1b[36m',
            white: '\x1b[37m',
            brightRed: '\x1b[91m',
            brightGreen: '\x1b[92m',
            brightYellow: '\x1b[93m',
            brightBlue: '\x1b[94m',
            brightMagenta: '\x1b[95m',
            brightCyan: '\x1b[96m',
            brightWhite: '\x1b[97m'
        };

        this.log = (message, level = 'info', context = '') => {
            // Check if we should log this message based on current log level
            if (LOG_LEVELS[level.toLowerCase()] > this.currentLogLevel) {
                return;
            }

            const timestamp = new Date().toISOString();
            const logMessage = `[${timestamp}] [${level.toUpperCase()}] [${context}] ${message}`;

            switch (level.toLowerCase()) {
                case 'error':
                    console.error('\x1b[31m%s\x1b[0m', logMessage);  // Red
                    break;
                case 'warn':
                    console.warn('\x1b[33m%s\x1b[0m', logMessage);   // Yellow
                    break;
                case 'success':
                    console.log('\x1b[32m%s\x1b[0m', logMessage);    // Green
                    break;
                case 'info':
                    console.log('\x1b[36m%s\x1b[0m', logMessage);    // Cyan
                    break;
                case 'debug':
                    console.log('\x1b[90m%s\x1b[0m', logMessage);    // Gray
                    break;
                default:
                    console.log(logMessage);
            }

            if (this.logFile) {
                const fs = require('fs');
                const cleanMessage = `[${timestamp}] [${level.toUpperCase()}] ${context ? `[${context}] ` : ''}${message}`;
                fs.appendFileSync(this.logFile, cleanMessage + '\n');
            }

            if (level.toLowerCase() === 'error') {
                console.error(`[FATAL] Exiting due to error in ${context}: ${message}`);
                process.exit(1);
            }
        };

        try {
            const configPath = path.join(__dirname, 'config.yaml');
            if (!fs.existsSync(configPath)) {
                this.log('config.yaml not found', 'error', 'constructor');
                process.exit(1);
            }

            this.config = yaml.load(fs.readFileSync(configPath, 'utf8'));

            if (!this.config.addresses || !this.config.dexes || !this.config.tradingPairs) {
                this.log('Missing required configuration sections', 'error', 'constructor');
                process.exit(1);
            }

            this.ADDRESSES = this.config.addresses;
            this.log('Contract addresses loaded from config.yaml', 'success', 'constructor');

            this.DEX_ROUTERS = this.config.dexes.routers;
            this.DEX_FACTORIES = this.config.dexes.factories;
            this.log('DEX configurations loaded from config.yaml', 'success', 'constructor');

            this.MIN_PROFIT_THRESHOLD = this.config.tradingParameters.minProfitThreshold;
            this.SCAN_INTERVAL = this.config.tradingParameters.scanIntervalMs;
            this.GAS_LIMIT = this.config.tradingParameters.gasLimit;
            this.log('Trading parameters loaded from config.yaml', 'success', 'constructor');

            this.provider = new ethers.providers.JsonRpcProvider(
                process.env.RPC_URL || 'https://polygon-rpc.com'
            );

            if (!process.env.PRIVATE_KEY) {
                this.log('No private key found in .env', 'error', 'constructor');
                process.exit(1);
            }

            this.signer = new ethers.Wallet(process.env.PRIVATE_KEY, this.provider);
            this.log('Provider and signer initialized successfully', 'success', 'constructor');

        } catch (error) {
            this.log(`Failed to initialize: ${error.message}`, 'error', 'constructor');
            process.exit(1);
        }

        try {
            const fs = require('fs');
            const path = require('path');

            const configPath = path.join(__dirname, 'config.yaml');
            if (fs.existsSync(configPath)) {
                this.config = yaml.load(fs.readFileSync(configPath, 'utf8'));
                this.log('Configuration loaded successfully', 'success', 'constructor');
            } else {
                this.log('config.yaml not found, using default configuration', 'warning', 'constructor');
                this.config = {
                    tradingPairs: [
                        {
                            name: 'WETH/USDC',
                            token0Address: this.ADDRESSES.WETH,
                            token1Address: this.ADDRESSES.USDC,
                            token0Symbol: 'WETH',
                            token1Symbol: 'USDC',
                            token0Decimals: 18,
                            token1Decimals: 6
                        }
                    ]
                };
            }
        } catch (error) {
            this.log(`Error loading config.yaml: ${error.message}, using default configuration`, 'warning', 'constructor');
            this.config = {
                tradingPairs: [
                    {
                        name: 'WETH/USDC',
                        token0Address: this.ADDRESSES.WETH,
                        token1Address: this.ADDRESSES.USDC,
                        token0Symbol: 'WETH',
                        token1Symbol: 'USDC',
                        token0Decimals: 18,
                        token1Decimals: 6
                    }
                ]
            };
        }

        // Gas price thresholds (in gwei)
        this.gasThresholds = {
            veryLow: 30,    // Excellent time to trade
            low: 40,        // Good time to trade
            medium: 50,     // Normal trading
            high: 70,       // Caution
            veryHigh: 100   // Avoid trading
        };

        // Minimum profit multiplier based on gas prices
        this.gasProfitMultipliers = {
            veryLow: 1.0,   // Normal profit requirement
            low: 1.2,       // 20% more profit required
            medium: 1.5,    // 50% more profit required
            high: 2.0,      // Double profit required
            veryHigh: 3.0   // Triple profit required
        };
    }

    async initialize() {
        try {
            this.log('Initializing bot...', 'info', 'initialize');

            const rpcUrl = this.config.network?.rpc?.[0] || 'https://polygon-rpc.com';
            this.log(`Attempting to connect to RPC: ${rpcUrl}`, 'info', 'initialize');

            this.provider = new ethers.providers.JsonRpcProvider(rpcUrl);
            this.wallet = new ethers.Wallet(process.env.PRIVATE_KEY, this.provider);

            // Check wallet balance and token allowances
            await this.checkWalletBalances();

            this.log('Bot initialized successfully', 'success', 'initialize');
        } catch (error) {
            this.log(`Initialization failed: ${error.message}`, 'error', 'initialize');
            process.exit(1);
        }
    }

    async checkWalletBalances() {
        const address = await this.wallet.getAddress();

        // Check MATIC balance
        const maticBalance = await this.wallet.getBalance();
        this.log(`Wallet MATIC balance: ${ethers.utils.formatEther(maticBalance)} MATIC`, 'info', 'checkWalletBalances');

        // Check WETH balance
        const wethContract = new ethers.Contract(
            this.ADDRESSES.WETH,
            ['function balanceOf(address) view returns (uint256)'],
            this.provider
        );
        const wethBalance = await wethContract.balanceOf(address);
        this.log(`Wallet WETH balance: ${ethers.utils.formatEther(wethBalance)} WETH`, 'info', 'checkWalletBalances');

        // Check USDC balance
        const usdcContract = new ethers.Contract(
            this.ADDRESSES.USDC,
            ['function balanceOf(address) view returns (uint256)'],
            this.provider
        );
        const usdcBalance = await usdcContract.balanceOf(address);
        this.log(`Wallet USDC balance: ${ethers.utils.formatUnits(usdcBalance, 6)} USDC`, 'info', 'checkWalletBalances');

        return { maticBalance, wethBalance, usdcBalance };
    }

    async executeArbitrage(opportunity, pair) {
        try {
            // Check current gas price
            const gasInfo = await this.checkGasPrice();
            if (!gasInfo || !gasInfo.shouldTrade) {
                this.log('Skipping trade due to high gas prices', 'warn', 'executeArbitrage');
                return false;
            }

            const walletAddress = await this.wallet.getAddress();

            // Get current gas price
            const gasPrice = await this.provider.getGasPrice();
            const gasPriceGwei = ethers.utils.formatUnits(gasPrice, 'gwei');
            const estimatedGasLimit = 300000; // Typical gas limit for swap
            const gasCostWei = gasPrice.mul(estimatedGasLimit);
            const gasCostETH = ethers.utils.formatEther(gasCostWei);

            // Calculate trading fees (0.3% per swap for most DEXes)
            const swapAmount = ethers.utils.parseUnits(pair.maxTradeAmount, pair.token0Decimals);
            const tradingFee = swapAmount.mul(3).div(1000); // 0.3% fee
            const totalTradingFees = tradingFee.mul(2); // Two swaps

            try {
                // Get price impact
                const routerAddress = this.config.dexes.routers[opportunity.dex];
                const router = new ethers.Contract(
                    routerAddress,
                    ['function getAmountsOut(uint amountIn, address[] memory path) view returns (uint[] memory amounts)'],
                    this.provider
                );

                // Calculate first swap amounts
                const path1 = [pair.token0Address, pair.token1Address];
                const amounts1 = await router.getAmountsOut(swapAmount, path1);
                const expectedUSDC = amounts1[1];

                // Calculate second swap amounts
                const path2 = [pair.token1Address, pair.token0Address];
                const amounts2 = await router.getAmountsOut(expectedUSDC, path2);
                const expectedFinalWETH = amounts2[1];

                // Calculate expected profit/loss
                const expectedProfit = expectedFinalWETH.sub(swapAmount);

                // Calculate required profit using BigNumber operations
                const minProfitThreshold = this.config.tradingParameters.minProfitThreshold;
                const minProfitBips = Math.floor(minProfitThreshold * 10000); // Convert to basis points
                const requiredProfit = swapAmount.mul(minProfitBips).div(10000);

                // Safely calculate price impact
                let priceImpact;
                try {
                    const idealRate = swapAmount;
                    const actualRate = expectedFinalWETH;
                    const impactBips = idealRate.sub(actualRate).mul(10000).div(idealRate);
                    priceImpact = impactBips.div(100); // Convert to percentage
                } catch (error) {
                    priceImpact = ethers.BigNumber.from(0);
                    this.log(`⚠️ Could not calculate price impact: ${error.message}`, 'warn', 'executeArbitrage');
                }

                // Add detailed cost breakdown with safe number handling
                const breakdown = {
                    gasInETH: gasCostETH,
                    tradingFees: ethers.utils.formatUnits(totalTradingFees, pair.token0Decimals),
                    slippage: 0,
                    priceImpact: 0,
                    totalCosts: 0
                };

                // Calculate slippage and price impact
                try {
                    const expectedRate = swapAmount;
                    const actualRate = expectedFinalWETH;
                    const slippageAmount = expectedRate.sub(actualRate);
                    breakdown.slippage = ethers.utils.formatUnits(slippageAmount, pair.token0Decimals);

                    // Calculate price impact as percentage (handle potential division by zero)
                    if (!expectedRate.isZero()) {
                        const priceImpactBips = slippageAmount.mul(10000).div(expectedRate);
                        breakdown.priceImpact = priceImpactBips.toNumber() / 100;
                    }

                    // Safely convert string numbers to BigNumber for calculations
                    const gasInTokens = ethers.utils.parseUnits(
                        Number(breakdown.gasInETH).toFixed(pair.token0Decimals),
                        pair.token0Decimals
                    );
                    const tradingFeesInTokens = ethers.utils.parseUnits(
                        Number(breakdown.tradingFees).toFixed(pair.token0Decimals),
                        pair.token0Decimals
                    );
                    const slippageInTokens = ethers.utils.parseUnits(
                        Number(breakdown.slippage).toFixed(pair.token0Decimals),
                        pair.token0Decimals
                    );

                    // Calculate total costs
                    const totalCosts = gasInTokens.add(tradingFeesInTokens).add(slippageInTokens);
                    breakdown.totalCosts = ethers.utils.formatUnits(totalCosts, pair.token0Decimals);

                    // Calculate net profit/loss
                    const netProfitLoss = expectedProfit.sub(totalCosts);

                    // Log detailed analysis
                    this.log('\n📊 Trade Analysis:', 'info', 'executeArbitrage');
                    this.log(`Exchange: ${opportunity.dex}`, 'info', 'executeArbitrage');
                    this.log(`Pair: ${pair.name}`, 'info', 'executeArbitrage');
                    this.log(`Trade Amount: ${pair.maxTradeAmount} ${pair.token0Symbol}`, 'info', 'executeArbitrage');
                    this.log('\n💰 Cost Breakdown:', 'info', 'executeArbitrage');
                    this.log(`Gas Cost: ${Number(breakdown.gasInETH).toFixed(8)} ETH`, 'info', 'executeArbitrage');
                    this.log(`Trading Fees: ${Number(breakdown.tradingFees).toFixed(8)} ${pair.token0Symbol}`, 'info', 'executeArbitrage');
                    this.log(`Slippage Loss: ${Number(breakdown.slippage).toFixed(8)} ${pair.token0Symbol}`, 'info', 'executeArbitrage');
                    this.log(`Price Impact: ${Number(breakdown.priceImpact).toFixed(2)}%`, 'info', 'executeArbitrage');
                    this.log(`Total Costs: ${Number(breakdown.totalCosts).toFixed(8)} ${pair.token0Symbol}`, 'info', 'executeArbitrage');
                    this.log('\n📈 Profitability:', 'info', 'executeArbitrage');
                    this.log(`Gross Profit: ${ethers.utils.formatUnits(expectedProfit, pair.token0Decimals)} ${pair.token0Symbol}`, 'info', 'executeArbitrage');
                    this.log(`Net Profit: ${ethers.utils.formatUnits(netProfitLoss, pair.token0Decimals)} ${pair.token0Symbol}`, 'info', 'executeArbitrage');

                    // Add profitability suggestions
                    if (netProfitLoss.isNegative()) {
                        this.log('\n💡 Suggestions to improve profitability:', 'info', 'executeArbitrage');
                        if (parseFloat(breakdown.gasInETH) > parseFloat(breakdown.tradingFees)) {
                            this.log('- Consider waiting for lower gas prices', 'info', 'executeArbitrage');
                        }
                        if (breakdown.priceImpact > 1) {
                            this.log('- Consider reducing trade size to minimize price impact', 'info', 'executeArbitrage');
                        }
                        if (parseFloat(breakdown.slippage) > parseFloat(breakdown.tradingFees)) {
                            this.log('- Consider adjusting slippage tolerance', 'info', 'executeArbitrage');
                        }
                        if (opportunity.dex === 'ApeSwap') {
                            this.log('- ApeSwap often has higher slippage, consider other DEXes', 'info', 'executeArbitrage');
                        }
                    }

                    // Check if trade would be profitable
                    if (netProfitLoss.lte(0)) {
                        this.log(`⚠️ Trade not profitable for ${pair.name} on ${opportunity.dex}`, 'warn', 'executeArbitrage');
                        return false;
                    }

                    // If profitable, check mode
                    if (!this.liveTrading) {
                        this.log(`\n🔍 TEST MODE: Would execute profitable trade`, 'info', 'executeArbitrage');
                        return true;
                    }

                    // LIVE MODE: Execute the actual trade
                    this.log(`\n🚀 LIVE MODE: Executing trade on ${opportunity.dex}`, 'warn', 'executeArbitrage');

                    return true;

                } catch (error) {
                    this.log(`⚠️ Error calculating trade details for ${pair.name} on ${opportunity.dex}: ${error.message}`, 'warn', 'executeArbitrage');
                    return false;
                }

            } catch (error) {
                this.log(`⚠️ Error in executeArbitrage for ${pair.name} on ${opportunity.dex}: ${error.message}`, 'warn', 'executeArbitrage');
                return false;
            }

        } catch (error) {
            this.log(`⚠️ Error in executeArbitrage for ${pair.name} on ${opportunity.dex}: ${error.message}`, 'warn', 'executeArbitrage');
            return false;
        }
    }

    async startScanning() {
        try {
            this.log('\n' + '='.repeat(80), 'info', 'startScanning');
            this.log(`🤖 Running in ${this.liveTrading ? 'LIVE TRADING MODE' : 'TEST MODE'}`, 'info', 'startScanning');
            this.log('🔍 Starting new scan iteration', 'info', 'startScanning');
            this.log('=' .repeat(80), 'info', 'startScanning');

            while (true) {
                // Check gas price before scanning
                const gasInfo = await this.checkGasPrice();

                if (!gasInfo) {
                    this.log('Unable to get gas price, waiting for next iteration...', 'warn', 'startScanning');
                    await new Promise(resolve => setTimeout(resolve, this.config.BOT_SETTINGS.SLEEP_TIME));
                    continue;
                }

                // Skip trading if gas is too high
                if (!gasInfo.shouldTrade) {
                    this.log('Gas price too high, waiting for better conditions...', 'warn', 'startScanning');
                    // Wait longer when gas is high (5x normal sleep time)
                    await new Promise(resolve => setTimeout(resolve, this.config.BOT_SETTINGS.SLEEP_TIME * 5));
                    continue;
                }

                // Adjust minimum profit based on gas price
                const adjustedMinProfit = this.config.tradingParameters.minProfitThreshold * gasInfo.profitMultiplier;
                this.log(`Adjusted minimum profit threshold: ${adjustedMinProfit.toFixed(6)} (${gasInfo.profitMultiplier}x multiplier)`, 'info', 'startScanning');

                try {
                    this.log('\n' + '='.repeat(80) + '\n' + '🔍 Starting new scan iteration' + '\n' + '='.repeat(80), 'info', 'startScanning');

                    for (const pair of this.config.tradingPairs) {
                        this.log(`\n📊 Active Trading Pair: ${pair.name} (${pair.token0Symbol}/${pair.token1Symbol})`, 'info', 'startScanning');

                        // Check QuickSwap
                        this.log(`\n🔄 Checking Exchange: QuickSwap for ${pair.name}`, 'info', 'startScanning');
                        try {
                            const quickSwapOpp = await this.checkUniswapV2Liquidity(
                                pair,
                                this.config.dexes.factories.QuickSwap,
                                'QuickSwap'
                            );

                            if (quickSwapOpp) {
                                const success = await this.executeArbitrage(quickSwapOpp, pair);
                                if (!success) {
                                    this.log('⏭️ Skipping unprofitable QuickSwap trade', 'debug', 'startScanning');
                                }
                            }
                        } catch (error) {
                            this.log(`⚠️ Error checking QuickSwap: ${error.message}`, 'warn', 'startScanning');
                        }

                        // Check SushiSwap
                        this.log(`\n🍣 Checking Exchange: SushiSwap for ${pair.name}`, 'info', 'startScanning');
                        try {
                            const sushiSwapOpp = await this.checkUniswapV2Liquidity(
                                pair,
                                this.config.dexes.factories.SushiSwap,
                                'SushiSwap'
                            );

                            if (sushiSwapOpp) {
                                const success = await this.executeArbitrage(sushiSwapOpp, pair);
                                if (!success) {
                                    this.log('⏭️ Skipping unprofitable SushiSwap trade', 'debug', 'startScanning');
                                }
                            }
                        } catch (error) {
                            this.log(`⚠️ Error checking SushiSwap: ${error.message}`, 'warn', 'startScanning');
                        }

                        // Check ApeSwap
                        this.log(`\n🦍 Checking Exchange: ApeSwap for ${pair.name}`, 'info', 'startScanning');
                        try {
                            const apeSwapOpp = await this.checkUniswapV2Liquidity(
                                pair,
                                this.config.dexes.factories.ApeSwap,
                                'ApeSwap'
                            );

                            if (apeSwapOpp) {
                                const success = await this.executeArbitrage(apeSwapOpp, pair);
                                if (!success) {
                                    this.log('⏭️ Skipping unprofitable ApeSwap trade', 'debug', 'startScanning');
                                }
                            }
                        } catch (error) {
                            this.log(`⚠️ Error checking ApeSwap: ${error.message}`, 'warn', 'startScanning');
                        }

                        // Check JetSwap
                        this.log(`\n✈️ Checking Exchange: JetSwap for ${pair.name}`, 'info', 'startScanning');
                        try {
                            const jetSwapOpp = await this.checkUniswapV2Liquidity(
                                pair,
                                this.config.dexes.factories.JetSwap,
                                'JetSwap'
                            );

                            if (jetSwapOpp) {
                                const success = await this.executeArbitrage(jetSwapOpp, pair);
                                if (!success) {
                                    this.log('⏭️ Skipping unprofitable JetSwap trade', 'debug', 'startScanning');
                                }
                            }
                        } catch (error) {
                            this.log(`⚠️ Error checking JetSwap: ${error.message}`, 'warn', 'startScanning');
                        }
                    }

                    this.log('\n💤 Sleeping before next scan...', 'debug', 'startScanning');
                    await new Promise(resolve => setTimeout(resolve, this.config.BOT_SETTINGS.SLEEP_TIME));

                } catch (error) {
                    this.log(`⚠️ Error in scanning loop: ${error.message}`, 'warn', 'startScanning');
                    this.log('⏳ Continuing to next scan...', 'info', 'startScanning');
                    await new Promise(resolve => setTimeout(resolve, this.config.BOT_SETTINGS.SLEEP_TIME));
                    continue;
                }
            }
        } catch (error) {
            this.log(`Error in scanning: ${error.message}`, 'error', 'startScanning');
            throw error;
        }
    }

    async checkLiquidity(dexName, token0Address, token1Address) {
        try {
            const currentPair = this.config.tradingPairs.find(
                pair => pair.token0Address.toLowerCase() === token0Address.toLowerCase() &&
                       pair.token1Address.toLowerCase() === token1Address.toLowerCase()
            );

            if (!currentPair) {
                this.log(`Trading pair not found in configuration for ${token0Address}/${token1Address}`, 'warning', 'checkLiquidity');
                return null;
            }

            // Choose the appropriate DEX handler
            switch(dexName) {
                case 'QuickSwap':
                case 'SushiSwap':
                    return await this.checkUniswapV2Liquidity(dexName, currentPair);

                case 'UniswapV3':
                    return await this.checkUniswapV3Liquidity(dexName, currentPair);

                case 'OneInch':
                    return await this.checkOneInchLiquidity(dexName, currentPair);

                case 'KyberSwap':
                    return await this.checkKyberSwapLiquidity(dexName, currentPair);

                default:
                    this.log(`Unsupported DEX: ${dexName}`, 'warning', 'checkLiquidity');
                    return null;
            }

        } catch (error) {
            this.log(`Error checking liquidity on ${dexName}: ${error.message}`, 'error', 'checkLiquidity');
            return null;
        }
    }

    // Handler for UniswapV2-style DEXes (QuickSwap, SushiSwap)
    async checkUniswapV2Liquidity(pair, factoryAddress, dexName) {
        try {
            this.log(`Checking ${dexName} factory: ${factoryAddress}`, 'debug', 'checkUniswapV2Liquidity');
            this.log(`Token pair: ${pair.name}`, 'debug', 'checkUniswapV2Liquidity');
            this.log(`Token0: ${pair.token0Symbol} (${pair.token0Address})`, 'debug', 'checkUniswapV2Liquidity');
            this.log(`Token1: ${pair.token1Symbol} (${pair.token1Address})`, 'debug', 'checkUniswapV2Liquidity');

            // Initialize factory contract
            const factoryContract = new ethers.Contract(
                factoryAddress,
                [
                    'function getPair(address tokenA, address tokenB) external view returns (address pair)',
                    'function allPairs(uint) external view returns (address pair)',
                    'function allPairsLength() external view returns (uint)'
                ],
                this.provider
            );

            // Get pair address
            const pairAddress = await factoryContract.getPair(
                pair.token0Address,
                pair.token1Address
            );

            if (pairAddress === ethers.constants.AddressZero) {
                this.log(`No liquidity pair found on ${dexName}`, 'info', 'checkUniswapV2Liquidity');
                return null;
            }

            this.log(`Pair address: ${pairAddress}`, 'debug', 'checkUniswapV2Liquidity');

            // Initialize pair contract
            const pairContract = new ethers.Contract(
                pairAddress,
                [
                    'function token0() external view returns (address)',
                    'function token1() external view returns (address)',
                    'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
                    'function price0CumulativeLast() external view returns (uint)',
                    'function price1CumulativeLast() external view returns (uint)'
                ],
                this.provider
            );

            // Get reserves
            const [reserve0, reserve1] = await pairContract.getReserves();
            this.log(`Raw reserves: ${reserve0.toString()} / ${reserve1.toString()}`, 'debug', 'checkUniswapV2Liquidity');

            // Get token order from pair contract
            const token0 = await pairContract.token0();
            const token1 = await pairContract.token1();

            // Determine which token is USDC and WETH
            const isUsdcToken0 = token0.toLowerCase() === this.config.addresses.USDC.toLowerCase();

            // Format reserves with proper decimals
            const wethReserve = Number(ethers.utils.formatUnits(
                isUsdcToken0 ? reserve1 : reserve0,
                18  // WETH decimals
            ));
            const usdcReserve = Number(ethers.utils.formatUnits(
                isUsdcToken0 ? reserve0 : reserve1,
                6   // USDC decimals
            ));

            // Calculate price (USDC per WETH)
            const price = usdcReserve / wethReserve;

            this.log(`Formatted reserves: ${wethReserve.toFixed(4)} WETH / ${usdcReserve.toFixed(2)} USDC`, 'debug', 'checkUniswapV2Liquidity');
            this.log(`Calculated price: ${price.toFixed(2)} USDC/WETH`, 'debug', 'checkUniswapV2Liquidity');

            return {
                dex: dexName,
                liquidityInfo: {
                    poolAddress: pairAddress,
                    reserves: {
                        WETH: wethReserve,
                        USDC: usdcReserve
                    },
                    price: price,
                    dex: dexName,
                    isUsdcToken0: isUsdcToken0
                },
                price: price,
                isUsdcToken0: isUsdcToken0
            };

        } catch (error) {
            this.log(`⚠️ Error checking ${dexName} liquidity: ${error.message}`, 'warn', 'checkUniswapV2Liquidity');
            return null; // Return null instead of throwing error
        }
    }

    // Handler for UniswapV3
    async checkUniswapV3Liquidity(dexName, currentPair) {
        try {
            if (!currentPair || !currentPair.token0Address || !currentPair.token1Address) {
                this.log(`Invalid trading pair configuration for ${dexName}`, 'error', 'checkUniswapV3Liquidity');
                return null;
            }

            const factoryAddress = this.DEX_FACTORIES[dexName];
            if (!factoryAddress) {
                this.log(`No factory address found for ${dexName}`, 'error', 'checkUniswapV3Liquidity');
                return null;
            }

            const factory = new ethers.Contract(
                factoryAddress,
                ['function getPool(address,address,uint24) view returns (address)'],
                this.provider
            );

            // UniswapV3 uses fee tiers (0.05%, 0.3%, and 1%)
            const feeTiers = [500, 3000, 10000];
            let bestPool = null;
            let highestLiquidity = ethers.BigNumber.from(0);

            for (const fee of feeTiers) {
                try {
                    const poolAddress = await factory.getPool(
                        currentPair.token0Address,
                        currentPair.token1Address,
                        fee
                    );

                    if (poolAddress && poolAddress !== ethers.constants.AddressZero) {
                        const pool = new ethers.Contract(
                            poolAddress,
                            [
                                'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
                                'function liquidity() external view returns (uint128)'
                            ],
                            this.provider
                        );

                        const [slot0Data, liquidity] = await Promise.all([
                            pool.slot0(),
                            pool.liquidity()
                        ]);

                        if (liquidity.gt(highestLiquidity)) {
                            highestLiquidity = liquidity;
                            bestPool = {
                                address: poolAddress,
                                sqrtPriceX96: slot0Data.sqrtPriceX96,
                                liquidity: liquidity,
                                fee
                            };
                        }
                    }
                } catch (feeError) {
                    this.log(`Error checking fee tier ${fee} for ${currentPair.name}: ${feeError.message}`, 'debug', 'checkUniswapV3Liquidity');
                    continue;
                }
            }

            if (!bestPool) {
                this.log(`No active UniswapV3 pools found for ${currentPair.name}`, 'debug', 'checkUniswapV3Liquidity');
                return null;
            }

            // Calculate price from sqrtPriceX96
            const price = ethers.BigNumber.from(bestPool.sqrtPriceX96)
                .mul(bestPool.sqrtPriceX96)
                .mul(ethers.utils.parseUnits('1', currentPair.token1Decimals))
                .div(ethers.BigNumber.from(2).pow(192))
                .div(ethers.utils.parseUnits('1', currentPair.token0Decimals));

            return {
                poolAddress: bestPool.address,
                price,
                dex: dexName,
                fee: bestPool.fee
            };

        } catch (error) {
            this.log(`Error checking UniswapV3 liquidity: ${error.message}`, 'error', 'checkUniswapV3Liquidity');
            return null;
        }
    }

    // Handler for 1inch (price aggregator)
    async checkOneInchLiquidity(dexName, currentPair) {
        try {
            // 1inch API endpoint for price quotes
            const apiUrl = `https://api.1inch.io/v5.0/137/quote?fromTokenAddress=${currentPair.token0Address}&toTokenAddress=${currentPair.token1Address}&amount=${ethers.utils.parseUnits('1', currentPair.token0Decimals)}`;

            const response = await fetch(apiUrl);
            const data = await response.json();

            if (!data.toTokenAmount) {
                return null;
            }

            return {
                price: ethers.BigNumber.from(data.toTokenAmount),
                dex: dexName,
                source: '1inch API'
            };

        } catch (error) {
            this.log(`Error checking 1inch prices: ${error.message}`, 'error', 'checkOneInchLiquidity');
            return null;
        }
    }

    async calculateProfitability(opportunity, pair) {
        try {
            this.log('Calculating profitability for WETH/USDC', 'debug', 'calculateProfitability');

            const dexPrice = opportunity.price;
            const marketPrice = 3300; // This should be dynamically fetched
            this.log(`DEX Price: ${dexPrice.toFixed(2)} USDC/WETH`, 'debug', 'calculateProfitability');
            this.log(`Market Price: ${marketPrice} USDC/WETH`, 'debug', 'calculateProfitability');

            // Get current gas price
            const gasPrice = await this.provider.getGasPrice();
            const estimatedGasUsed = ethers.BigNumber.from('300000');
            const gasCostInMatic = gasPrice.mul(estimatedGasUsed);

            // Convert MATIC gas cost to WETH
            const maticPriceInWeth = ethers.utils.parseEther('0.0004');
            const gasCostInWeth = gasCostInMatic.mul(maticPriceInWeth).div(ethers.utils.parseEther('1'));

            // Calculate profit in WETH terms
            const tradeAmount = ethers.utils.parseUnits(
                pair.maxTradeAmount || '0.01',
                pair.token0Decimals || 18
            );

            // Calculate expected profit
            const priceDifference = Math.abs(marketPrice - dexPrice);
            const profitPercentage = (priceDifference / dexPrice) * 100;
            const rawProfitInWeth = tradeAmount.mul(Math.floor(profitPercentage * 100)).div(10000);

            // Calculate slippage
            const expectedSlippage = tradeAmount.mul(1).div(1000); // 0.1% slippage

            this.log(`Estimated gas cost: ${ethers.utils.formatEther(gasCostInWeth)} WETH`, 'debug', 'calculateProfitability');
            this.log(`Raw profit: ${ethers.utils.formatEther(rawProfitInWeth)} WETH`, 'debug', 'calculateProfitability');
            this.log(`Expected slippage: ${ethers.utils.formatEther(expectedSlippage)} WETH`, 'debug', 'calculateProfitability');

            // Calculate net profit
            const netProfit = rawProfitInWeth.sub(gasCostInWeth).sub(expectedSlippage);
            const netProfitPercent = (parseFloat(ethers.utils.formatEther(netProfit)) /
                                    parseFloat(pair.maxTradeAmount || '0.01')) * 100;

            return {
                isViable: netProfit.gt(0) && netProfitPercent > this.MIN_PROFIT_THRESHOLD,
                rawProfit: profitPercentage,
                netProfit: netProfitPercent,
                gasCost: parseFloat(ethers.utils.formatEther(gasCostInWeth)),
                slippage: parseFloat(ethers.utils.formatEther(expectedSlippage))
            };

        } catch (error) {
            this.log(`Error calculating profitability: ${error.message}`, 'error', 'calculateProfitability');
            throw error;
        }
    }

    // Add method to get market price
    async getMarketPrice(pair) {
        try {
            // Return approximate market prices for common pairs
            switch(pair.name) {
                case "WETH/USDC":
                    return 3300.0;  // WETH in USDC
                case "WBTC/WETH":
                    return 18.5;    // WBTC in WETH
                case "WMATIC/USDC":
                    return 0.85;    // WMATIC in USDC
                case "DAI/USDC":
                    return 1.0;     // DAI/USDC should be close to 1
                case "WETH/DAI":
                    return 3300.0;  // WETH in DAI
                case "WETH/USDT":
                    return 3300.0;  // WETH in USDT
                case "USDC/USDT":
                    return 1.0;     // USDC/USDT should be close to 1
                case "USDC/DAI":
                    return 1.0;     // USDC/DAI should be close to 1
                default:
                    this.log(`No market price defined for ${pair.name}`, 'warning', 'getMarketPrice');
                    return null;    // Return null instead of 0
            }
        } catch (error) {
            this.log(`Error getting market price: ${error.message}`, 'error', 'getMarketPrice');
            return null;
        }
    }

    // Add timeout helper method
    async withTimeout(promise, timeoutMs, errorMessage) {
        const timeout = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
        });

        return Promise.race([promise, timeout]);
    }

    async checkKyberSwapLiquidity(dexName, currentPair) {
        try {
            const factoryAddress = this.DEX_FACTORIES[dexName];
            const factory = new ethers.Contract(
                factoryAddress,
                [
                    'function getPair(address tokenA, address tokenB) view returns (address)',
                    'function allPairs(uint) view returns (address)',
                    'function allPairsLength() view returns (uint)'
                ],
                this.provider
            );

            this.log(`Checking KyberSwap pair: ${currentPair.token0Symbol}/${currentPair.token1Symbol}`, 'debug', 'checkKyberSwapLiquidity');

            const poolAddress = await factory.getPair(
                currentPair.token0Address,
                currentPair.token1Address
            );

            if (!poolAddress || poolAddress === ethers.constants.AddressZero) {
                this.log(`No KyberSwap pool found for ${currentPair.name}`, 'debug', 'checkKyberSwapLiquidity');
                return null;
            }

            const poolABI = [
                'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
                'function token0() external view returns (address)',
                'function token1() external view returns (address)'
            ];

            const pool = new ethers.Contract(poolAddress, poolABI, this.provider);
            const [reserves, token0, token1] = await Promise.all([
                pool.getReserves(),
                pool.token0(),
                pool.token1()
            ]);

            const isToken0First = currentPair.token0Address.toLowerCase() === token0.toLowerCase();
            const reserve0 = isToken0First ? reserves.reserve0 : reserves.reserve1;
            const reserve1 = isToken0First ? reserves.reserve1 : reserves.reserve0;

            // Calculate price
            const price = reserve1.mul(ethers.utils.parseUnits('1', currentPair.token0Decimals))
                               .div(reserve0);

            return {
                poolAddress,
                reserves: {
                    [currentPair.token0Symbol]: reserve0,
                    [currentPair.token1Symbol]: reserve1
                },
                price,
                dex: dexName
            };

        } catch (error) {
            this.log(`Error checking KyberSwap liquidity: ${error.message}`, 'error', 'checkKyberSwapLiquidity');
            return null;
        }
    }

    // Add this helper function
    async checkFlashLoanContract() {
        try {
            const flashLoanContract = new ethers.Contract(
                this.config.FLASH_LOAN.CONTRACT_ADDRESS,
                this.config.FLASH_LOAN.ABI,
                this.wallet
            );

            this.log(`Checking flash loan contract at ${this.config.FLASH_LOAN.CONTRACT_ADDRESS}`, 'info', 'checkFlashLoanContract');

            // Check if contract exists
            const code = await this.provider.getCode(this.config.FLASH_LOAN.CONTRACT_ADDRESS);
            if (code === '0x') {
                this.log('Flash loan contract not deployed at specified address', 'error', 'checkFlashLoanContract');
                return false;
            }

            // Get contract interface
            const iface = new ethers.utils.Interface(this.config.FLASH_LOAN.ABI);
            this.log('Contract functions:', 'info', 'checkFlashLoanContract');
            Object.keys(iface.functions).forEach(func => {
                this.log(`- ${func}`, 'debug', 'checkFlashLoanContract');
            });

            // Check WETH balance of contract
            const wethContract = new ethers.Contract(
                '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
                ['function balanceOf(address) view returns (uint256)'],
                this.provider
            );
            const balance = await wethContract.balanceOf(this.config.FLASH_LOAN.CONTRACT_ADDRESS);
            this.log(`Contract WETH balance: ${ethers.utils.formatEther(balance)} WETH`, 'info', 'checkFlashLoanContract');

            return true;
        } catch (error) {
            this.log(`Error checking flash loan contract: ${error.message}`, 'error', 'checkFlashLoanContract');
            return false;
        }
    }

    async getRevertReason(tx, error) {
        try {
            const code = await this.provider.call(tx);
            return `Unknown error: ${code}`;
        } catch (callError) {
            if (callError.data) {
                const hex = callError.data;
                // Remove the function selector if present
                const strippedData = hex.startsWith('0x') ? hex.slice(10) : hex;
                try {
                    // Try to decode as a string
                    const decoded = ethers.utils.defaultAbiCoder.decode(['string'], '0x' + strippedData);
                    return decoded[0];
                } catch (e) {
                    return `Raw error data: ${hex}`;
                }
            }
            return error.message;
        }
    }

    // Add this as a class method
    async waitForTx(tx, timeoutMs = 30000) {
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Transaction timeout')), timeoutMs)
        );

        try {
            const receipt = await Promise.race([
                tx.wait(),
                timeoutPromise
            ]);
            return receipt;
        } catch (error) {
            this.log(`Transaction failed or timed out: ${error.message}`, 'error', 'waitForTx');
            throw error;
        }
    }

    // Add a help method
    static showHelp() {
        console.log(`
Usage: node bot.js [options]

Options:
  --log-level, -l  Set logging level (error, warn, info, debug)
                   Default: info
  --live, -x       Enable live trading mode (default: test mode only)
  --help, -h       Show this help message

Examples:
  node bot.js                     # Run in test mode with default logging
  node bot.js --live             # Run with live trading enabled
  node bot.js -l debug --live    # Run live with debug logging
  node bot.js -x                 # Run with live trading (short form)
        `);
    }

    // Add method to check gas prices
    async checkGasPrice() {
        try {
            const gasPrice = await this.provider.getGasPrice();
            const gasPriceGwei = parseFloat(ethers.utils.formatUnits(gasPrice, 'gwei'));

            let gasStatus;
            let shouldTrade = true;
            let profitMultiplier = 1.0;

            if (gasPriceGwei <= this.gasThresholds.veryLow) {
                gasStatus = '✅ Very Low';
                profitMultiplier = this.gasProfitMultipliers.veryLow;
            } else if (gasPriceGwei <= this.gasThresholds.low) {
                gasStatus = '✅ Low';
                profitMultiplier = this.gasProfitMultipliers.low;
            } else if (gasPriceGwei <= this.gasThresholds.medium) {
                gasStatus = '⚠️ Medium';
                profitMultiplier = this.gasProfitMultipliers.medium;
            } else if (gasPriceGwei <= this.gasThresholds.high) {
                gasStatus = '🔴 High';
                profitMultiplier = this.gasProfitMultipliers.high;
                shouldTrade = false;
            } else {
                gasStatus = '🚫 Very High';
                profitMultiplier = this.gasProfitMultipliers.veryHigh;
                shouldTrade = false;
            }

            this.log(`\nCurrent Gas Price: ${gasPriceGwei.toFixed(1)} Gwei (${gasStatus})`, 'info', 'checkGasPrice');

            return {
                gasPrice,
                gasPriceGwei,
                status: gasStatus,
                shouldTrade,
                profitMultiplier
            };
        } catch (error) {
            this.log(`Error checking gas price: ${error.message}`, 'error', 'checkGasPrice');
            return null;
        }
    }
}

// Add help option handling
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    ArbitrageScanner.showHelp();
    process.exit(0);
}

// Add this check before running main
if (!process.env.PRIVATE_KEY) {
    console.error('ERROR: PRIVATE_KEY environment variable is required');
    console.error('Please set it before running the bot:');
    console.error('export PRIVATE_KEY=your_private_key_here');
    process.exit(1);
}

async function main() {
    try {
        console.log('Starting Polygon Arbitrage Bot...');
        const bot = new ArbitrageScanner();
        await bot.initialize();
        await bot.startScanning();
    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1); // Exit with error code
    }
}

// Add global error handlers
process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
    process.exit(1);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    process.exit(1);
});

main().catch(error => {
    console.error('Bot crashed:', error);
    process.exit(1);
});

module.exports = ArbitrageScanner;