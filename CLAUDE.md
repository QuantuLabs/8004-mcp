# 8004-MCP Project Instructions

## Test Wallets

### EVM (Ethereum Sepolia)

| Wallet | Address | Purpose |
|--------|---------|---------|
| Relayer | `0x5d85B986f4fA8E625111443c180a6a009efE46D0` | Funding test wallets |
| Test E2E | `0x9e3c9DE73dC515fcfD0696dfD9513fe4f860be0c` | E2E write tests |

**Private key** in `.env` as `EVM_PRIVATE_KEY` (relayer wallet)

**Funding test wallets:**
```bash
# Check balances
node -e "
const RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
fetch(RPC, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getBalance', params: ['0x5d85B986f4fA8E625111443c180a6a009efE46D0', 'latest'], id: 1 })
}).then(r => r.json()).then(j => console.log('Relayer:', Number(BigInt(j.result)) / 1e18, 'ETH'));
fetch(RPC, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getBalance', params: ['0x9e3c9DE73dC515fcfD0696dfD9513fe4f860be0c', 'latest'], id: 1 })
}).then(r => r.json()).then(j => console.log('Test E2E:', Number(BigInt(j.result)) / 1e18, 'ETH'));
"

# Fund test wallet (requires viem)
node -e "
const { createWalletClient, createPublicClient, http, parseEther } = require('viem');
const { sepolia } = require('viem/chains');
const { privateKeyToAccount } = require('viem/accounts');
const account = privateKeyToAccount(process.env.EVM_PRIVATE_KEY);
const walletClient = createWalletClient({ account, chain: sepolia, transport: http('https://ethereum-sepolia-rpc.publicnode.com') });
walletClient.sendTransaction({ to: '0x9e3c9DE73dC515fcfD0696dfD9513fe4f860be0c', value: parseEther('0.1') }).then(console.log);
"
```

**Faucets (if relayer needs refunding):**
- https://www.alchemy.com/faucets/ethereum-sepolia
- https://sepolia-faucet.pk910.de/
- https://faucet.quicknode.com/ethereum/sepolia

### Solana (Devnet)

Keypair at `~/.config/solana/id.json` (configured in `.env` as `SOLANA_KEYPAIR_PATH`)

```bash
# Check balance
solana balance --url devnet

# Airdrop if needed
solana airdrop 2 --url devnet
```

## Running Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# E2E tests only
npm run test:e2e

# Specific E2E test file
npm run test:e2e -- tests/e2e/eth-sepolia-writes.e2e.test.ts
```

## MCP Wallet System

Wallets stored in `~/.8004-mcp/wallets/` (encrypted with password)

```bash
# List wallets
# Use: mcp__8004-mcp__wallet_list

# Key wallets:
# - sepolia-relayer (0x5d85...46D0) - same as EVM_PRIVATE_KEY
# - sepolia-test-e2e (0x9e3c...be0c) - for E2E tests
```
