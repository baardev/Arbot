require("dotenv").config();

/**
 * @type import('hardhat/config').HardhatUserConfig
 */

require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-etherscan");
const PRIV_KEY = process.env.HARDHAT_PRIVATE_KEY
module.exports = {
  defaultNetwork: "matic",
  networks: {
    localGanache: {
      url: "http://127.0.0.1:8545",
      accounts: ["0x1a7e0b053044c09bcc1093d734e41dbf52cbe5e99c10d69549b15e68166e5e1f"],
      network_id: "*"
    },
    matic: {
      url: `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts: ["11e3057764a05ee8cf55000e343bc874e1a828d9ea92ad0dadcc4f9f2346e6c0"]
    },
    hardhat: {
      forking: {
        url: `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
        accounts: ["11e3057764a05ee8cf55000e343bc874e1a828d9ea92ad0dadcc4f9f2346e6c0"]
      },
      chainId: 137
    },
    mumbai: {
      url: `https://polygon-mumbai.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts: [process.env.HARDHAT_PRIVATE_KEY],
      chainId: 80001,
      gasPrice: "auto",
      timeout: 20000, // 20 seconds
      verify: {
        etherscan: {
          apiKey: process.env.POLYGONSCAN_API_KEY
        }
      }
    },
    mumbai_alt: {
      url: "https://rpc-mumbai.maticvigil.com",
      accounts: [process.env.HARDHAT_PRIVATE_KEY],
      chainId: 80001,
      gasPrice: "auto"
    },
  },
  etherscan: {
    apiKey: process.env.POLYGONSCAN_API_KEY
  },
  solidity: {
    compilers: [
      {
        version: "0.6.6",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1000
          },
        },
      },
      {
        version: "0.8.10",
      },
      {
        version: "0.7.5",
      },
    ],
  },
};