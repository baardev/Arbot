This arbitrage bot was originally taken from git@github.com:liamgoss/Polygon_Arbitrage_Bot_REVAMPED.git which had the following README.md

# Polygon Arbitrage Bot

This code takes advantage of price discrepancies for a token pair between Quickswap, Sushiswap, and UniswapV3 on the Polygon mainnet. In order to maximize profits, these arbitrage opportunities will be exploited with the help of a flashloan from AAVE. 

You'll need to deploy your smart contract onto Polygon and take note of the ABI and contract address, putting the ABI into a json file and the address into your `.env` file.

**Arbitrage:** In its simplest form, crypto arbitrage trading is the process of buying a digital asset on one exchange and selling it (just about) simultaneously on another where the price is higher. Doing so means making profits through a process that involves little or no risks. [Source: coindesk.com](https://www.coindesk.com/learn/crypto-arbitrage-trading-how-to-make-low-risk-gains/#:~:text=In%20its%20simplest%20form%2C%20crypto,involves%20little%20or%20no%20risks.)

**Flashloan:** Unlike normal loans, these loans are 100% collateral free and do not have a limit on how much you can borrow (aside from liquidity restraints). This is made possible through the blockchain and smart contracts. The flashloan will be loaned and repaid back to the provider *within the same transaction!* If the loan cannot be repayed back within the same transaction, the entire process fails. This means that if you borrow 1,000,000 DAI and cannot pay it back, you will **NOT** be responsible for repaying the $1,000,000 loan, but you **will** have to pay the gas fees for a failed transaction. 



### The code here has radically altered and bears little resemblance to the original code.

The follow are the notes taken when deploying on Arch/Manjaro Linux.

# Getting the bot to run

```sh
cd /home/jw/src/PAB # current local working for 
source /usr/share/nvm/init-nvm.sh
npm install #--legacy-peer-deps
nvm install 22  
nvm use 22
nvm alias default 22

```
Make sure Hardhat is the latest version
```sh
 hardhat # latest version
```

```sh
# already included in teh default inslall
# npm install dotenv
# npm install -g ganache-cli
```
Get ganache keys
```sh
# ONLY NEEDED IF USING FLASHLOANS

# npm install -g ganache-cli
# ganache-cli --account_keys_path=./ganache-accounts.json
```


Compile contracts
```sh
npx hardhat compile # also  --show-stack-traces and/or --force
```
- in `hardhat.config.js` the localGanache key must be preceeded with "0x"

Get AAVE "PoolAddressesProvider" from https://aave.com/docs/resources/addresses

# Alchemy

https://dashboard.alchemy.com/

```js
import { JsonRpcProvider } from 'ethers';

// Connect to the Ethereum network
const provider = new JsonRpcProvider("https://worldchain-mainnet.g.alchemy.com/v2/hU0aerD5DWBLSk_h4WnqvXN_rUsRORs0");

// Get block by number
const blockNumber = "latest";
const block = await provider.getBlock(blockNumber);

console.log(block);
```

# DEPLOY

.

------

### **1. Prerequisites**

- Install **Node.js** and **npm** (or **yarn**).
- Install **Hardhat**, a development framework for Ethereum.
- Fund a test wallet with **test tokens** (on a testnet like Mumbai).  Note, I never got Mumbai to work, has to use the live net "Polygon".
- Obtain API keys for **Alchemy** or similar providers for blockchain interaction.
- Ensure `dotenv` is configured for environment variables.

------

### **2. Setup Your Environment**

1. **Install Dependencies**

   - Navigate to your project directory and install dependencies:

     ```bash
     npm install
     ```

   - This will install all required packages listed in `package.json`.

2. **Configure `.env`**

   - Create a 

     ```
     .env
     ```

      file in the project root with necessary variables:

     ```plaintext
     ACCOUNT=0xYourReceivingWalletAddressHere
     HARDHAT_PRIVATE_KEY=YourPrivateKey
     ALCHEMY_API_KEY=YourAlchemyApiKey
     POLYGONSCAN_API_KEY=YourPolygonscanApiKey
     GMAIL_USER=YourGmailAddress
     GMAIL_PASS=YourGmailPassword
     MAIL_RECIPIENT=RecipientEmailAddress
     ARB_FOR=0xTokenAddressForArbitrage
     ARB_AGAINST=0xTokenAddressAgainstArbitrage
     UNITS=1e18
     PRICE_DIFFERENCE=0.01
     ```

------

### **3. Deploy the Smart Contract**

1. **Configure Hardhat**

   - In 

     ```
     hardhat.config.js
     ```

     , ensure you have the Polygon testnet (e.g., Mumbai) configured:

     ```javascript
     networks: {
       mumbai: {
         url: `https://polygon-mumbai.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
         accounts: [process.env.HARDHAT_PRIVATE_KEY],
       },
     },
     ```

2. **Compile Contracts**

   - Compile the Solidity contracts using Hardhat:

     ```bash
     npx hardhat compile
     ```

3. **Deploy Contracts**

   - Write a deployment script (e.g., `scripts/deploy.js`) to deploy your `Flashloan` contract:

     ```javascript
     const hre = require("hardhat");
     
     async function main() {
       const Flashloan = await hre.ethers.getContractFactory("Flashloan");
       const flashloan = await Flashloan.deploy("YourPoolAddressesProviderAddress");
     
       await flashloan.deployed();
       console.log("Flashloan deployed to:", flashloan.address);
     }
     
     main().catch((error) => {
       console.error(error);
       process.exitCode = 1;
     });
     ```

   - Run the deployment script:

     ```bash
     npx hardhat run scripts/deploy.js --network mumbai
     ```

------

### **4. Test the Bot**

1. ~~**Obtain Test Tokens**~~

   - ~~Use a faucet to get test tokens for the `ARB_FOR` and `ARB_AGAINST` pairs on the Polygon Mumbai network.~~

2. ~~**Mock Arbitrage Opportunities**~~

   - ~~Create a mock environment where token prices differ between exchanges:~~
     - ~~Deploy or simulate DEX contracts with liquidity pools on a testnet.~~
     
> None of the testnet/faucet stuff worked.  Had to just test live, which cost trx fees when using flashloans, but no trx fees when nbot using flachloan (currently teh detault) because it did all the calculations for profit ahead of of any actual trxs

3. **Run the Bot**

   - Start the bot:

     ```bash
     node bot.js
     ```

   - Monitor the logs for activity such as price fetching, trades executed, or errors.

4. **Handle Issues**

   - Debug and fix issues like invalid token pairs, insufficient gas, or API connection errors by reviewing error logs or adding console logs.

------

### **5. Verify on Polygon Mumbai**

1. **Monitor Transactions**
   - Use [Polygonscan](https://mumbai.polygonscan.com/) to monitor the transactions sent by your bot.
2. **Fine-Tune the Parameters**
   - Adjust the `PRICE_DIFFERENCE` and gas-related configurations for optimal performance.

------

### ~~**6. Move to Mainnet (After Testing)**~~

~~Once you've thoroughly tested your bot on the Polygon Mumbai testnet, you can:~~

- ~~Fund your mainnet wallet with MATIC for gas.~~
- ~~Update `.env` to reflect mainnet values.~~
- ~~Deploy your contracts and start the bot on the Polygon mainnet.~~

------



# Notes

If using AI to adjust code, the following prompt is helpful because AI has no concept of a "development phase" where various options are in play, and will wipe out and rewrite ALL the code to make a minor change because the CFG value is set to >0, meaning, it will never do the exact same thing twice the same way, meaning, it will rewrite your code differently each time no matter how small a change.

This is the prompt to add to your AI prompt:

```
IMPORTANT! When making updates to files, do not delete code unless necessary, as those changes were added to allow the test cases to work.
```

