const { ethers } = require('ethers');
const { SETTINGS, GLOBAL_CONFIG } = require('../config/settings');

const FACTORY_ABI = [
    "function getPair(address,address) external view returns (address)",
    "function getReserves() external view returns (uint112,uint112,uint32)"
];

const PAIR_ABI = [
    "function token0() external view returns (address)",
    "function token1() external view returns (address)",
    "function getReserves() external view returns (uint112,uint112,uint32)"
];

async function discoverPairs(provider, factoryAddress, settings) {
    const factory = new ethers.Contract(factoryAddress, FACTORY_ABI, provider);
    const pairs = new Set();
    const tokens = settings.TOKENS;
    const tokenSymbols = Object.keys(tokens);

    console.log(`\nDiscovering pairs on DEX ${factoryAddress.slice(0, 6)}...`);
    let discoveredCount = 0;
    let skippedCount = 0;

    // Generate all possible token pairs
    for (let i = 0; i < tokenSymbols.length; i++) {
        for (let j = i + 1; j < tokenSymbols.length; j++) {
            const token0Symbol = tokenSymbols[i];
            const token1Symbol = tokenSymbols[j];
            const pairKey = `${token0Symbol}-${token1Symbol}`;

            try {
                const token0Address = tokens[token0Symbol].address;
                const token1Address = tokens[token1Symbol].address;
                const pairAddress = await factory.getPair(token0Address, token1Address);

                if (pairAddress && pairAddress !== ethers.constants.AddressZero) {
                    // Check if pair is excluded
                    if (settings.EXCLUDED_PAIRS &&
                        settings.EXCLUDED_PAIRS.includes(pairKey)) {
                        skippedCount++;
                        continue;
                    }

                    const pair = new ethers.Contract(pairAddress, PAIR_ABI, provider);
                    const reserves = await pair.getReserves();

                    if (reserves[0].gt(0) && reserves[1].gt(0)) {
                        const specificSettings = settings.PAIR_SPECIFIC_SETTINGS?.[pairKey] || {};

                        pairs.add({
                            token0: token0Symbol,
                            token1: token1Symbol,
                            address: pairAddress,
                            dex: factoryAddress,
                            minProfit: specificSettings.minProfit || settings.PAIR_DEFAULTS.minProfit,
                            profitMargin: specificSettings.profitMargin || settings.PAIR_DEFAULTS.profitMargin,
                            maxSlippage: specificSettings.maxSlippage || settings.PAIR_DEFAULTS.maxSlippage,
                            flashLoanAmount: specificSettings.flashLoanAmount || settings.PAIR_DEFAULTS.flashLoanAmount
                        });
                        discoveredCount++;

                        // Print discovery in a compact format
                        process.stdout.write(`Found: ${token0Symbol}-${token1Symbol}, `);
                        if (discoveredCount % 3 === 0) console.log(); // New line every 3 pairs
                    } else {
                        skippedCount++;
                    }
                }
            } catch (error) {
                console.warn(`\nError with ${pairKey}:`, error.message);
                skippedCount++;
            }
        }
    }

    // Ensure we end with a new line
    if (discoveredCount % 3 !== 0) console.log();

    console.log(`\nSummary for DEX ${factoryAddress.slice(0, 6)}:`);
    console.log(`✓ Discovered ${discoveredCount} valid pairs`);
    console.log(`✗ Skipped ${skippedCount} invalid/low liquidity pairs\n`);

    return Array.from(pairs);
}

module.exports = {
    discoverPairs
};
