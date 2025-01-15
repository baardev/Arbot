const chai = require("chai");
const { ethers } = require("hardhat");

// Add chai plugins if needed
chai.use(require("chai-bignumber")(ethers.BigNumber));

// Optional: Set `expect` globally if it's missing
const { expect } = chai;

describe("Flashloan", function () {
   let flashloan;
   let owner;
   let addr1;
   let addr2;
   let poolAddress; // Define poolAddress variable
   const AAVE_POOL_PROVIDER = "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb";

   // Add test timeouts since we're forking mainnet
   this.timeout(50000);

   beforeEach(async function () {
      [owner, addr1, addr2] = await ethers.getSigners();

      const Flashloan = await ethers.getContractFactory("Flashloan");
      flashloan = await Flashloan.deploy(AAVE_POOL_PROVIDER);
      await flashloan.deployed();

      // Fetch the pool address dynamically from the AAVE pool provider
      const providerContract = await ethers.getContractAt(
         "IPoolAddressesProvider",
         AAVE_POOL_PROVIDER
      );
      poolAddress = await providerContract.getPool();
   });

   describe("Deployment", function () {
      it("Should set the right owner", async function () {
         const contractOwner = await flashloan.owner();
         expect(contractOwner).to.equal(owner.address);
      });

      it("Should set the correct AAVE pool provider", async function () {
         const provider = await flashloan.ADDRESS_PROVIDER();
         expect(provider).to.equal(AAVE_POOL_PROVIDER);
      });
   });

   describe("Basic Contract State", function () {
      it("Should have correct lending pool", async function () {
         const lendingPool = await flashloan.POOL();
         expect(lendingPool).to.be.a('string');
         expect(lendingPool).to.match(/^0x[a-fA-F0-9]{40}$/);
      });

      it("Should be able to access lending pool premium", async function () {
         const pool = await ethers.getContractAt(
            "@aave/core-v3/contracts/interfaces/IPool.sol:IPool",
            poolAddress
         );

         // Call a function to get the flash loan premium (example, adjust based on AAVE V3)
         const premium = await pool.FLASHLOAN_PREMIUM_TOTAL(); // Replace with actual method if different
         const expectedPremium = ethers.BigNumber.from("5"); // Replace with the actual expected premium value

         // Check that the premium matches the expected value
         expect(premium.eq(expectedPremium)).to.be.true;
      });
   });

   // Test the execution of a flashloan
   describe("Flashloan Execution", function () {
      it("Should execute a flashloan successfully", async function () {
         // This test will be implemented once basic contract tests pass
         expect(true).to.equal(true);
      });
   });
});
