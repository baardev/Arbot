const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

// Add Chai matchers
const chai = require("chai");
const { solidity } = require("ethereum-waffle");
chai.use(solidity);

describe("ArbitrageFlashLoan", function () {
    async function deployFixture() {
        const [owner, addr1] = await ethers.getSigners();

        console.log("Deploying contracts with owner:", owner.address);

        // Deploy mock tokens
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const mockUSDC = await MockERC20.deploy("Mock USDC", "mUSDC", 6);
        const mockWETH = await MockERC20.deploy("Mock WETH", "mWETH", 18);
        await mockUSDC.deployed();
        await mockWETH.deployed();

        console.log("MockUSDC deployed at:", mockUSDC.address);
        console.log("MockWETH deployed at:", mockWETH.address);

        // Deploy mock addresses provider
        const MockAddressesProvider = await ethers.getContractFactory("MockAddressesProvider");
        const mockAddressesProvider = await MockAddressesProvider.deploy();
        await mockAddressesProvider.deployed();

        const poolAddress = await mockAddressesProvider.getPool();
        const pool = await ethers.getContractAt("MockPool", poolAddress);

        console.log("MockAddressesProvider deployed at:", mockAddressesProvider.address);
        console.log("Pool address:", poolAddress);

        // Setup initial amounts
        const USDC_DECIMALS = 6;
        const WETH_DECIMALS = 18;
        const USDC_AMOUNT = ethers.utils.parseUnits("1000", USDC_DECIMALS);
        const WETH_AMOUNT = ethers.utils.parseUnits("1000", WETH_DECIMALS);

        // Mint initial tokens to owner
        await mockUSDC.mint(owner.address, USDC_AMOUNT.mul(10));
        await mockWETH.mint(owner.address, WETH_AMOUNT.mul(10));

        console.log("Initial token balances:");
        console.log("Owner USDC:", (await mockUSDC.balanceOf(owner.address)).toString());
        console.log("Owner WETH:", (await mockWETH.balanceOf(owner.address)).toString());

        // Setup pool reserves
        await mockUSDC.connect(owner).approve(poolAddress, ethers.constants.MaxUint256);
        await mockWETH.connect(owner).approve(poolAddress, ethers.constants.MaxUint256);

        console.log("Adding reserves to pool...");
        await pool.addReserves(mockUSDC.address, USDC_AMOUNT);
        await pool.addReserves(mockWETH.address, WETH_AMOUNT);

        console.log("Pool balances after adding reserves:");
        console.log("Pool USDC:", (await mockUSDC.balanceOf(poolAddress)).toString());
        console.log("Pool WETH:", (await mockWETH.balanceOf(poolAddress)).toString());

        // Deploy mock routers
        const MockRouter = await ethers.getContractFactory("MockRouter");
        const quickswapRouter = await MockRouter.deploy();
        const sushiswapRouter = await MockRouter.deploy();
        await quickswapRouter.deployed();
        await sushiswapRouter.deployed();

        // Deploy FlashLoan contract
        const FlashLoan = await ethers.getContractFactory("ArbitrageFlashLoan");
        const flashLoan = await FlashLoan.deploy(
            mockAddressesProvider.address,
            quickswapRouter.address,
            sushiswapRouter.address
        );
        await flashLoan.deployed();

        // Setup exchange rates
        const RATE_MULTIPLIER = ethers.utils.parseEther("1");
        await quickswapRouter.setRate(mockUSDC.address, mockWETH.address, RATE_MULTIPLIER.mul(3));
        await quickswapRouter.setRate(mockWETH.address, mockUSDC.address, RATE_MULTIPLIER.div(3));
        await sushiswapRouter.setRate(mockUSDC.address, mockWETH.address, RATE_MULTIPLIER.mul(2));
        await sushiswapRouter.setRate(mockWETH.address, mockUSDC.address, RATE_MULTIPLIER.mul(4).div(10));

        // Setup router liquidity
        await mockUSDC.connect(owner).transfer(quickswapRouter.address, USDC_AMOUNT);
        await mockWETH.connect(owner).transfer(quickswapRouter.address, WETH_AMOUNT);
        await mockUSDC.connect(owner).transfer(sushiswapRouter.address, USDC_AMOUNT);
        await mockWETH.connect(owner).transfer(sushiswapRouter.address, WETH_AMOUNT);

        // Setup approvals
        await mockUSDC.connect(owner).approve(flashLoan.address, ethers.constants.MaxUint256);
        await mockWETH.connect(owner).approve(flashLoan.address, ethers.constants.MaxUint256);
        await flashLoan.connect(owner).approveToken(mockUSDC.address, poolAddress);
        await flashLoan.connect(owner).approveToken(mockWETH.address, poolAddress);
        await flashLoan.connect(owner).approveToken(mockUSDC.address, quickswapRouter.address);
        await flashLoan.connect(owner).approveToken(mockWETH.address, quickswapRouter.address);
        await flashLoan.connect(owner).approveToken(mockUSDC.address, sushiswapRouter.address);
        await flashLoan.connect(owner).approveToken(mockWETH.address, sushiswapRouter.address);

        // Update test amounts (using much smaller amount)
        const testAmount = ethers.utils.parseUnits("10", USDC_DECIMALS);

        return {
            flashLoan,
            mockAddressesProvider,
            mockUSDC,
            mockWETH,
            quickswapRouter,
            sushiswapRouter,
            poolAddress,
            owner,
            addr1,
            pool,
            testAmount,
            USDC_DECIMALS,
            WETH_DECIMALS
        };
    }

    describe("Deployment", function () {
        it("Should set the right owner", async function () {
            const { flashLoan, owner } = await loadFixture(deployFixture);
            expect(await flashLoan.owner()).to.equal(owner.address);
        });

        it("Should set the correct addresses provider", async function () {
            const { flashLoan, mockAddressesProvider } = await loadFixture(deployFixture);
            expect(await flashLoan.ADDRESSES_PROVIDER()).to.equal(mockAddressesProvider.address);
        });
    });

    describe("Access Control", function () {
        it("Should only allow owner to request flash loan", async function () {
            const { flashLoan, addr1, mockUSDC, mockWETH, testAmount } = await loadFixture(deployFixture);
            await expect(
                flashLoan.connect(addr1).requestFlashLoan(mockUSDC.address, mockWETH.address, testAmount)
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("Should allow owner to request flash loan", async function () {
            const { flashLoan, owner, mockUSDC, mockWETH, testAmount } = await loadFixture(deployFixture);
            await expect(
                flashLoan.connect(owner).requestFlashLoan(mockUSDC.address, mockWETH.address, testAmount)
            ).to.emit(flashLoan, "FlashLoanInitiated")
             .withArgs(mockUSDC.address, testAmount);
        });
    });

    describe("Token Operations", function () {
        it("Should return correct token balance", async function () {
            const { flashLoan, mockUSDC } = await loadFixture(deployFixture);
            expect(await flashLoan.getTokenBalance(mockUSDC.address)).to.equal(0);
        });

        it("Should revert on invalid token address", async function () {
            const { flashLoan } = await loadFixture(deployFixture);
            await expect(
                flashLoan.getTokenBalance(ethers.constants.AddressZero)
            ).to.be.revertedWith("Invalid token address");
        });

        it("Should return correct non-zero balance", async function () {
            const { flashLoan, mockUSDC, owner } = await loadFixture(deployFixture);
            const amount = ethers.utils.parseUnits("100", 6);
            await mockUSDC.mint(flashLoan.address, amount);
            expect(await flashLoan.getTokenBalance(mockUSDC.address)).to.equal(amount);
        });
    });

    describe("Arbitrage Operations", function () {
        it("Should revert flash loan with zero amount", async function () {
            const { flashLoan, owner, mockUSDC, mockWETH } = await loadFixture(deployFixture);
            await expect(
                flashLoan.connect(owner).requestFlashLoan(mockUSDC.address, mockWETH.address, 0)
            ).to.be.revertedWith("Amount must be greater than 0");
        });

        it("Should revert flash loan with invalid token addresses", async function () {
            const { flashLoan, owner } = await loadFixture(deployFixture);
            await expect(
                flashLoan.connect(owner).requestFlashLoan(ethers.constants.AddressZero, ethers.constants.AddressZero, 100)
            ).to.be.revertedWith("Invalid token address");
        });

        it("Should execute flash loan successfully", async function () {
            const { flashLoan, owner, mockUSDC, mockWETH, testAmount } = await loadFixture(deployFixture);
            await expect(
                flashLoan.connect(owner).requestFlashLoan(mockUSDC.address, mockWETH.address, testAmount)
            ).to.emit(flashLoan, "FlashLoanInitiated")
             .withArgs(mockUSDC.address, testAmount);
        });

        it("Should execute arbitrage with profit", async function () {
            const { flashLoan, owner, mockUSDC, mockWETH, testAmount } = await loadFixture(deployFixture);

            // Approve tokens for the mock profit transfer
            await mockUSDC.connect(owner).approve(flashLoan.address, ethers.constants.MaxUint256);

            await expect(
                flashLoan.connect(owner).requestFlashLoan(mockUSDC.address, mockWETH.address, testAmount)
            ).to.emit(flashLoan, "ArbitrageSuccessful")
             .withArgs(100); // Use the actual value instead of accessing constant
        });

        it("Should fail arbitrage with insufficient profit", async function () {
            const { flashLoan, owner, mockUSDC, mockWETH } = await loadFixture(deployFixture);
            const largeAmount = ethers.utils.parseUnits("1000", 6);
            await expect(
                flashLoan.connect(owner).requestFlashLoan(mockUSDC.address, mockWETH.address, largeAmount)
            ).to.be.revertedWith("Insufficient profit to cover premium");
        });
    });

    describe("Flash Loan Callback", function () {
        it("Should only allow AAVE pool to call executeOperation", async function () {
            const { flashLoan, owner, mockUSDC } = await loadFixture(deployFixture);
            await expect(
                flashLoan.connect(owner).executeOperation(
                    mockUSDC.address,
                    100,
                    1,
                    owner.address,
                    []
                )
            ).to.be.revertedWith("Only AAVE pool can call this");
        });

        it("Should execute callback successfully", async function () {
            const { flashLoan, owner, mockUSDC, mockWETH, testAmount } = await loadFixture(deployFixture);
            await expect(
                flashLoan.connect(owner).requestFlashLoan(mockUSDC.address, mockWETH.address, testAmount)
            ).to.emit(flashLoan, "ArbitrageExecuted")
             .withArgs(true);
        });
    });

    describe("Emergency Functions", function () {
        it("Should allow owner to withdraw specific amount of tokens", async function () {
            const { flashLoan, mockUSDC, owner } = await loadFixture(deployFixture);
            const amount = ethers.utils.parseUnits("100", 6);
            await mockUSDC.mint(flashLoan.address, amount);

            await expect(() =>
                flashLoan.connect(owner).withdrawToken(mockUSDC.address, amount)
            ).to.changeTokenBalance(mockUSDC, owner, amount);
        });

        it("Should allow owner to withdraw all tokens", async function () {
            const { flashLoan, mockUSDC, owner } = await loadFixture(deployFixture);
            const amount = ethers.utils.parseUnits("100", 6);
            await mockUSDC.mint(flashLoan.address, amount);

            await expect(() =>
                flashLoan.connect(owner).withdrawAllToken(mockUSDC.address)
            ).to.changeTokenBalance(mockUSDC, owner, amount);
        });

        it("Should prevent non-owners from withdrawing tokens", async function () {
            const { flashLoan, mockUSDC, addr1 } = await loadFixture(deployFixture);
            await expect(
                flashLoan.connect(addr1).withdrawToken(mockUSDC.address, 100)
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });
    });
});
