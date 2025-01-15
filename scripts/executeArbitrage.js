const { ethers } = require('hardhat');

// Add a mapping for DEX addresses to their names
const DEX_NAMES = {
    '0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32': 'QuickSwap',
    '0xc35DADB65012eC5796536bD9864eD8773aBc74C4': 'SushiSwap'
};

async function executeArbitrage(params) {
    const ERRORS = {
        26: "Insufficient output amount",
        27: "Excessive input amount",
        28: "Insufficient liquidity",
        29: "Flash loan failed"
    };

    try {
        // Calculate minimum output with 1% slippage tolerance
        const expectedOutput = params.amount.mul(103).div(100); // Expecting 3% profit
        const minOutputAmount = expectedOutput.mul(99).div(100); // 1% slippage tolerance

        // Add higher gas limit and priority
        const options = {
            gasLimit: 3000000,
            maxFeePerGas: ethers.utils.parseUnits('300', 'gwei'),
            maxPriorityFeePerGas: ethers.utils.parseUnits('50', 'gwei')
        };

        console.log('\nTransaction Parameters:');
        console.log('Flash Loan Amount:', ethers.utils.formatUnits(params.amount, 18));
        console.log('Minimum Output:', ethers.utils.formatUnits(minOutputAmount, 18));
        console.log('Gas Limit:', options.gasLimit);

        // First check if arbitrage is still profitable
        const profitCheck = await arbitrageContract.checkProfitability(
            params.buyRouter,
            params.sellRouter,
            params.token0,
            params.token1,
            params.amount
        );

        if (!profitCheck) {
            console.log('❌ Opportunity no longer profitable, aborting...');
            return;
        }

        // Execute the arbitrage
        const tx = await arbitrageContract.executeArbitrage(
            params.buyRouter,
            params.sellRouter,
            params.token0,
            params.token1,
            params.amount,
            minOutputAmount,
            options
        );

        console.log(`\n📝 Transaction submitted: ${tx.hash}`);
        console.log(`View on Polygonscan: https://polygonscan.com/tx/${tx.hash}`);

        const receipt = await tx.wait();

        if (receipt.status === 1) {
            console.log('\n✅ Transaction successful!');
            // Log actual profit
            const profitEvent = receipt.events?.find(e => e.event === 'ArbitrageExecuted');
            if (profitEvent) {
                const actualProfit = ethers.utils.formatUnits(profitEvent.args.profit, 18);
                console.log(`Actual Profit: $${actualProfit}`);
            }
        } else {
            console.log('\n❌ Transaction failed');
        }

    } catch (error) {
        console.error('\n❌ Error executing arbitrage:');

        // Handle specific error codes
        if (error.reason && error.reason.includes('26')) {
            console.log('Error: Insufficient output amount - Price moved unfavorably');
        } else if (error.reason && error.reason.includes('27')) {
            console.log('Error: Flash loan amount too high for current liquidity');
        } else if (error.reason && error.reason.includes('28')) {
            console.log('Error: Insufficient liquidity in one of the pools');
        } else if (error.reason && error.reason.includes('29')) {
            console.log('Error: Flash loan failed - Could not repay the loan');
        } else {
            console.log('Unknown error:', error.message);
        }

        // Log detailed error info for debugging
        console.log('\nDetailed Error Info:');
        console.log('Error Code:', error.code);
        console.log('Error Reason:', error.reason);
        console.log('Error Method:', error.method);

        if (error.transaction) {
            console.log('\nTransaction Details:');
            console.log('From:', error.transaction.from);
            console.log('To:', error.transaction.to);
            console.log('Value:', error.transaction.value?.toString());
        }
    }
}

module.exports = executeArbitrage;