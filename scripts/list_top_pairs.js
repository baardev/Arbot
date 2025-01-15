const fs = require('fs');
const path = require('path');

// Read the all_pairs.json file
const allPairs = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/all_pairs.json')));

// Flatten all pairs from different DEXes into a single array
const allPairsFlat = Object.values(allPairs).flat();

// Sort pairs by total liquidity (descending)
const sortedPairs = allPairsFlat.sort((a, b) => b.totalLiquidityUSD - a.totalLiquidityUSD);

// Get top 10 pairs
const top10Pairs = sortedPairs.slice(0, 10);

console.log('\nTop 10 Pairs by Liquidity on Polygon:');
console.log('=====================================');

top10Pairs.forEach((pair, index) => {
    console.log(`\n${index + 1}. ${pair.name} (${pair.dex})`);
    console.log(`   Address: ${pair.pairAddress}`);
    console.log(`   Total Liquidity: $${pair.totalLiquidityUSD.toLocaleString()}`);
    console.log(`   Token0: ${pair.token0.symbol} ($${pair.token0.reserveUSD.toLocaleString()})`);
    console.log(`   Token1: ${pair.token1.symbol} ($${pair.token1.reserveUSD.toLocaleString()})`);
});
