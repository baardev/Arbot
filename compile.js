const fs = require('fs');
const path = require('path');
const solc = require('solc');

// Define the path to the contract
const contractPath = path.resolve(__dirname, 'contracts', 'UniswapV2Factory.sol');

// Check if the contract file exists
if (!fs.existsSync(contractPath)) {
  console.error(`Contract file not found at path: ${contractPath}`);
  process.exit(1);
}

// Read the contract source code
const source = fs.readFileSync(contractPath, 'utf8');

// Prepare the Solidity compiler input
const input = {
  language: 'Solidity',
  sources: {
    'UniswapV2Factory.sol': {
      content: source,
    },
  },
  settings: {
    outputSelection: {
      '*': {
        '*': ['abi'],
      },
    },
  },
};

// Compile the contract
const output = JSON.parse(solc.compile(JSON.stringify(input)));

// Check for compilation errors
if (output.errors) {
  output.errors.forEach((err) => {
    console.error(err.formattedMessage);
  });
  process.exit(1);
}

// Extract the ABI
const contractName = 'UniswapV2Factory';
const abi = output.contracts['UniswapV2Factory.sol'][contractName].abi;

// Define the output path for the ABI
const abiDir = path.resolve(__dirname, 'ABIs');
const abiPath = path.resolve(abiDir, 'QUICKSWAP_FACTORY.json');

// Ensure the ABIs directory exists
if (!fs.existsSync(abiDir)) {
  fs.mkdirSync(abiDir);
}

// Write the ABI to a JSON file
fs.writeFileSync(abiPath, JSON.stringify(abi, null, 2));

console.log(`ABI extracted and saved to ${abiPath}`);
