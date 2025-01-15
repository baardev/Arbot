require('dotenv').config();
const { ethers } = require('ethers');
const config = require('../config.json');

async function main() {
    const provider = new ethers.providers.JsonRpcProvider('https://polygon-rpc.com');

    // Check if private key exists
    if (!process.env.PRIVATE_KEY) {
        throw new Error('PRIVATE_KEY not found in environment variables');
    }

    // Remove '0x' prefix if present
    const privateKey = process.env.PRIVATE_KEY.startsWith('0x')
        ? process.env.PRIVATE_KEY.slice(2)
        : process.env.PRIVATE_KEY;

    const wallet = new ethers.Wallet(privateKey, provider);
    console.log('Using wallet address:', wallet.address);

    const flashLoan = new ethers.Contract(
        config.FLASH_LOAN.CONTRACT_ADDRESS,
        [
            "function owner() view returns (address)",
            "function getTokenBalance(address) view returns (uint256)",
            "function getTokenAllowance(address) view returns (uint256)"
        ],
        wallet
    );

    const USDC = "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359";

    console.log('\nChecking contract state:');
    console.log('Contract address:', config.FLASH_LOAN.CONTRACT_ADDRESS);

    try {
        const owner = await flashLoan.owner();
        console.log('Owner:', owner);

        const balance = await flashLoan.getTokenBalance(USDC);
        console.log('USDC Balance:', ethers.utils.formatUnits(balance, 6));

        const allowance = await flashLoan.getTokenAllowance(USDC);
        console.log('USDC Allowance:', ethers.utils.formatUnits(allowance, 6));
    } catch (error) {
        console.error('Error checking contract state:', error.message);
        if (error.reason) {
            console.error('Reason:', error.reason);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Script error:', error);
        process.exit(1);
    });
