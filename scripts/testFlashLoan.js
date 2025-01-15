require('dotenv').config();
const { ethers } = require("hardhat");
const { JsonRpcProvider } = require('@ethersproject/providers');
const ADDRESSES = require('../addresses.json');

// Custom provider that includes revert reasons
class CustomProvider extends JsonRpcProvider {
    async call(transaction, blockTag) {
        try {
            return await super.call(transaction, blockTag);
        } catch (error) {
            let revertData;
            if (error.data) {
                revertData = error.data;
            } else if (error.error && error.error.data) {
                revertData = error.error.data;
            }

            if (revertData) {
                const hexString = revertData.slice(10);
                const bytes = Buffer.from(hexString, 'hex');
                const reason = bytes.toString().replace(/\0/g, '');
                error.reason = reason;
            }
            throw error;
        }
    }
}

async function main() {
    try {
        const provider = new CustomProvider(process.env.POLYGON_RPC_URL);
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        console.log(`Using wallet address: ${wallet.address}\n`);

        // Initialize contracts with basic interfaces
        const flashLoanReceiver = new ethers.Contract(
            ADDRESSES.FLASH_LOAN_RECEIVER,
            [
                "function requestFlashLoan(address token, uint256 amount, bytes calldata params) external",
                "function pool() external view returns (address)",
                "function owner() external view returns (address)",
                "function initialize(address _pool) external"
            ],
            wallet
        );

        // Check contract initialization
        console.log("Checking contract state...");
        const contractOwner = await flashLoanReceiver.owner();
        console.log("Contract owner:", contractOwner);

        const pool = await flashLoanReceiver.pool();
        console.log("Current pool address:", pool);
        console.log("Expected pool address:", ADDRESSES.AAVE_V3_POOL);

        if (pool.toLowerCase() !== ADDRESSES.AAVE_V3_POOL.toLowerCase()) {
            console.log("Pool address mismatch! Attempting to initialize...");
            const tx = await flashLoanReceiver.initialize(ADDRESSES.AAVE_V3_POOL);
            await tx.wait();
            console.log("Contract initialized with correct pool address");
        }

        // Prepare flash loan parameters
        const loanAmount = ethers.parseUnits("0.1", 6); // 0.1 USDC
        const params = ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "address", "uint256"],
            [ADDRESSES.WETH, ADDRESSES.QUICKSWAP_V3_ROUTER, 3000]
        );

        console.log("\nPreparing flash loan...");
        console.log("Loan amount:", ethers.formatUnits(loanAmount, 6), "USDC");
        console.log("Using FlashLoanReceiver at:", ADDRESSES.FLASH_LOAN_RECEIVER);
        console.log("Router address:", ADDRESSES.QUICKSWAP_V3_ROUTER);

        // Prepare transaction data
        const txData = flashLoanReceiver.interface.encodeFunctionData("requestFlashLoan", [
            ADDRESSES.USDC,
            loanAmount,
            params
        ]);

        console.log("\nSimulating transaction...");
        try {
            const result = await provider.call({
                to: ADDRESSES.FLASH_LOAN_RECEIVER,
                from: wallet.address,
                data: txData,
                gasLimit: ethers.parseUnits("3000000", "wei")
            });

            console.log("Simulation successful!");

            // Execute the transaction
            const tx = await wallet.sendTransaction({
                to: ADDRESSES.FLASH_LOAN_RECEIVER,
                data: txData,
                gasLimit: ethers.parseUnits("3000000", "wei"),
                maxFeePerGas: ethers.parseUnits("50", "gwei"),
                maxPriorityFeePerGas: ethers.parseUnits("40", "gwei")
            });

            console.log("\nTransaction sent! Hash:", tx.hash);
            console.log(`Track status: https://polygonscan.com/tx/${tx.hash}`);

            const receipt = await tx.wait();
            console.log("\nTransaction confirmed in block", receipt.blockNumber);

        } catch (error) {
            console.error("Transaction failed!");
            console.error("Error message:", error.message);
            console.error("Revert reason:", error.reason || "Unknown");
            throw error;
        }

    } catch (error) {
        console.error("\nScript failed!");
        console.error("Error:", error.message);
        throw error;
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
