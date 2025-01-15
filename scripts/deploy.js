const hre = require("hardhat");

async function main() {
    const provider = new hre.ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL);

    // Get current gas price
    const feeData = await provider.getFeeData();
    const currentGasPrice = feeData.gasPrice;

    console.log("\nGas Settings:");
    console.log(`Current Gas Price: ${hre.ethers.formatUnits(currentGasPrice, 'gwei')} gwei`);

    // Add 500% for faster processing (6x current gas price)
    const increasedGasPrice = (currentGasPrice * BigInt(600)) / BigInt(100);
    console.log(`Using Gas Price: ${hre.ethers.formatUnits(increasedGasPrice, 'gwei')} gwei`);

    // Reduce gas limit since we know the contract deployment doesn't need that much
    const estimatedGas = BigInt(2000000); // reduced from 3000000
    const estimatedCost = (increasedGasPrice * estimatedGas);
    console.log(`Estimated max cost: ${hre.ethers.formatEther(estimatedCost)} MATIC`);

    // Show warning if cost is high
    if (estimatedCost > hre.ethers.parseEther("1")) {
        console.log("\n⚠️ WARNING: Deployment cost is over 1 MATIC!");
        console.log("Press Ctrl+C within 5 seconds to cancel...\n");
        // Wait 5 seconds to give time to cancel
        for(let i = 5; i > 0; i--) {
            process.stdout.write(`Continuing in ${i}...\r`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        console.log("\nProceeding with deployment...\n");
    }

    const FlashLoanReceiver = await hre.ethers.getContractFactory("FlashLoanReceiver");

    console.log("Deploying FlashLoanReceiver...");
    const flashLoanReceiver = await FlashLoanReceiver.deploy(
        "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb",  // Polygon AAVE v3 addresses provider
        {
            gasPrice: increasedGasPrice,
            gasLimit: estimatedGas,
            type: 0  // Force legacy transaction type
        }
    );

    const txHash = flashLoanReceiver.deploymentTransaction().hash;
    console.log("Deployment transaction hash:", txHash);
    console.log(`Track status: https://polygonscan.com/tx/${txHash}`);
    console.log("Waiting for deployment transaction...\n");

    const timeout = 120000; // 2 minutes
    try {
        const deployedContract = await Promise.race([
            flashLoanReceiver.waitForDeployment(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Deployment timeout after 2 minutes")), timeout)
            )
        ]);

        const address = await deployedContract.getAddress();
        console.log("\n✅ FlashLoanReceiver deployed to:", address);
        console.log("\nTo verify on Polygonscan:");
        console.log(`npx hardhat verify --network polygon ${address} "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb"`);

        // Save the address to a file for easy access
        const fs = require('fs');
        fs.writeFileSync('deployed-address.txt', address);
        console.log("\nContract address saved to deployed-address.txt");
    } catch (error) {
        if (error.message.includes("timeout")) {
            console.log("\n⚠️ Deployment is taking longer than expected.");
            console.log("You can check the transaction status at:");
            console.log(`https://polygonscan.com/tx/${txHash}`);
        } else {
            throw error;
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });