// Global Configuration Variables
const GLOBAL_CONFIG = {
    MIN_PROFIT_USD: 50,           // Minimum profit in USD to execute a trade
    MIN_PROFIT_MARGIN: 1.0,       // Minimum profit margin percentage (1.0 = 1%)
    GAS_PRICE_LIMIT: 50,          // Maximum gas price in gwei
    FLASH_LOAN_MIN: 10000,        // Minimum flash loan amount in USD
    FLASH_LOAN_MAX: 1000000,      // Maximum flash loan amount in USD
    FLASH_LOAN_DEFAULT: 50000,    // Default flash loan amount in USD
    MIN_LIQUIDITY: 10000,         // Default minimum liquidity requirement in USD
    SCAN_DELAY_MS: 5000           // Delay between scans in milliseconds
};

const SETTINGS = {
    development: {
        ENABLED: true,
        MIN_PROFIT_USD: GLOBAL_CONFIG.MIN_PROFIT_USD / 5,  // Lower for development
        GAS_LIMIT: 3000000,
        SCAN_DELAY: 1000,
        PROFIT_MARGIN: GLOBAL_CONFIG.MIN_PROFIT_MARGIN / 2,
        GAS_PRICE_LIMIT: GLOBAL_CONFIG.GAS_PRICE_LIMIT * 2,

        FLASH_LOAN: {
            MIN_AMOUNT_USD: GLOBAL_CONFIG.FLASH_LOAN_MIN / 10,
            MAX_AMOUNT_USD: GLOBAL_CONFIG.FLASH_LOAN_MAX / 10,
            DEFAULT_AMOUNT_USD: GLOBAL_CONFIG.FLASH_LOAN_DEFAULT / 10,
            AMOUNTS_TO_CHECK: [1000, 2500, 5000, 7500, 10000]
        },

        // ... rest of development settings
    },

    production: {
        ENABLED: true,
        MIN_PROFIT_USD: GLOBAL_CONFIG.MIN_PROFIT_USD,
        GAS_LIMIT: 3000000,
        SCAN_DELAY: GLOBAL_CONFIG.SCAN_DELAY_MS,
        PROFIT_MARGIN: GLOBAL_CONFIG.MIN_PROFIT_MARGIN,
        GAS_PRICE_LIMIT: GLOBAL_CONFIG.GAS_PRICE_LIMIT,

        FLASH_LOAN: {
            MIN_AMOUNT_USD: GLOBAL_CONFIG.FLASH_LOAN_MIN,
            MAX_AMOUNT_USD: GLOBAL_CONFIG.FLASH_LOAN_MAX,
            DEFAULT_AMOUNT_USD: GLOBAL_CONFIG.FLASH_LOAN_DEFAULT,
            AMOUNTS_TO_CHECK: [
                GLOBAL_CONFIG.FLASH_LOAN_MIN,
                GLOBAL_CONFIG.FLASH_LOAN_MIN * 2.5,
                GLOBAL_CONFIG.FLASH_LOAN_DEFAULT,
                GLOBAL_CONFIG.FLASH_LOAN_DEFAULT * 2,
                GLOBAL_CONFIG.FLASH_LOAN_DEFAULT * 5,
                GLOBAL_CONFIG.FLASH_LOAN_MAX
            ],
            SCALING: {
                ENABLED: true,
                MAX_SCALING_FACTOR: 3,
                MIN_PROFIT_FOR_SCALE: 2
            }
        },

        TOKENS: {
            USDC: {
                address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
                decimals: 6,
                minLiquidity: GLOBAL_CONFIG.MIN_LIQUIDITY
            },
            WETH: {
                address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
                decimals: 18,
                minLiquidity: GLOBAL_CONFIG.MIN_LIQUIDITY
            },
            WMATIC: {
                address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
                decimals: 18,
                minLiquidity: GLOBAL_CONFIG.MIN_LIQUIDITY / 2  // Lower for MATIC
            },
            DAI: {
                address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
                decimals: 18,
                minLiquidity: GLOBAL_CONFIG.MIN_LIQUIDITY
            },
            USDT: {
                address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
                decimals: 6,
                minLiquidity: GLOBAL_CONFIG.MIN_LIQUIDITY
            },
            WBTC: {
                address: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6",
                decimals: 8,
                minLiquidity: GLOBAL_CONFIG.MIN_LIQUIDITY
            }
        },

        PAIR_DEFAULTS: {
            minProfit: GLOBAL_CONFIG.MIN_PROFIT_USD,
            profitMargin: GLOBAL_CONFIG.MIN_PROFIT_MARGIN,
            maxSlippage: 0.5,
            flashLoanAmount: GLOBAL_CONFIG.FLASH_LOAN_DEFAULT
        },

        PAIR_SPECIFIC_SETTINGS: {
            'USDC-WETH': {
                minProfit: GLOBAL_CONFIG.MIN_PROFIT_USD * 2,
                profitMargin: GLOBAL_CONFIG.MIN_PROFIT_MARGIN * 0.8,
                flashLoanAmount: GLOBAL_CONFIG.FLASH_LOAN_DEFAULT * 2
            },
            'USDT-USDC': {
                minProfit: GLOBAL_CONFIG.MIN_PROFIT_USD * 0.6,
                profitMargin: GLOBAL_CONFIG.MIN_PROFIT_MARGIN * 0.3,
                maxSlippage: 0.1
            }
        },

        MONITOR_ALL_PAIRS: true,
        EXCLUDED_PAIRS: []
    }
};

// Helper function to generate all possible pairs
function generateAllPairs(tokens) {
    const pairs = [];
    const tokenSymbols = Object.keys(tokens);

    for (let i = 0; i < tokenSymbols.length; i++) {
        for (let j = i + 1; j < tokenSymbols.length; j++) {
            const token0 = tokenSymbols[i];
            const token1 = tokenSymbols[j];
            const pairKey = `${token0}-${token1}`;
            const reversePairKey = `${token1}-${token0}`;

            // Skip if pair is excluded
            if (SETTINGS.production.EXCLUDED_PAIRS &&
                (SETTINGS.production.EXCLUDED_PAIRS.includes(pairKey) ||
                 SETTINGS.production.EXCLUDED_PAIRS.includes(reversePairKey))) {
                continue;
            }

            // Get specific settings if they exist
            const specificSettings = SETTINGS.production.PAIR_SPECIFIC_SETTINGS[pairKey] ||
                                   SETTINGS.production.PAIR_SPECIFIC_SETTINGS[reversePairKey] ||
                                   {};

            // Combine default and specific settings
            pairs.push({
                token0,
                token1,
                ...SETTINGS.production.PAIR_DEFAULTS,
                ...specificSettings
            });
        }
    }
    return pairs;
}

// Generate all pairs if enabled
if (SETTINGS.production.MONITOR_ALL_PAIRS) {
    SETTINGS.production.PAIRS_TO_MONITOR = generateAllPairs(SETTINGS.production.TOKENS);
}

module.exports = {
    SETTINGS,
    GLOBAL_CONFIG  // Export global config for use in other files
};
