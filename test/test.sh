#!/bin/bash
npx hardhat clean

# Function to handle errors
handle_error() {
    echo "Error: $1 failed"
    exit 1
}

# Function to display step information
show_step() {
    echo -e "\n===== $1 (Command: $2) ====="
}

# Function to run command with timeout
run_with_timeout() {
    local timeout=$1
    local command=$2
    local message=$3

    echo "Starting $message (timeout: ${timeout}s)"
    timeout $timeout $command
    local status=$?

    if [ $status -eq 124 ]; then
        echo "Error: $message timed out after ${timeout} seconds"
        exit 1
    elif [ $status -ne 0 ]; then
        handle_error "$message"
    fi
}

# Create logs directory if it doesn't exist
show_step "Setting Up Logs Directory" "mkdir -p logs"
mkdir -p logs
echo "Logs directory ready"

# Check if npm and npx are available
command -v npm >/dev/null 2>&1 || { echo "npm is required but not installed"; exit 1; }
command -v npx >/dev/null 2>&1 || { echo "npx is required but not installed"; exit 1; }

# Compile contracts
show_step "Compiling Contracts" "npx hardhat compile --force"
run_with_timeout 60 "npx hardhat compile --force" "contract compilation"

# Deploy contracts
show_step "Deploying Contracts" "npx hardhat run scripts/deploy.js --network polygon"
run_with_timeout 300 "npx hardhat run scripts/deploy.js --network polygon" "contract deployment"

# Fund contract with USDC
show_step "Funding Contract with USDC" "node scripts/fundContract.js"
run_with_timeout 120 "node scripts/fundContract.js" "contract funding"

# Test flash loan
show_step "Testing Flash Loan" "node scripts/checkState.js"
run_with_timeout 60 "node scripts/checkState.js" "check state"

show_step "Testing Flash Loan" "node scripts/testFlashLoan.js"
run_with_timeout 120 "node scripts/testFlashLoan.js" "flash loan test"

# Run arbitrage check
show_step "Checking Arbitrage Opportunities" "node scripts/checkArbitrage.js"
run_with_timeout 60 "node scripts/checkArbitrage.js" "arbitrage check"

# Run unit tests
show_step "Running Unit Tests" "npx hardhat test test/Flashloan.test.js"
run_with_timeout 120 "npx hardhat test test/Flashloan.test.js" "unit tests"

# Run bot
show_step "Starting Bot" "npm run bot"
run_with_timeout 3600 "npm run bot" "bot execution"

echo -e "\n===== All operations completed successfully ====="
echo "Check the logs directory for detailed execution logs"