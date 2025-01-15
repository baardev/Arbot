const ethers = require('ethers');

// Replace this with your 12-word seed phrase
const mnemonic = "word1 word2 ... word 12";

const wallet = ethers.Wallet.fromMnemonic(mnemonic);
console.log("\nPrivate Key:", wallet.privateKey);
console.log("\nVerifying address matches:", wallet.address);