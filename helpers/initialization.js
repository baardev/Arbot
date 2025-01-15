// initialization.js
require("dotenv").config();
const config = require('../config.json')
const HDWalletProvider = require('@truffle/hdwallet-provider');
const Web3 = require('web3')
let web3;

if (!config.PROJECT_SETTINGS.isLocal) {
    web3 = new Web3(`wss://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`)
} else {
    web3 = new Web3('ws://127.0.0.1:8545')
}

// Import contract ABIs
const UniswapV3Factory = require("../ABIs/UNISWAPV3_FACTORY.json");
const UniswapV3Router = require("../ABIs/UNISWAPV3_ROUTER.json");
const SushiswapFactory = require("../ABIs/SUSHISWAP_FACTORY.json");
const SushiswapRouter = require("../ABIs/SUSHISWAP_ROUTER.json").abi; // Note the .abi for this one
const QuickswapFactory = require("../ABIs/QUICKSWAP_FACTORY.json");
const QuickswapRouter = require("../ABIs/QUICKSWAP_ROUTER.json");
const Flashloan = require("../ABIs/Flashloan.json");

// Initialize contracts with ABIs
const uFactory = new web3.eth.Contract(UniswapV3Factory, config.UNISWAP.FACTORY_ADDRESS);
const uRouter = new web3.eth.Contract(UniswapV3Router, config.UNISWAP.V3_ROUTER_02_ADDRESS);

const sFactory = new web3.eth.Contract(SushiswapFactory, config.SUSHISWAP.FACTORY_ADDRESS);
const sRouter = new web3.eth.Contract(SushiswapRouter, config.SUSHISWAP.V3_ROUTER_02_ADDRESS);

const qFactory = new web3.eth.Contract(QuickswapFactory, config.QUICKSWAP.FACTORY_ADDRESS);
const qRouter = new web3.eth.Contract(QuickswapRouter, config.QUICKSWAP.V3_ROUTER_02_ADDRESS);

// Initialize Flashloan contract if deploying
let arbitrage = null;
if (process.env.CONTRACT) {
    arbitrage = new web3.eth.Contract(Flashloan.abi, process.env.CONTRACT);
}

module.exports = {
    uFactory,
    uRouter,
    sFactory,
    sRouter,
    qFactory,
    qRouter,
    web3,
    arbitrage,
    currentURL: 'alchemy' // Default to alchemy since we're using it
}