const ADDRESSES = {
    polygon: {
        // Token addresses
        USDC: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
        WETH: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
        WMATIC: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
        DAI: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
        USDT: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
        WBTC: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6",

        // DEX Routers
        QUICKSWAP_ROUTER: "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff",
        SUSHISWAP_ROUTER: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506",

        // DEX Factories
        QUICKSWAP_FACTORY: "0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32",
        SUSHISWAP_FACTORY: "0xc35DADB65012eC5796536bD9864eD8773aBc74C4",

        // Flash loan and arbitrage contracts
        AAVE_LENDING_POOL: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
        AAVE_ADDRESSES_PROVIDER: "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb",
        ARBITRAGE_FLASH_LOAN: "0xAAf62516c0A800D1DCDcBcc40519cA87f2F83B1E",

        // Optional: Backup providers
        BACKUP_LENDING_POOLS: [
            "0x1a13F4Ca1d028320A707D99520AbFefca3998b7F", // Aave backup
            "0x27F8D03b3a2196956ED754baDc28D73be8830A6e"  // Aave v3
        ]
    },
    localhost: {
        // Will be populated during local deployment
        USDC: "",
        WETH: "",
        WMATIC: "",
        QUICKSWAP_ROUTER: "",
        SUSHISWAP_ROUTER: "",
        QUICKSWAP_FACTORY: "",
        SUSHISWAP_FACTORY: "",
        AAVE_ADDRESSES_PROVIDER: "",
        AAVE_POOL: ""
    }
};

module.exports = ADDRESSES;
