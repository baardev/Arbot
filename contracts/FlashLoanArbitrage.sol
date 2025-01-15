// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./utils/Withdrawable.sol";
import "./interfaces/IUniswapV2Router02.sol";
import "./interfaces/IUniswapV2Pair.sol";

contract FlashLoanArbitrage is Withdrawable {
    address public immutable quickswapRouter;
    address public immutable sushiswapRouter;
    address public immutable WETH;
    address public immutable USDC;

    event ArbitrageExecuted(uint256 profit, uint256 timestamp);

    constructor(
        address _quickswapRouter,
        address _sushiswapRouter,
        address _weth,
        address _usdc
    ) {
        quickswapRouter = _quickswapRouter;
        sushiswapRouter = _sushiswapRouter;
        WETH = _weth;
        USDC = _usdc;

        // Approve routers
        IERC20(WETH).approve(_quickswapRouter, type(uint256).max);
        IERC20(USDC).approve(_quickswapRouter, type(uint256).max);
        IERC20(WETH).approve(_sushiswapRouter, type(uint256).max);
        IERC20(USDC).approve(_sushiswapRouter, type(uint256).max);
    }

    function uniswapV2Call(
        address sender,
        uint256 amount0,
        uint256 amount1,
        bytes calldata data
    ) external {
        require(sender == owner(), "Unauthorized");

        // Get borrowed amount
        uint256 borrowedAmount = amount0 > 0 ? amount0 : amount1;

        // Decode flash swap data
        (/* address sourceRouter */, address targetRouter, uint256 profitBasisPoints) =
            abi.decode(data, (address, address, uint256));

        // Get token addresses
        address token0 = IUniswapV2Pair(msg.sender).token0();
        address token1 = IUniswapV2Pair(msg.sender).token1();

        // Determine which token we borrowed
        address borrowedToken = amount0 > 0 ? token0 : token1;
        address otherToken = amount0 > 0 ? token1 : token0;

        // Setup path for swap
        address[] memory path = new address[](2);
        path[0] = borrowedToken;
        path[1] = otherToken;

        // Calculate minimum amount out with slippage
        uint256 minAmountOut = borrowedAmount * (10000 + profitBasisPoints) / 10000;

        // Execute arbitrage swap
        IUniswapV2Router02(targetRouter).swapExactTokensForTokens(
            borrowedAmount,
            minAmountOut,
            path,
            address(this),
            block.timestamp
        );

        // Calculate fee
        uint256 fee = (borrowedAmount * 3) / 1000; // 0.3% fee
        uint256 repayAmount = borrowedAmount + fee;

        // Ensure we have enough to repay
        require(
            IERC20(borrowedToken).balanceOf(address(this)) >= repayAmount,
            "Insufficient balance for repayment"
        );

        // Approve and repay
        IERC20(borrowedToken).approve(msg.sender, repayAmount);

        // Calculate and emit profit
        uint256 profit = IERC20(borrowedToken).balanceOf(address(this)) - repayAmount;
        emit ArbitrageExecuted(profit, block.timestamp);
    }

    receive() external payable {}
}
