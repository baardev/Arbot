// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {IFlashLoanSimpleReceiver} from '../interfaces/IFlashLoanSimpleReceiver.sol';
import {IPoolAddressesProvider} from '../interfaces/IPoolAddressesProvider.sol';
import {IPool} from '../interfaces/IPool.sol';

abstract contract FlashLoanSimpleReceiverBase is IFlashLoanSimpleReceiver {
    IPoolAddressesProvider public immutable ADDRESSES_PROVIDER;
    IPool public immutable POOL;

    constructor(address provider) {
        ADDRESSES_PROVIDER = IPoolAddressesProvider(provider);
        POOL = IPool(IPoolAddressesProvider(provider).getPool());
    }
}