const { ethers } = require("ethers");
const config = require("./config.json");
const chalk = require('chalk');

// Add router constants
const QUICKSWAP_ROUTER = "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff";
const SUSHISWAP_ROUTER = "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506";

const ERC20_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function balanceOf(address account) external view returns (uint256)"
];

const ROUTER_ABI = [
    "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
    "function getAmountsOut(uint amountIn, address[] memory path) external view returns (uint[] memory amounts)"
];

class TradingWallet {
    constructor(wallet, provider) {
        this.provider = provider || new ethers.providers.JsonRpcProvider(process.env.POLYGON_RPC);
        this.wallet = wallet || new ethers.Wallet(process.env.PRIVATE_KEY, this.provider);

        // Initialize routers
        this.routers = {
            'QuickSwap': new ethers.Contract(QUICKSWAP_ROUTER, ROUTER_ABI, this.wallet),
            'SushiSwap': new ethers.Contract(SUSHISWAP_ROUTER, ROUTER_ABI, this.wallet)
        };
    }

    async checkAndApproveToken(tokenAddress, spenderAddress, amount) {
        try {
            const token = new ethers.Contract(tokenAddress, ERC20_ABI, this.wallet);

            // Check current allowance
            const currentAllowance = await token.allowance(this.wallet.address, spenderAddress);

            // Check if we need to approve
            if (currentAllowance.lt(amount)) {
                console.log(chalk.yellow(`\nApproving ${spenderAddress} to spend tokens...`));

                // Get current gas price and add 20% for faster processing
                const gasPrice = await this.provider.getGasPrice();
                const adjustedGasPrice = gasPrice.mul(120).div(100);

                // Approve max uint256
                const maxUint256 = ethers.constants.MaxUint256;
                const approveTx = await token.approve(spenderAddress, maxUint256, {
                    gasLimit: 100000,  // Specific gas limit for approvals
                    gasPrice: adjustedGasPrice
                });

                console.log(chalk.yellow(`Approval transaction submitted: ${approveTx.hash}`));
                console.log(chalk.yellow(`Waiting for approval transaction...`));

                // Wait for transaction with timeout
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Approval transaction timeout')), 60000); // 60 second timeout
                });

                const receiptPromise = approveTx.wait();

                try {
                    const receipt = await Promise.race([receiptPromise, timeoutPromise]);

                    if (!receipt.status) {
                        throw new Error('Approval transaction failed');
                    }

                    console.log(chalk.green(`Token approved successfully! Gas used: ${receipt.gasUsed.toString()}`));
                    // Wait a few seconds after approval before proceeding
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    return true;
                } catch (error) {
                    if (error.message === 'Approval transaction timeout') {
                        console.error(chalk.red(`Approval transaction timed out after 60 seconds`));
                        console.error(chalk.yellow(`You can check the transaction status here:`));
                        console.error(chalk.yellow(`https://polygonscan.com/tx/${approveTx.hash}`));
                    }
                    throw error;
                }
            } else {
                console.log(chalk.green(`Token already approved!`));
                return true;
            }
        } catch (error) {
            console.error(chalk.red(`Error in token approval:`, error.message));
            throw error;
        }
    }

    async swapExactTokensForTokens(dex, amountIn, token0, token1, maxSlippage) {
        try {
            const router = this.routers[dex];
            if (!router) {
                throw new Error(`Router not found for ${dex}`);
            }

            // Round the amount to the appropriate number of decimals
            const roundedAmount = Math.floor(amountIn * Math.pow(10, token0.decimals)) / Math.pow(10, token0.decimals);

            // Convert to string to avoid scientific notation
            const amountInString = roundedAmount.toLocaleString('fullwide', {
                useGrouping: false,
                maximumFractionDigits: token0.decimals
            });

            // First approve the router to spend tokens
            await this.checkAndApproveToken(
                token0.address,
                router.address,
                ethers.utils.parseUnits(amountInString, token0.decimals)
            );

            // Convert amount to BigNumber with proper decimal precision
            const amountInWei = ethers.utils.parseUnits(amountInString, token0.decimals);

            // Check token balance
            const token = new ethers.Contract(token0.address, ERC20_ABI, this.wallet);
            const balance = await token.balanceOf(this.wallet.address);
            if (balance.lt(amountInWei)) {
                throw new Error(`Insufficient ${token0.symbol} balance. Have: ${ethers.utils.formatUnits(balance, token0.decimals)}, Need: ${amountInString}`);
            }

            // Get expected output amount
            const path = [token0.address, token1.address];
            const amounts = await router.getAmountsOut(amountInWei, path);

            // Calculate minimum amount out with slippage
            const amountOutMin = amounts[1].mul(1000 - maxSlippage * 10).div(1000);

            console.log(chalk.yellow(`\nSwapping on ${dex}:`));
            console.log(chalk.yellow(`Input Token: ${token0.symbol} (${token0.decimals} decimals)`));
            console.log(chalk.yellow(`Output Token: ${token1.symbol} (${token1.decimals} decimals)`));
            console.log(chalk.yellow(`Amount In: ${amountInString} ${token0.symbol}`));
            console.log(chalk.yellow(`Min Amount Out: ${ethers.utils.formatUnits(amountOutMin, token1.decimals)} ${token1.symbol}`));

            // Prepare transaction
            const deadline = Math.floor(Date.now() / 1000) + 300; // 5 minutes

            // Get current gas price
            const gasPrice = await this.provider.getGasPrice();
            const adjustedGasPrice = gasPrice.mul(120).div(100); // Add 20% to gas price

            console.log(chalk.yellow(`Gas Price: ${ethers.utils.formatUnits(adjustedGasPrice, 'gwei')} Gwei`));

            const tx = await router.swapExactTokensForTokens(
                amountInWei,
                amountOutMin,
                path,
                this.wallet.address,
                deadline,
                {
                    gasLimit: config.TRADING.GAS_LIMIT,
                    gasPrice: adjustedGasPrice
                }
            );

            return tx;
        } catch (error) {
            console.error(chalk.red(`Swap failed on ${dex}:`, error.message));
            if (error.message.includes('fractional component exceeds decimals')) {
                console.error(chalk.red('This error occurs when trying to use more decimal places than the token allows.'));
                console.error(chalk.yellow(`Token ${token0.symbol} allows ${token0.decimals} decimals.`));
            }
            throw error;
        }
    }

    async checkBalance() {
        try {
            const balance = await this.wallet.getBalance();
            const maticBalance = ethers.utils.formatEther(balance);
            console.log(chalk.blue(`Wallet Balance: ${maticBalance} MATIC`));
            return balance;
        } catch (error) {
            console.error(chalk.red("Error checking balance:", error.message));
            throw error;
        }
    }

    async calculateTransactionCost(receipt) {
        const gasUsed = receipt.gasUsed;
        const gasPrice = receipt.effectiveGasPrice;
        const costInMatic = gasUsed.mul(gasPrice);
        const maticPrice = await this.getMaticPrice(); // We'll need to implement this
        const costInUSD = ethers.utils.formatEther(costInMatic) * maticPrice;
        return costInUSD;
    }

    async analyzeSwapResult(receipt, token, initialBalance, isBuy) {
        try {
            const tokenContract = new ethers.Contract(token.address, ERC20_ABI, this.wallet);
            const finalBalance = await tokenContract.balanceOf(this.wallet.address);
            const balanceChange = finalBalance.sub(initialBalance);
            const formattedChange = ethers.utils.formatUnits(balanceChange, token.decimals);
            const gasCostUSD = await this.calculateTransactionCost(receipt);

            return {
                tokenChange: formattedChange,
                gasCostUSD: gasCostUSD,
                success: receipt.status === 1,
                type: isBuy ? 'BUY' : 'SELL'
            };
        } catch (error) {
            console.error(chalk.red('Error analyzing swap result:', error.message));
            throw error;
        }
    }

    async checkTokenBalance(tokenAddress, symbol, decimals) {
        try {
            const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, this.wallet);
            const balance = await tokenContract.balanceOf(this.wallet.address);
            const formattedBalance = ethers.utils.formatUnits(balance, decimals);
            console.log(chalk.blue(`${symbol} Balance: ${formattedBalance}`));
            return balance;
        } catch (error) {
            console.error(chalk.red(`Error checking ${symbol} balance:`, error.message));
            throw error;
        }
    }

    async displayAllBalances() {
        console.log(chalk.yellow('\n=== Wallet Balances ==='));
        console.log(chalk.yellow('Address:', this.wallet.address));

        // Check MATIC balance
        const maticBalance = await this.wallet.getBalance();
        console.log(chalk.blue(`MATIC Balance: ${ethers.utils.formatEther(maticBalance)}`));

        // Check USDC balance
        await this.checkTokenBalance(
            config.TOKENS.USDC.address,
            'USDC',
            config.TOKENS.USDC.decimals
        );

        // Check USDT balance if configured
        if (config.TOKENS.USDT) {
            await this.checkTokenBalance(
                config.TOKENS.USDT.address,
                'USDT',
                config.TOKENS.USDT.decimals
            );
        }

        console.log(chalk.yellow('=====================\n'));
    }

    async executeTrade(params) {
        const {
            buyDex,
            sellDex,
            amount,
            token0,
            token1,
            maxSlippage = 0.5
        } = params;

        try {
            // Display balances before trade
            await this.displayAllBalances();

            console.log(chalk.yellow('\n=== Starting Trade Execution ==='));
            console.log(chalk.yellow(`Trade Path: ${token0.symbol} -> ${token1.symbol} -> ${token0.symbol}`));

            // Record initial balances
            const token0Contract = new ethers.Contract(token0.address, ERC20_ABI, this.wallet);
            const token1Contract = new ethers.Contract(token1.address, ERC20_ABI, this.wallet);
            const initialToken0Balance = await token0Contract.balanceOf(this.wallet.address);

            // Execute buy transaction
            const buyTx = await this.swapExactTokensForTokens(
                buyDex,
                amount,
                token0,
                token1,
                maxSlippage
            );

            console.log(chalk.green(`Buy transaction submitted: ${buyTx.hash}`));
            const buyReceipt = await buyTx.wait();

            // Analyze buy results
            const token1BalanceAfterBuy = await token1Contract.balanceOf(this.wallet.address);
            const buyAnalysis = await this.analyzeSwapResult(
                buyReceipt,
                token1,
                await token1Contract.balanceOf(this.wallet.address),
                true
            );

            // Execute sell transaction
            const sellTx = await this.swapExactTokensForTokens(
                sellDex,
                buyAnalysis.tokenChange, // Use actual received amount
                token1,
                token0,
                maxSlippage
            );

            console.log(chalk.green(`Sell transaction submitted: ${sellTx.hash}`));
            const sellReceipt = await sellTx.wait();

            // Analyze sell results
            const finalToken0Balance = await token0Contract.balanceOf(this.wallet.address);
            const sellAnalysis = await this.analyzeSwapResult(
                sellReceipt,
                token0,
                initialToken0Balance,
                false
            );

            // Calculate total profit/loss
            const totalGasCost = buyAnalysis.gasCostUSD + sellAnalysis.gasCostUSD;
            const token0Change = ethers.utils.formatUnits(
                finalToken0Balance.sub(initialToken0Balance),
                token0.decimals
            );

            console.log(chalk.green('\n=== Trade Summary ==='));
            console.log(chalk.yellow(`Initial ${token0.symbol}: ${ethers.utils.formatUnits(initialToken0Balance, token0.decimals)}`));
            console.log(chalk.yellow(`Final ${token0.symbol}: ${ethers.utils.formatUnits(finalToken0Balance, token0.decimals)}`));
            console.log(chalk.yellow(`${token0.symbol} Change: ${token0Change}`));
            console.log(chalk.yellow(`Total Gas Cost: $${totalGasCost.toFixed(4)}`));

            const profitUSD = parseFloat(token0Change) - totalGasCost;
            console.log(chalk[profitUSD >= 0 ? 'green' : 'red'](
                `Net Profit/Loss: $${profitUSD.toFixed(4)}`
            ));

            return {
                status: 'success',
                buyTx: buyTx.hash,
                sellTx: sellTx.hash,
                buyGasUsed: buyReceipt.gasUsed.toString(),
                sellGasUsed: sellReceipt.gasUsed.toString(),
                totalGasCost,
                profitUSD,
                token0Change
            };

        } catch (error) {
            console.error(chalk.red("Trade execution failed:", error.message));
            return {
                status: 'failed',
                error: error.message
            };
        }
    }

    async executeFlashLoan(params) {
        const {
            buyDex,
            sellDex,
            amount,
            token0,
            token1,
            maxSlippage = 0.5
        } = params;

        try {
            console.log(chalk.yellow('\n=== Executing Flash Loan Trade ==='));
            console.log(chalk.yellow(`Amount: ${amount} ${token0.symbol}`));
            console.log(chalk.yellow(`Path: ${buyDex} -> ${sellDex}`));

            // Flash loan contract address (add to your config)
            const flashLoanContract = new ethers.Contract(
                config.FLASH_LOAN.CONTRACT_ADDRESS,
                config.FLASH_LOAN.ABI,
                this.wallet
            );

            const gasPrice = await this.provider.getGasPrice();
            const adjustedGasPrice = gasPrice.mul(120).div(100); // 20% more

            const tx = await flashLoanContract.executeOperation(
                token0.address,
                ethers.utils.parseUnits(amount.toString(), token0.decimals),
                buyDex,
                sellDex,
                token1.address,
                {
                    gasLimit: config.TRADING.GAS_LIMIT,
                    gasPrice: adjustedGasPrice
                }
            );

            console.log(chalk.green(`Flash loan transaction submitted: ${tx.hash}`));
            const receipt = await tx.wait();

            if (receipt.status === 1) {
                console.log(chalk.green('Flash loan executed successfully! ✅'));
                return {
                    status: 'success',
                    transactionHash: tx.hash,
                    gasUsed: receipt.gasUsed.toString()
                };
            } else {
                throw new Error('Flash loan transaction failed');
            }

        } catch (error) {
            console.error(chalk.red("Flash loan execution failed:", error.message));
            return {
                status: 'failed',
                error: error.message
            };
        }
    }

    // Helper function to get MATIC price
    async getMaticPrice() {
        try {
            // Using QuickSwap MATIC/USDC pair for price
            const maticUsdcPair = new ethers.Contract(
                config.MATIC_USDC_PAIR,  // Add this to your config
                [
                    'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)'
                ],
                this.provider
            );

            const reserves = await maticUsdcPair.getReserves();
            const maticPrice = (reserves[1] / 1e6) / (reserves[0] / 1e18);
            return maticPrice;
        } catch (error) {
            console.error(chalk.red('Error getting MATIC price:', error.message));
            return 1; // Fallback price
        }
    }

    async testFlashLoan() {
        try {
            console.log(chalk.yellow('\n=== Testing Flash Loan Contract ==='));

            // Create contract instance
            const flashLoanContract = new ethers.Contract(
                config.FLASH_LOAN.CONTRACT_ADDRESS,
                [
                    "function requestFlashLoan(address token, uint256 amount) public",
                    "function owner() public view returns (address)"
                ],
                this.wallet
            );

            // Verify we're the owner
            const contractOwner = await flashLoanContract.owner();
            console.log(chalk.blue(`Contract owner: ${contractOwner}`));
            console.log(chalk.blue(`Wallet address: ${this.wallet.address}`));

            // Test with a small amount of USDC
            const usdcAddress = config.TOKENS.USDC.address;
            const amount = ethers.utils.parseUnits("1000", 6); // 1000 USDC

            console.log(chalk.yellow(`\nRequesting flash loan of 1000 USDC...`));

            const tx = await flashLoanContract.requestFlashLoan(
                usdcAddress,
                amount,
                {
                    gasLimit: 500000,
                    gasPrice: await this.provider.getGasPrice()
                }
            );

            console.log(chalk.green(`Flash loan request submitted: ${tx.hash}`));
            console.log(chalk.yellow(`Waiting for transaction confirmation...`));

            const receipt = await tx.wait();

            if (receipt.status === 1) {
                console.log(chalk.green(`\nFlash loan executed successfully! ✅`));
                console.log(chalk.blue(`Gas used: ${receipt.gasUsed.toString()}`));
            } else {
                console.log(chalk.red(`\nFlash loan failed! ❌`));
            }

            return receipt;

        } catch (error) {
            console.error(chalk.red(`\nError testing flash loan:`, error.message));
            throw error;
        }
    }
}

module.exports = TradingWallet;
