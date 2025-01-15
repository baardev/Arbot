const ethers = require('ethers');
const fs = require('fs');
const path = require('path');

// Load config.json
const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../config.json'), 'utf8'));

// Initialize providers with explicit network configuration and better error handling
const providers = config.network.rpc.map(rpc => new ethers.providers.JsonRpcProvider(rpc, {
    name: 'Polygon',
    chainId: 137
}));

let currentProviderIndex = 0;

function getNextProvider() {
    currentProviderIndex = (currentProviderIndex + 1) % providers.length;
    return providers[currentProviderIndex];
}

// Add provider check
async function checkProviders() {
    for (let i = 0; i < providers.length; i++) {
        try {
            await providers[i].getNetwork();
            console.log(`Provider ${i + 1} connected successfully to Polygon network`);
        } catch (error) {
            console.error(`Provider ${i + 1} failed to connect: ${error.message}`);
            providers.splice(i, 1);
            i--;
        }
    }

    if (providers.length === 0) {
        throw new Error('No working providers available');
    }
}

// Factory ABI
const factoryABI = [
    'function allPairsLength() external view returns (uint)',
    'function allPairs(uint) external view returns (address)',
    'function getPair(address tokenA, address tokenB) external view returns (address)'
];

// Token ABI
const tokenABI = [
    'function symbol() external view returns (string)',
    'function decimals() external view returns (uint8)',
    'function name() external view returns (string)'
];

// Pair ABI
const pairABI = [
    'function token0() external view returns (address)',
    'function token1() external view returns (address)',
    'function getReserves() external view returns (uint112, uint112, uint32)'
];

// Add delay function
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Add retry logic
async function retryOperation(operation, maxRetries = 3, delayMs = 2000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            if (error.message.includes('rate limit') || error.message.includes('Too many requests')) {
                console.log(`Rate limited, waiting ${delayMs/1000}s before retry ${attempt}/${maxRetries}`);
                await delay(delayMs);
                // Increase delay for next attempt
                delayMs *= 2;
                continue;
            }
            throw error;
        }
    }
    throw new Error(`Failed after ${maxRetries} retries`);
}

// Add known stablecoin addresses and WETH address
const STABLECOINS = {
    'USDC': '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    'USDT': '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    'DAI': '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063'
};

const WETH_ADDRESS = '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619';

// Function to check if address is a stablecoin
function isStablecoin(address) {
    return Object.values(STABLECOINS).includes(address.toLowerCase());
}

// Function to calculate USD value
async function calculateUSDValue(tokenAddress, reserve, decimals, provider) {
    try {
        // If token is a stablecoin, return value directly with proper decimal handling
        if (isStablecoin(tokenAddress)) {
            const value = ethers.utils.formatUnits(reserve, decimals);
            const usdValue = Math.floor(parseFloat(value)); // Convert to integer USD

            // Sanity check - no pool should have more than $10 billion
            if (usdValue > 10_000_000_000) {
                console.warn(`Warning: Unusually large stablecoin value for ${tokenAddress}: ${usdValue}`);
                return 0;
            }
            return usdValue;
        }

        // If token is WETH, get price from WETH/USDC pair
        const usdcWethPair = new ethers.Contract(
            '0x853Ee4b2A13f8a742d64C8F088bE7bA2131f670d', // USDC-WETH pair on QuickSwap
            pairABI,
            provider
        );

        const [wethReserve, usdcReserve] = await usdcWethPair.getReserves();
        const wethPrice = parseFloat(ethers.utils.formatUnits(usdcReserve, 6)) /
                         parseFloat(ethers.utils.formatUnits(wethReserve, 18));

        if (tokenAddress.toLowerCase() === WETH_ADDRESS.toLowerCase()) {
            const wethAmount = parseFloat(ethers.utils.formatUnits(reserve, decimals));
            const value = Math.floor(wethAmount * wethPrice);
            if (value > 10_000_000_000) {
                console.warn(`Warning: Unusually large WETH value: ${value}`);
                return 0;
            }
            return value;
        }

        // For other tokens, try to get price through WETH pair
        try {
            const factory = new ethers.Contract(
                config.dexes.factories.QuickSwap,
                factoryABI,
                provider
            );

            const pairAddress = await factory.getPair(tokenAddress, WETH_ADDRESS);
            if (pairAddress === '0x0000000000000000000000000000000000000000') {
                return 0;
            }

            const tokenWethPair = new ethers.Contract(pairAddress, pairABI, provider);
            const [tokenReserve, wethReserveForToken] = await tokenWethPair.getReserves();
            const token0 = await tokenWethPair.token0();

            // Calculate token price in WETH
            let tokenAmount = parseFloat(ethers.utils.formatUnits(reserve, decimals));
            let tokenPriceInWeth;

            if (token0.toLowerCase() === tokenAddress.toLowerCase()) {
                tokenPriceInWeth = parseFloat(ethers.utils.formatUnits(wethReserveForToken, 18)) /
                                 parseFloat(ethers.utils.formatUnits(tokenReserve, decimals));
            } else {
                tokenPriceInWeth = parseFloat(ethers.utils.formatUnits(tokenReserve, 18)) /
                                 parseFloat(ethers.utils.formatUnits(wethReserveForToken, decimals));
            }

            // Calculate USD value with additional sanity checks
            const rawValue = tokenAmount * tokenPriceInWeth * wethPrice;

            // Check for NaN or Infinity
            if (!Number.isFinite(rawValue)) {
                console.warn(`Warning: Invalid calculation result for ${tokenAddress}`);
                return 0;
            }

            const value = Math.floor(rawValue);

            // Sanity check
            if (value > 10_000_000_000) {
                console.warn(`Warning: Unusually large token value for ${tokenAddress}: ${value}`);
                return 0;
            }

            return value;

        } catch (error) {
            console.error(`Error calculating price for token ${tokenAddress}: ${error.message}`);
            return 0;
        }
    } catch (error) {
        console.error(`Error in calculateUSDValue: ${error.message}`);
        return 0;
    }
}

