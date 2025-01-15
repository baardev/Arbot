// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@aave/core-v3/contracts/flashloan/base/FlashLoanSimpleReceiverBase.sol";
import "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import "@aave/core-v3/contracts/interfaces/IPool.sol";

// QuickSwap/UniswapV2 Router interface
interface IQuickSwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external returns (uint256 amountOut);
    function quoteExactInputSingle(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint160 sqrtPriceLimitX96
    ) external returns (uint256 amountOut);
}

contract FlashLoanReceiver is FlashLoanSimpleReceiverBase, Ownable {
    using SafeERC20 for IERC20;

    event FlashLoanRequested(address asset, uint256 amount);
    event FlashLoanReceived(address asset, uint256 amount, uint256 premium);
    event SwapExecuted(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut);
    event RepaymentApproved(address asset, uint256 amount);
    event DebugLog(string message, uint256 value);
    event ErrorLog(string message);

    constructor(address _addressProvider)
        FlashLoanSimpleReceiverBase(IPoolAddressesProvider(_addressProvider))
        Ownable(msg.sender)
    {}

    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address /* initiator */,
        bytes calldata params
    ) external override returns (bool) {
        // Decode params
        (address tokenOut, address router, uint24 fee) = abi.decode(params, (address, address, uint24));

        emit FlashLoanReceived(asset, amount, premium);
        emit DebugLog("Fee", fee);

        // Calculate amounts
        uint256 amountToRepay = amount + premium;
        uint256 amountToSwap = amount;

        emit DebugLog("Amount to swap", amountToSwap);
        emit DebugLog("Amount to repay", amountToRepay);

        // Execute first swap
        uint256 swapResult = _executeSwaps(asset, tokenOut, amountToSwap, router, fee);
        emit DebugLog("First swap result", swapResult);

        // Execute reverse swap
        uint256 finalAmount = _executeSwaps(tokenOut, asset, swapResult, router, fee);
        emit DebugLog("Final amount", finalAmount);

        // Verify we have enough to repay
        require(finalAmount >= amountToRepay, "Insufficient funds to repay flash loan");

        // Approve repayment
        IERC20(asset).approve(msg.sender, 0);
        IERC20(asset).approve(msg.sender, amountToRepay);
        emit RepaymentApproved(asset, amountToRepay);

        return true;
    }

    function requestFlashLoan(
        address token,
        uint256 amount,
        bytes calldata params
    ) external {
        require(amount > 0, "Amount must be greater than 0");
        emit FlashLoanRequested(token, amount);

        POOL.flashLoanSimple(
            address(this),
            token,
            amount,
            params,
            0
        );
    }

    function _executeSwaps(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        address router,
        uint24 fee
    ) internal returns (uint256) {
        // Add debug logs
        emit DebugLog("Starting swap execution", amountIn);

        // Get token interface
        IERC20 token = IERC20(tokenIn);

        // Reset approval
        token.approve(router, 0);
        // Set new approval
        token.approve(router, amountIn);
        emit DebugLog("Router approval granted", amountIn);

        // Get expected amount out
        uint256 expectedAmountOut = IQuickSwapRouter(router).quoteExactInputSingle(
            tokenIn,
            tokenOut,
            fee,
            amountIn,
            0
        );
        emit DebugLog("Expected amount out", expectedAmountOut);

        // Set minimum amount out with 1% slippage tolerance
        uint256 minAmountOut = (expectedAmountOut * 99) / 100;
        emit DebugLog("Minimum amount out", minAmountOut);

        // Execute the swap
        uint256 amountOut = IQuickSwapRouter(router).exactInputSingle(
            IQuickSwapRouter.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: fee,
                recipient: address(this),
                deadline: block.timestamp + 300,
                amountIn: amountIn,
                amountOutMinimum: minAmountOut,
                sqrtPriceLimitX96: 0
            })
        );

        emit SwapExecuted(tokenIn, tokenOut, amountIn, amountOut);
        return amountOut;
    }

    function withdraw(address token) external onlyOwner {
        IERC20 tokenContract = IERC20(token);
        uint256 balance = tokenContract.balanceOf(address(this));
        require(balance > 0, "No tokens to withdraw");
        tokenContract.transfer(msg.sender, balance);
    }

    function approveToken(address token, address spender, uint256 amount) external onlyOwner {
        IERC20(token).approve(spender, amount);
    }
}