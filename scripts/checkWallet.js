require('dotenv').config();
const { ethers } = require("hardhat");

// Common token addresses on Polygon
const TOKENS = {
    USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    WETH: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
    WMATIC: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    DAI: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063'
};

// ERC20 ABI for balanceOf and decimals
const ERC20_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)"
];

async function getTokenBalance(token, wallet, provider) {
    try {
        const contract = new ethers.Contract(token, ERC20_ABI, provider);
        const [balance, decimals, symbol] = await Promise.all([
            contract.balanceOf(wallet),
            contract.decimals(),
            contract.symbol()
        ]);
        return {
            symbol,
            balance: ethers.formatUnits(balance, decimals),
            decimals
        };
    } catch (error) {
        console.error(`Error fetching balance for token ${token}:`, error.message);
        return null;
    }
}

async function main() {
    // Get provider from hardhat's config
    const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL || "https://polygon-rpc.com");

    if (!process.env.PRIVATE_KEY) {
        throw new Error("PRIVATE_KEY not found in .env file");
    }

    // Create wallet instance
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    const address = await wallet.getAddress();

    // Get native MATIC balance
    const maticBalance = await provider.getBalance(address);

    console.log("\nWallet Information:");
    console.log("-------------------");
    console.log(`Address: ${address}`);
    console.log(`MATIC Balance: ${ethers.formatEther(maticBalance)} MATIC`);

    // Get token balances
    console.log("\nToken Balances:");
    console.log("---------------");

    for (const [name, address] of Object.entries(TOKENS)) {
        const tokenInfo = await getTokenBalance(address, wallet.address, provider);
        if (tokenInfo && parseFloat(tokenInfo.balance) > 0) {
            console.log(`${tokenInfo.symbol}: ${tokenInfo.balance}`);
        }
    }

    // Get network info
    const network = await provider.getNetwork();
    const feeData = await provider.getFeeData();

    console.log("\nNetwork Information:");
    console.log("--------------------");
    console.log(`Network: ${network.name}`);
    console.log(`Chain ID: ${network.chainId}`);
    console.log(`Gas Price: ${ethers.formatUnits(feeData.gasPrice || 0, "gwei")} gwei`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
