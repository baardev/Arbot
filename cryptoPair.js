const { ethers } = require("ethers");
const path = require("path");
const config = require("./config.json");
const chalk = require('chalk');

// Import ABIs
const IUniswapV2PairABI = require(path.join(__dirname, 'abis', 'IUniswapV2Pair.json'));
const IUniswapV3PoolABI = require(path.join(__dirname, 'abis', 'IUniswapV3Pool.json'));

// Define the Factory ABIs
const FACTORY_ABI = [
    "function getPair(address tokenA, address tokenB) external view returns (address pair)",
    "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)"
];

const FACTORY_ABI_V3 = [
    "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)",
    "function createPool(address tokenA, address tokenB, uint24 fee) external returns (address pool)",
    "function enableFeeAmount(uint24 fee, int24 tickSpacing) external",
    "function feeAmountTickSpacing(uint24 fee) external view returns (int24)"
];

class CryptoPair {
    constructor(protocol, provider, token0, token1, feeTier = 3000) {
        // Ensure provider is valid
        if (!provider || !provider.getNetwork) {
            throw new Error('Invalid provider. Must be an ethers provider instance.');
        }

        this.token0 = token0;
        this.token1 = token1;
        this._provider = provider;
        this.protocol = protocol;
        this.feeTier = feeTier;
        this.isV3 = protocol === 'Uniswap';
        this._pair = null;
        this._initialized = false;

        // Initialize the correct factory based on protocol
        const factoryAddress = this.isV3
            ? config.UNISWAP_V3_FACTORY
            : protocol === 'SushiSwap'
                ? config.SUSHISWAP_FACTORY_ADDRESS
                : config.QUICKSWAP_FACTORY_ADDRESS;

        console.log(chalk.green(`Initializing ${protocol} factory at ${factoryAddress}`));

        try {
            this._factory = new ethers.Contract(
                factoryAddress,
                this.isV3 ? FACTORY_ABI_V3 : FACTORY_ABI,
                this._provider
            );
        } catch (error) {
            console.error(chalk.red('Error initializing factory contract:', error));
            throw error;
        }
    }

    async initialize() {
        if (this._initialized) return;

        try {
            let pairAddress;
            if (this.isV3) {
                pairAddress = await this._factory.getPool(
                    this.token0.address,
                    this.token1.address,
                    this.feeTier
                );
            } else {
                pairAddress = await this._factory.getPair(
                    this.token0.address,
                    this.token1.address
                );
            }

            if (!pairAddress || pairAddress === ethers.constants.AddressZero) {
                throw new Error(`No pair found for ${this.token0.symbol}/${this.token1.symbol} on ${this.protocol}`);
            }

            this._pair = new ethers.Contract(
                pairAddress,
                this.isV3 ? IUniswapV3PoolABI : IUniswapV2PairABI,
                this._provider
            );

            console.log(chalk.yellow(`${this.protocol} pair initialized at ${pairAddress}`));
            this._initialized = true;
        } catch (error) {
            console.error(chalk.red(`Error initializing pair for ${this.protocol}:`, error.message));
            throw error;
        }
    }

    async getPrice() {
        if (!this._initialized) {
            await this.initialize();
        }

        try {
            if (this.isV3) {
                try {
                    const slot0 = await this._pair.slot0();
                    if (!slot0 || !slot0.sqrtPriceX96) {
                        return null;
                    }
                    const sqrtPriceX96 = slot0.sqrtPriceX96;
                    const price = (Number(sqrtPriceX96) ** 2) / (2 ** 192);

                    // Sanity check for stablecoin pairs
                    if (this.isStablePair() && (price < 0.9 || price > 1.1)) {
                        return null;
                    }

                    return price;
                } catch (error) {
                    return null;
                }
            } else {
                try {
                    const reserves = await this._pair.getReserves();
                    if (!reserves || !reserves[0] || !reserves[1]) {
                        return null;
                    }

                    // Get decimals-adjusted reserves
                    const reserve0 = Number(ethers.utils.formatUnits(reserves[0], this.token0.decimals));
                    const reserve1 = Number(ethers.utils.formatUnits(reserves[1], this.token1.decimals));

                    // Calculate price with decimal adjustment
                    const price = reserve1 / reserve0;

                    // Sanity checks
                    if (!isFinite(price) || isNaN(price) || price <= 0) {
                        return null;
                    }

                    // Stablecoin pair sanity check
                    if (this.isStablePair() && (price < 0.9 || price > 1.1)) {
                        return null;
                    }

                    // ETH pair sanity check (assuming ETH is roughly between $500 and $20000)
                    if (this.isETHPair() && (price < 500 || price > 20000)) {
                        return null;
                    }

                    return price;
                } catch (error) {
                    return null;
                }
            }
        } catch (error) {
            return null;
        }
    }

    isStablePair() {
        const stables = ['USDC', 'USDT', 'DAI'];
        return stables.includes(this.token0.symbol) && stables.includes(this.token1.symbol);
    }

    isETHPair() {
        return this.token0.symbol === 'WETH' || this.token1.symbol === 'WETH';
    }

    async getReserves() {
        if (!this._initialized) {
            await this.initialize();
        }

        try {
            if (this.isV3) {
                throw new Error("getReserves not supported for Uniswap V3");
            }
            return await this._pair.getReserves();
        } catch (error) {
            console.error(`Error getting reserves from ${this.protocol}:`, error);
            throw error;
        }
    }
}

module.exports = CryptoPair;