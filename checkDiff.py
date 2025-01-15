#!/bin/env python
def get_last_balance_diff(filename):
    try:
        with open(filename, 'r') as f:
            lines = f.readlines()
            
        if len(lines) < 2:
            return None
            
        last_two = lines[-2:]
        balances = [float(line.split()[2]) for line in last_two]
        
        return balances[1] - balances[0]
        
    except FileNotFoundError:
        print(f"Error: {filename} not found")
        return None
    except Exception as e:
        print(f"Error processing file: {e}")
        return None

diff = get_last_balance_diff('logs/MATIC.log')
if diff is not None:
    print(f"Balance difference: {diff:.18f} MATIC")
