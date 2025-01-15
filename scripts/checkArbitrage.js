require('dotenv').config();
const { ethers } = require('ethers');
const config = require('../config.json');

async function main() {
    // Connect to Polygon
    const provider = new ethers.providers.JsonRpcProvider('https://polygon-rpc.com');
    
    // Connect wallet
    if (!process.env.PRIVATE_KEY) {
        throw new Error('PRIVATE_KEY not found in environment variables');
    }
    const privateKey = process.env.PRIVATE_KEY.startsWith('0x') 
        ? process.env.PRIVATE_KEY.slice(2) 
        : process.env.PRIVATE_KEY;
    
    const wallet = new ethers.Wallet(privateKey, provider);
    console.log(`Using wallet address: ${wallet.address}\n`);

    // Connect to the flash loan contract
    const flashLoan = new ethers.Contract(
        config.FLASH_LOAN.CONTRACT_ADDRESS,
        [
            "function checkArbitrage(address baseToken, address targetToken, uint256 amount) view returns (uint256)",
            "function owner() view returns (address)"
        ],
        wallet
    );

    // Token addresses
    const USDC = "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359";
    const WMATIC = "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270";
    const WETH = "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619";
    
    // Test amounts
    const amounts = [
        ethers.utils.parseUnits("100", 6),   // 100 USDC
        ethers.utils.parseUnits("1000", 6),  // 1000 USDC
        ethers.utils.parseUnits("10000", 6), // 10000 USDC
    ];

    // Token pairs to check
    const pairs = [
        { base: USDC, target: WMATIC, name: "USDC/WMATIC" },
        { base: USDC, target: WETH, name: "USDC/WETH" },
    ];

    console.log("Checking arbitrage opportunities...\n");

    for (const pair of pairs) {
        console.log(`Checking ${pair.name}:`);
        for (const amount of amounts) {
            try {
                const profit = await flashLoan.checkArbitrage(pair.base, pair.target, amount);
                const amountStr = ethers.utils.formatUnits(amount, 6);
                const profitStr = ethers.utils.formatUnits(profit, 6);
                
                console.log(`  Amount: ${amountStr} USDC`);
                console.log(`  Potential profit: ${profitStr} USDC`);
                
                if (profit.gt(0)) {
                    const profitPercent = (parseFloat(profitStr) / parseFloat(amountStr)) * 100;
                    console.log(`  Profit percentage: ${profitPercent.toFixed(4)}%`);
                }
                console.log();
            } catch (error) {
                console.log(`  Error checking ${pair.name} with amount ${ethers.utils.formatUnits(amount, 6)}:`);
                console.log(`  ${error.reason || error.message}\n`);
            }
        }
    }
}

// Create logs directory if it doesn't exist
const fs = require('fs');
const path = require('path');
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

// Setup logging
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const logFile = path.join(logsDir, `arbitrage-check-${timestamp}.log`);
const logStream = fs.createWriteStream(logFile);

// Redirect console.log to both console and file
const originalConsoleLog = console.log;
console.log = function() {
    logStream.write(Array.from(arguments).join(' ') + '\n');
    originalConsoleLog.apply(console, arguments);
};

main()
    .then(() => {
        console.log(`\nDetailed logs saved to: ${logFile}`);
        logStream.end();
        process.exit(0);
    })
    .catch((error) => {
        console.error('Error:', error);
        logStream.write(`Error: ${error}\n`);
        logStream.end();
        process.exit(1);
    });
