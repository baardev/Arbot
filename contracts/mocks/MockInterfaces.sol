// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "hardhat/console.sol";
import "./MockERC20.sol";

interface IPool {
    function flashLoanSimple(
        address receiverAddress,
        address asset,
        uint256 amount,
        bytes calldata params,
        uint16 referralCode
    ) external;
}

interface IPoolAddressesProvider {
    function getPool() external view returns (address);
}

interface IUniswapV2Router {
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);

    function getAmountsOut(
        uint amountIn,
        address[] calldata path
    ) external view returns (uint[] memory amounts);
}

interface IFlashLoanReceiver {
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external returns (bool);
}

contract MockPool is IPool {
    mapping(address => uint256) public reserves;

    constructor() {
        console.log("MockPool constructor called");
    }

    function addReserves(address token, uint256 amount) external {
        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        console.log("Adding reserves for token:", token);
        console.log("Amount to add:", amount);
        console.log("Balance before:", balanceBefore);

        bool success = IERC20(token).transferFrom(msg.sender, address(this), amount);
        require(success, "Transfer failed");

        uint256 balanceAfter = IERC20(token).balanceOf(address(this));
        console.log("Balance after:", balanceAfter);

        reserves[token] = balanceAfter;
        console.log("Reserves updated for token:", token);
        console.log("New reserves amount:", reserves[token]);
    }

    function approveToken(address token, address spender) external {
        console.log("Approving token:", token);
        console.log("For spender:", spender);
        IERC20(token).approve(spender, type(uint256).max);
    }

    function flashLoanSimple(
        address receiverAddress,
        address asset,
        uint256 amount,
        bytes calldata params,
        uint16 /* referralCode */
    ) external override {
        console.log("Flash loan requested");
        console.log("Asset:", asset);
        console.log("Amount:", amount);
        console.log("Current reserves:", reserves[asset]);
        console.log("Current balance:", IERC20(asset).balanceOf(address(this)));

        require(reserves[asset] >= amount, "Insufficient reserves");

        // Transfer the requested amount to the receiver
        bool success = IERC20(asset).transfer(receiverAddress, amount);
        require(success, "Transfer failed");

        reserves[asset] -= amount;

        // Calculate premium (0.09% as per AAVE)
        uint256 premium = (amount * 9) / 10000;

        // Execute operation
        success = IFlashLoanReceiver(receiverAddress).executeOperation(
            asset,
            amount,
            premium,
            msg.sender,
            params
        );
        require(success, "Flash loan execution failed");

        // Verify repayment
        success = IERC20(asset).transferFrom(receiverAddress, address(this), amount + premium);
        require(success, "Flash loan repayment failed");

        // Update reserves
        reserves[asset] += amount + premium;
    }
}

contract MockRouter is IUniswapV2Router {
    mapping(address => mapping(address => uint256)) public rates;

    function setRate(address tokenIn, address tokenOut, uint256 rate) external {
        rates[tokenIn][tokenOut] = rate;
    }

    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external override returns (uint[] memory amounts) {
        require(deadline >= block.timestamp, "Expired");
        require(path.length == 2, "Invalid path");

        amounts = new uint[](2);
        amounts[0] = amountIn;

        uint256 rate = rates[path[0]][path[1]];
        if (rate == 0) rate = 2e18; // Default 2x rate

        amounts[1] = (amountIn * rate) / 1e18;
        require(amounts[1] >= amountOutMin, "Insufficient output amount");

        // Transfer tokens
        require(
            IERC20(path[0]).transferFrom(msg.sender, address(this), amountIn),
            "Transfer in failed"
        );

        // Mint output tokens
        MockERC20(path[1]).mint(to, amounts[1]);

        return amounts;
    }

    function getAmountsOut(
        uint amountIn,
        address[] calldata path
    ) external view override returns (uint[] memory amounts) {
        require(path.length == 2, "Invalid path");

        amounts = new uint[](2);
        amounts[0] = amountIn;

        uint256 rate = rates[path[0]][path[1]];
        if (rate == 0) rate = 2e18; // Default 2x rate

        amounts[1] = (amountIn * rate) / 1e18;
    }
}

contract MockAddressesProvider is IPoolAddressesProvider {
    address public pool;

    constructor() {
        pool = address(new MockPool());
        console.log("MockPool deployed at:", pool);
    }

    function getPool() external view override returns (address) {
        return pool;
    }
}
