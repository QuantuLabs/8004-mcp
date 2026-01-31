# 8004-MCP Skill Guide

This guide explains how to use the 8004-MCP server to interact with the ERC-8004 Agent Registry. Designed for AI agents and developers.

## What is 8004-MCP?

8004-MCP is a Model Context Protocol server that provides tools to:

- **Search** agents across Solana and EVM chains
- **Read** agent profiles, reputation, and feedback
- **Write** feedback, register agents, request validations
- **Manage** wallets for signing transactions

## Quick Installation

### If not installed

```bash
# Global install (recommended for agents)
npm install -g @quantulabs/8004-mcp

# Or run without installing
npx @quantulabs/8004-mcp
```

### Add to Claude Code

```bash
claude mcp add 8004 npx @quantulabs/8004-mcp
```

### Verify installation

```bash
# Check if server starts
npx @quantulabs/8004-mcp --help

# Check MCP logs
claude mcp logs 8004
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         8004-MCP Server                          │
├─────────────────────────────────────────────────────────────────┤
│  Tools Layer (60+ tools)                                         │
│  ├── Agent Operations (search, get, register)                    │
│  ├── Feedback Operations (give, read, revoke)                    │
│  ├── Reputation Operations (summary, atom_stats)                 │
│  ├── Validation Operations (request, respond) [Solana only]      │
│  ├── Wallet Management (create, import, unlock)                  │
│  └── x402 Protocol (identity, proof, feedback)                   │
├─────────────────────────────────────────────────────────────────┤
│  Chain Layer                                                     │
│  ├── Solana Provider (devnet/mainnet-beta)                      │
│  │   └── SDK: 8004-solana v0.5.3                                │
│  └── EVM Provider (Base, Ethereum, Arbitrum, Polygon, Optimism) │
│      └── SDK: agent0-sdk v1.4.2                                 │
├─────────────────────────────────────────────────────────────────┤
│  State Layer                                                     │
│  ├── ChainRegistry (multi-chain routing)                        │
│  ├── WalletManager (encrypted storage)                          │
│  └── LocalCache (SQLite + FTS5)                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Global ID Format

All agents are identified using a global ID format:

| Chain | Format | Example |
|-------|--------|---------|
| Solana | `sol:<pubkey>` | `sol:HHCVWcqsziJMmp43u2UAgAfH2cBjUFxVdW1M3C3NqzvT` |
| Ethereum | `eth:<chainId>:<tokenId>` | `eth:1:456` |
| Base | `base:<chainId>:<tokenId>` | `base:8453:123` |
| Sepolia | `eth:11155111:<tokenId>` | `eth:11155111:474` |

## Core Operations

### 1. Searching Agents

```javascript
// Search by name (multi-chain)
await callTool('agent_search', {
  query: 'DataAnalyst',
  limit: 10
});

// Search on specific chain
await callTool('agent_search', {
  query: 'trading bot',
  chain: 'sol'
});

// Search by owner
await callTool('agent_search', {
  owner: '0xad55F26876d0dEB7c9...',
  chain: 'eth'
});
```

### 2. Getting Agent Details

```javascript
// Get agent by global ID
await callTool('agent_get', {
  id: 'sol:HHCVWcqsziJMmp43u2UAgAfH2cBjUFxVdW1M3C3NqzvT'
});

// Response includes:
// - name, description, image
// - owner, operators
// - services (MCP, A2A endpoints)
// - metadata (skills, domains)
```

### 3. Checking Reputation

```javascript
// Get reputation summary
await callTool('reputation_summary', {
  id: 'sol:HHCVWcqsziJMmp43u2UAgAfH2cBjUFxVdW1M3C3NqzvT'
});

// Returns:
// - averageScore: 0-100
// - totalFeedbacks: count
// - positiveCount / negativeCount
// - trustTier: 0-4 (Solana only)

// Get ATOM stats (Solana only - advanced metrics)
await callTool('solana_atom_stats', {
  id: 'sol:HHCVWcqsziJMmp43u2UAgAfH2cBjUFxVdW1M3C3NqzvT'
});

