#!/usr/bin/env npx tsx
// Script to create an EVM wallet for e2e testing

import { getWalletManager } from '../src/core/wallet/index.js';

async function main() {
  const walletManager = getWalletManager();

  // Create main EVM wallet for e2e tests
  const password = 'e2e-test-wallet-2024';

  try {
    const result = await walletManager.create('e2e-main', 'evm', password);
    console.log('=== E2E Main Wallet Created ===');
    console.log(`Name: ${result.name}`);
    console.log(`Address: ${result.address}`);
    console.log(`Chain Type: ${result.chainType}`);
    console.log('');
    console.log('Send testnet ETH to this address:');
    console.log(result.address);
  } catch (error: any) {
    if (error.message?.includes('already exists')) {
      // Wallet exists, get info
      const info = await walletManager.getInfo('e2e-main');
      if (info) {
        console.log('=== E2E Main Wallet (existing) ===');
        console.log(`Name: ${info.name}`);
        console.log(`Address: ${info.address}`);
        console.log(`Chain Type: ${info.chainType}`);
        console.log('');
        console.log('Send testnet ETH to this address:');
        console.log(info.address);
      }
    } else {
      throw error;
    }
  }
}

main().catch(console.error);
