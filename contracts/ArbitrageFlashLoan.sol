// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IUniswapV2Router02 {
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
}

contract ArbitrageFlashLoan is Ownable(msg.sender) {
    using SafeERC20 for IERC20;

    // Router addresses
    address public immutable quickswapRouter;
    address public immutable sushiswapRouter;

    // Token addresses
    address public immutable WETH;
    address public immutable USDC;

    // Events
    event ArbitrageExecuted(address asset, uint256 amount, uint256 profit);
    event TradeExecuted(address router, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut);

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
    }

    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address /* _initiator */,
        bytes calldata params
    ) external returns (bool) {
        // Decode params
        abi.decode(params, (uint256));  // Decode but ignore the value

        // Calculate amount to repay
        uint256 amountToRepay = amounts[0] + premiums[0];

        // Get token interface
        IERC20 token = IERC20(assets[0]);

        // Approve routers
        token.approve(quickswapRouter, amounts[0]);
        token.approve(sushiswapRouter, amounts[0]);

        // Set up path
        address[] memory path = new address[](2);
        path[0] = assets[0];
        path[1] = assets[0] == WETH ? USDC : WETH;

        // Execute trades
        IUniswapV2Router02(sushiswapRouter).swapExactTokensForTokens(
            amounts[0],
            0,
            path,
            address(this),
            block.timestamp
        );

        // Approve repayment
        token.approve(msg.sender, amountToRepay);

        // Calculate and emit profit
        uint256 profit = token.balanceOf(address(this)) - amountToRepay;
        emit ArbitrageExecuted(assets[0], amounts[0], profit);

        return true;
    }

    function executeArbitrage(
        address /* _asset */,
        uint256 /* _amount */,
        uint256 profitBasisPoints
    ) external pure {
        abi.encode(profitBasisPoints);
    }

    // Emergency function to approve tokens
    function approveToken(
        address token,
        address spender,
        uint256 amount
    ) external onlyOwner {
        IERC20(token).approve(spender, amount);
    }

    // Emergency function to revoke approval
    function revokeApproval(
        address token,
        address spender
    ) external onlyOwner {
        IERC20(token).approve(spender, 0);
    }

    // Function to handle direct ETH transfers
    receive() external payable {}
}