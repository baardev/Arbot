#!/bin/env python

import pandas as pd
import numpy as np

def convert_to_excel():
    # Read the original CSV
    df = pd.read_csv('SWAP_ACTIVITY.csv')

    # Create new DataFrame with desired columns
    new_df = pd.DataFrame({
        'time': df['2024-12-29T18:46:58.520Z'],
        'dex': df['quickswap'],
        'pair': 'WPOL/WETH',
        'blockN': df['blockNumber']
    })

    # Convert Wei values to token amounts and handle NaN values
    new_df['amount0In'] = pd.to_numeric(df['amount0In'].fillna(0)) / 1e18
    new_df['amount0Out'] = pd.to_numeric(df['amount0Out'].fillna(0)) / 1e18
    new_df['amount1Out'] = pd.to_numeric(df['amount1Out'].fillna(0)) / 1e18

    # Initialize amount1In column
    new_df['amount1In'] = 0

    # Group by blockN to consolidate related transactions
    grouped = new_df.groupby('blockN').agg({
        'time': 'first',  # Take first timestamp for the block
        'dex': 'first',   # Take first dex name
        'pair': 'first',  # Take first pair name
        'amount0In': 'sum',
        'amount1In': 'sum',
        'amount0Out': 'sum',
        'amount1Out': 'sum'
    }).reset_index()

    # Order columns
    column_order = [
        'time',
        'dex',
        'pair',
        'amount0In',
        'amount1In',
        'amount0Out',
        'amount1Out',
        'blockN'
    ]
    grouped = grouped[column_order]

    # Save to Excel
    grouped.to_excel('formatted_swaps.xlsx', index=False)

    print("Conversion complete. New file saved as 'formatted_swaps.xlsx'")
    print("\nSample of converted data:")
    print(grouped.head().to_string())

    # Print summary statistics
    print("\nDataset Summary:")
    print(f"Total rows: {len(grouped)}")
    print(f"Total WPOL in: {grouped['amount0In'].sum():.6f}")
    print(f"Total WPOL out: {grouped['amount0Out'].sum():.6f}")
    print(f"Total WETH in: {grouped['amount1In'].sum():.6f}")
    print(f"Total WETH out: {grouped['amount1Out'].sum():.6f}")

if __name__ == "__main__":
    convert_to_excel()