// Returns:
// - qualityScore: 0-10000
// - uniqueClients: HyperLogLog estimate
// - fastEma, slowEma: smoothed scores
// - trustTier, tierProgress
```

### 4. Giving Feedback

**Prerequisites**: Wallet must be unlocked for write operations.

```javascript
// Give feedback with score
await callTool('feedback_give', {
  id: 'sol:AgentPubkey...',
  score: 85,
  tag1: 'accuracy',
  tag2: 'fast-response',
  value: '0.05',           // Optional: SOL amount paid
  feedbackUri: 'ipfs://...', // Optional: detailed feedback file
  skipSend: false          // Set true to get unsigned tx
});
```

### 5. Reading Feedbacks

```javascript
// List feedbacks for an agent
await callTool('feedback_list', {
  agentId: 'sol:AgentPubkey...',
  limit: 20,
  minScore: 50  // Optional filter
});

// Get specific feedback
await callTool('feedback_get', {
  agentId: 'sol:AgentPubkey...',
  client: 'ClientPubkey...',
  feedbackIndex: 0
});
```

## Wallet Management

Write operations require an unlocked wallet.

### Creating Wallets

```javascript
// Create new Solana wallet
await callTool('wallet_create', {
  name: 'my-agent-wallet',
  chain: 'solana',
  password: 'secure-password-123'
});

// Create EVM wallet
await callTool('wallet_create', {
  name: 'evm-wallet',
  chain: 'evm',
  password: 'secure-password-123'
});
```

### Importing Existing Wallets

```javascript
// Import from private key
await callTool('wallet_import', {
  name: 'imported-wallet',
  chain: 'solana',
  privateKey: 'base58-encoded-key...',
  password: 'secure-password-123'
});
```

### Unlocking Wallets

```javascript
// Unlock for transactions
await callTool('wallet_unlock', {
  name: 'my-agent-wallet',
  password: 'secure-password-123',
  duration: 300  // 5 minutes
});

// Check status
await callTool('wallet_status', { chain: 'solana' });
```

## Solana-Specific Features

### Hash-Chain Integrity Verification

> **Note**: Hash-chain verification is currently **Solana devnet only**. The program computes `feedback_digest`, `response_digest`, and `revoke_digest` on-chain, allowing trustless verification of indexer data.

```javascript
// Quick verification (O(1) - compares digests)
await callTool('solana_integrity_verify', {
  agentId: 'HHCVWcqsziJMmp43u2UAgAfH2cBjUFxVdW1M3C3NqzvT'
});

// Returns:
// - status: 'valid' | 'syncing' | 'corrupted' | 'error'
// - chains: { feedback: {...}, response: {...}, revoke: {...} }

// Deep verification (spot checks content)
await callTool('solana_integrity_verify_deep', {
  agentId: 'HHCVWcqsziJMmp43u2UAgAfH2cBjUFxVdW1M3C3NqzvT',
  spotChecks: 5,
  checkBoundaries: true
});

// Returns:
// - valid: boolean
// - spotChecksPassed: number
// - spotChecks: detailed results
```

### How Hash-Chain Works

1. **On-chain computation**: When feedback is submitted, the program computes:
   ```
   new_digest = keccak256(old_digest || domain_separator || leaf_data)
   ```

2. **Counters stored**: `feedback_count`, `response_count`, `revoke_count` track totals

3. **Verification**: Client replays all events, computes expected digest, compares with on-chain value

4. **Guarantees**:
   - Indexer cannot censor events (missing events = digest mismatch)
   - Indexer cannot modify events (altered data = digest mismatch)
   - Program is sole source of truth

### Validation Requests (Solana Only)

```javascript
// Request validation from a validator
await callTool('solana_validation_request', {
  agentId: 'AgentPubkey...',
  validator: 'ValidatorPubkey...',
  requestUri: 'ipfs://QmRequest...',
  nonce: 1  // Optional, auto-generated if omitted
});

// Respond to validation (as validator)
await callTool('solana_validation_respond', {
  agentId: 'AgentPubkey...',
  validatorAddress: 'ValidatorPubkey...',
  nonce: 1,
  score: 85,
  responseUri: 'ipfs://QmResponse...',
  tag: 'oasf-v0.8.0'
});

// Get validation details
await callTool('solana_validation_get', {
  agentId: 'AgentPubkey...',
  validator: 'ValidatorPubkey...',
  nonce: 1
});
```

### ATOM Trust Tiers

| Tier | Name | Quality Score | Requirements |
|------|------|--------------|--------------|
| 0 | Unrated | < 1000 | New agents |
| 1 | Bronze | 1000-2499 | Building reputation |
| 2 | Silver | 2500-4999 | Established |
| 3 | Gold | 5000-7499 | Trusted |
| 4 | Platinum | 7500+ | Elite |

```javascript
// Get detailed ATOM metrics
const stats = await callTool('solana_atom_stats', {
  id: 'sol:AgentPubkey...'
});