async function scanDex(dexName, factoryAddress, allPairs) {
    console.log(`\nScanning ${dexName}...`);

    const factory = new ethers.Contract(factoryAddress, factoryABI, getNextProvider());
    const pairCount = await factory.allPairsLength();
    console.log(`Total pairs found: ${pairCount.toString()}`);

    const pairs = [];
    const batchSize = 10;

    for (let i = 0; i < pairCount.toNumber(); i += batchSize) {
        const endIndex = Math.min(i + batchSize, pairCount.toNumber());
        process.stdout.write(`\rProcessing pairs ${i} to ${endIndex} of ${pairCount}...`);

        await delay(1000);

        const batch = [];
        for (let j = i; j < endIndex; j++) {
            batch.push(factory.allPairs(j));
        }

        const pairAddresses = await Promise.all(batch);

        for (const pairAddress of pairAddresses) {
            try {
                await delay(500);

                const pair = new ethers.Contract(pairAddress, pairABI, getNextProvider());

                const [token0Address, token1Address, reserves] = await retryOperation(async () =>
                    Promise.all([
                        pair.token0(),
                        pair.token1(),
                        pair.getReserves()
                    ])
                );

                const [reserve0, reserve1] = reserves;

                const minLiquidity = ethers.utils.parseUnits('1000', 18);

                if (reserve0.lt(minLiquidity) && reserve1.lt(minLiquidity)) {
                    continue;
                }

                const token0 = new ethers.Contract(token0Address, tokenABI, getNextProvider());
                const token1 = new ethers.Contract(token1Address, tokenABI, getNextProvider());

                const [
                    token0Symbol,
                    token1Symbol,
                    token0Name,
                    token1Name,
                    token0Decimals,
                    token1Decimals
                ] = await retryOperation(async () =>
                    Promise.all([
                        token0.symbol(),
                        token1.symbol(),
                        token0.name(),
                        token1.name(),
                        token0.decimals(),
                        token1.decimals()
                    ])
                );

                const [token0UsdValue, token1UsdValue] = await Promise.all([
                    calculateUSDValue(token0Address, reserve0, token0Decimals, getNextProvider()),
                    calculateUSDValue(token1Address, reserve1, token1Decimals, getNextProvider())
                ]);

                // Format USD values as integers with sanity checks
                const token0UsdFormatted = Math.min(Math.floor(token0UsdValue), 10_000_000_000);
                const token1UsdFormatted = Math.min(Math.floor(token1UsdValue), 10_000_000_000);
                const totalLiquidityFormatted = Math.min(token0UsdFormatted + token1UsdFormatted, 20_000_000_000);

                const pairInfo = {
                    name: `${token0Symbol}/${token1Symbol}`,
                    dex: dexName,
                    pairAddress: pairAddress,
                    token0: {
                        symbol: token0Symbol,
                        name: token0Name,
                        address: token0Address,
                        decimals: token0Decimals,
                        reserve: reserve0.toString(),
                        reserveUSD: token0UsdFormatted
                    },
                    token1: {
                        symbol: token1Symbol,
                        name: token1Name,
                        address: token1Address,
                        decimals: token1Decimals,
                        reserve: reserve1.toString(),
                        reserveUSD: token1UsdFormatted
                    },
                    totalLiquidityUSD: totalLiquidityFormatted
                };

                // Update minimum liquidity check to use USD value
                if (token0UsdValue + token1UsdValue < 1000) { // Minimum $1000 in liquidity
                    continue;
                }

                pairs.push(pairInfo);

                // Update all_pairs.json immediately
                if (!allPairs[dexName]) {
                    allPairs[dexName] = [];
                }
                allPairs[dexName].push(pairInfo);

                // Write to both files
                fs.writeFileSync(
                    path.join(__dirname, '../data/all_pairs.json'),
                    JSON.stringify(allPairs, null, 2)
                );

                fs.writeFileSync(
                    path.join(__dirname, `../data/${dexName.toLowerCase()}_pairs.json`),
                    JSON.stringify(pairs, null, 2)
                );

                // Clear line and print new pair
                process.stdout.clearLine();
                process.stdout.cursorTo(0);
                console.log(`Found active pair: ${token0Symbol}/${token1Symbol} (Reserves: ${ethers.utils.formatEther(reserve0)} / ${ethers.utils.formatEther(reserve1)})`);

            } catch (error) {
                process.stdout.clearLine();
                process.stdout.cursorTo(0);
                console.error(`Error processing pair ${pairAddress}: ${error.message}`);
                continue;
            }
        }
    }

    return pairs;
}

async function main() {
    try {
        await checkProviders();

        const allPairs = {};

        for (const [dexName, factoryAddress] of Object.entries(config.dexes.factories)) {
            try {
                const pairs = await scanDex(dexName, factoryAddress, allPairs);
                console.log(`\nCompleted scanning ${dexName}: found ${pairs.length} active pairs`);
            } catch (error) {
                console.error(`\nError scanning ${dexName}: ${error.message}`);
            }
        }

        console.log('\nScan complete! Results saved to data directory.');
    } catch (error) {
        console.error('Fatal error:', error.message);
        process.exit(1);
    }
}

// Create data directory if it doesn't exist
if (!fs.existsSync(path.join(__dirname, '../data'))) {
    fs.mkdirSync(path.join(__dirname, '../data'));
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
