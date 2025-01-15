// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

interface IPoolAddressesProvider {
    function getPool() external view returns (address);
    function getPoolConfigurator() external view returns (address);
    function getMarketId() external view returns (string memory);
    function setMarketId(string calldata marketId) external;
    function getAddress(bytes32 id) external view returns (address);
}