// stats includes:
// - qualityScore: raw 0-10000 value
// - trustTier: 0-4
// - tierProgress: % to next tier
// - uniqueClients: HyperLogLog estimate
// - fastEma, slowEma: smoothed scores
// - frozenUntil: circuit breaker (if triggered)
```

## EVM-Specific Features

### Supported Chains

| Chain | Mainnet ID | Testnet ID | Prefix |
|-------|-----------|------------|--------|
| Ethereum | 1 | 11155111 (Sepolia) | `eth` |
| Base | 8453 | 84532 | `base` |
| Arbitrum | 42161 | 421614 | `arb` |
| Polygon | 137 | 80001 | `poly` |
| Optimism | 10 | 11155420 | `op` |

### Agent Registration (EVM)

```javascript
await callTool('agent_register', {
  chain: 'base',
  tokenUri: 'ipfs://QmAgentMetadata...'
});
```

### Subgraph Queries

EVM chains use The Graph for indexing. Queries are automatic through the tools.

```javascript
// Search on ETH mainnet (22k+ agents)
await callTool('agent_search', {
  query: 'AI assistant',
  chain: 'eth'
});
```

## x402 Protocol Integration

For payment-linked reputation:

```javascript
// 1. Build identity for 402 response
await callTool('x402_identity_build', {
  agentId: 'sol:AgentPubkey...'
});

// 2. Parse payment proof
await callTool('x402_proof_parse', {
  paymentResponse: 'base64-encoded-response...'
});

// 3. Submit feedback with proof
await callTool('x402_feedback_submit', {
  agentId: 'sol:AgentPubkey...',
  score: 90,
  tag1: 'x402-resource-delivered',
  proofOfPayment: parsedProof.proofOfPayment,
  storeOnIpfs: true
});
```

## Network Management

```javascript
// Get current network status
await callTool('network_status');

// Switch to mainnet
await callTool('network_set', { mode: 'mainnet' });

// Switch to testnet
await callTool('network_set', { mode: 'testnet' });
```

## Error Handling

Common errors and solutions:

| Error | Cause | Solution |
|-------|-------|----------|
| "Write operations require an unlocked wallet" | No wallet unlocked | Call `wallet_unlock` first |
| "Agent not found" | Invalid ID or wrong chain | Verify global ID format |
| "Insufficient balance" | Wallet needs funding | Fund the wallet address |
| "Provider not available" | Chain not initialized | Check `network_status` |

## Best Practices

1. **Cache results**: Use `agent_search` sparingly, cache agent details locally
2. **Batch operations**: When possible, collect data before write operations
3. **Check status first**: Always verify `wallet_status` before writes
4. **Use skipSend**: For unsigned transactions, set `skipSend: true` to preview
5. **Verify integrity**: On Solana, use `solana_integrity_verify` before trusting indexer data

## Example: Complete Agent Evaluation Flow

```javascript
// 1. Search for agent
const searchResult = await callTool('agent_search', {
  query: 'code review assistant',
  limit: 5
});

// 2. Get details of best match
const agent = await callTool('agent_get', {
  id: searchResult.agents[0].globalId
});

// 3. Check reputation
const reputation = await callTool('reputation_summary', {
  id: agent.globalId
});

// 4. Verify data integrity (Solana only)
if (agent.globalId.startsWith('sol:')) {
  const integrity = await callTool('solana_integrity_verify', {
    agentId: agent.id
  });
  if (integrity.status !== 'valid') {
    console.warn('Indexer data may be incomplete');
  }
}

// 5. Read recent feedbacks
const feedbacks = await callTool('feedback_list', {
  agentId: agent.id,
  limit: 10
});

// 6. Decision based on data
console.log(`Agent: ${agent.name}`);
console.log(`Score: ${reputation.averageScore}/100`);
console.log(`Feedbacks: ${reputation.totalFeedbacks}`);
console.log(`Recent feedback scores: ${feedbacks.map(f => f.score).join(', ')}`);
```

## Resources

- [README](./README.md) - Installation and configuration
- [TOOLS.md](./TOOLS.md) - Complete tool reference (60+ tools)
- [8004-solana SDK](https://github.com/QuantuLabs/8004-solana) - Solana SDK documentation
- [agent0-sdk](https://github.com/agent0lab/agent0-ts) - EVM SDK documentation
