require('dotenv').config();
const { ethers } = require('ethers');
const config = require('../config.json');

async function main() {
    // Connect to Polygon
    const provider = new ethers.providers.JsonRpcProvider('https://polygon-rpc.com');

    // Connect wallet using existing private key
    const privateKey = process.env.PRIVATE_KEY;
    // Remove '0x' prefix if present
    const cleanPrivateKey = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;

    const wallet = new ethers.Wallet(cleanPrivateKey, provider);
    console.log(`Using wallet address: ${wallet.address}\n`);

    // USDC Contract
    const USDC_ADDRESS = "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359";
    const USDC = new ethers.Contract(
        USDC_ADDRESS,
        ["function balanceOf(address) view returns (uint256)",
         "function approve(address, uint256) returns (bool)",
         "function transfer(address, uint256) returns (bool)"],
        wallet
    );

    // Check USDC balance
    const balance = await USDC.balanceOf(wallet.address);
    console.log(`Your USDC Balance: ${ethers.utils.formatUnits(balance, 6)} USDC`);

    // Amount to transfer (0.1 USDC)
    const fundAmount = ethers.utils.parseUnits("0.1", 6);

    console.log(`\nTransferring 0.1 USDC to contract...`);
    console.log(`Contract address: ${config.FLASH_LOAN.CONTRACT_ADDRESS}`);

    // Transfer USDC to contract
    const tx = await USDC.transfer(
        config.FLASH_LOAN.CONTRACT_ADDRESS,
        fundAmount,
        {
            gasLimit: 100000,
            maxFeePerGas: ethers.utils.parseUnits('100', 'gwei'),
            maxPriorityFeePerGas: ethers.utils.parseUnits('30', 'gwei')
        }
    );

    console.log(`Transaction submitted: ${tx.hash}`);
    console.log(`Check status: https://polygonscan.com/tx/${tx.hash}`);

    // Wait for confirmation
    let dots = '';
    const startTime = Date.now();

    while (true) {
        dots = dots.length >= 3 ? '' : dots + '.';
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        process.stdout.write(`\rWaiting for confirmation (${elapsed}s)${dots}   `);

        try {
            const receipt = await tx.wait();
            process.stdout.write('\rTransaction confirmed!              \n');

            // Check new balances
            const contractBalance = await USDC.balanceOf(config.FLASH_LOAN.CONTRACT_ADDRESS);
            const newWalletBalance = await USDC.balanceOf(wallet.address);

            console.log(`\nNew balances:`);
            console.log(`Contract: ${ethers.utils.formatUnits(contractBalance, 6)} USDC`);
            console.log(`Wallet: ${ethers.utils.formatUnits(newWalletBalance, 6)} USDC`);
            break;
        } catch (error) {
            if (elapsed > 120) { // 2 minute timeout
                console.log('\nTransaction taking longer than expected.');
                console.log('Please check the transaction status on Polygonscan.');
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
