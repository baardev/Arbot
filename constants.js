// Exchange Factory Addresses (Polygon)
const SUSHISWAP_FACTORY_ADDRESS = "0xc35DADB65012eC5796536bD9864eD8773aBc74C4";
const QUICKSWAP_FACTORY_ADDRESS = "0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32";

// Token Addresses (Polygon)
const WETH_ADDRESS = "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619";
const USDC_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const WMATIC_ADDRESS = "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270";

// Factory ABI (minimal version for getPair)
const FACTORY_ABI = [
    "function getPair(address tokenA, address tokenB) external view returns (address pair)"
];

// Default fee tiers for V3 pools
const FEE_TIERS = {
    LOW: 500,      // 0.05%
    MEDIUM: 3000,  // 0.3%
    HIGH: 10000    // 1%
};

// Gas settings
const GAS_SETTINGS = {
    maxFeePerGas: 100000000000,        // 100 gwei
    maxPriorityFeePerGas: 100000000000 // 100 gwei
};

// Minimum profit threshold in USD
const MIN_PROFIT_USD = "10"; // $10

// Block time settings
const BLOCK_TIME = 2000; // 2 seconds for Polygon

module.exports = {
    SUSHISWAP_FACTORY_ADDRESS,
    QUICKSWAP_FACTORY_ADDRESS,
    WETH_ADDRESS,
    USDC_ADDRESS,
    WMATIC_ADDRESS,
    FACTORY_ABI,
    FEE_TIERS,
    GAS_SETTINGS,
    MIN_PROFIT_USD,
    BLOCK_TIME
};