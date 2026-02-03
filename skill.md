# 8004-MCP - Agent Registry Protocol

Multi-chain MCP server for ERC-8004 Agent Registry. Query agents, reputation, and feedback across Solana + EVM chains.

---

## ⚡ First Time Setup (IMPORTANT)

### 1. Check System Health
```typescript
await client.callTool({ name: 'health_check', arguments: {} });
// Returns: { server: 'ok', chains: {...}, walletStore: 'not_initialized', ... }
```

### 2. Initialize Wallet Store (One-Time)
The wallet store encrypts all your wallets with a single master password.

```typescript
// ⚠️ SAVE THIS PASSWORD - Cannot be recovered if lost!
await client.callTool({ name: 'wallet_store_init', arguments: {
  password: 'YourSecureMasterPassword123!'
}});
// Returns: { initialized: true, message: 'Wallet store created' }
```

### 3. Create a Wallet
```typescript
await client.callTool({ name: 'wallet_create', arguments: {
  name: 'my-eth-wallet',
  chainType: 'evm'  // or 'solana'
}});
// Returns: { name: 'my-eth-wallet', address: '0x...', chainType: 'evm' }
```

### 4. Fund Your Wallet (Testnet)
```typescript
await client.callTool({ name: 'faucet_info', arguments: {
  chain: 'eth'  // or 'sol', 'base'
}});
// Returns faucet URLs and minimum needed for registration
```

### 5. On New Sessions - Unlock Store
```typescript
await client.callTool({ name: 'wallet_store_unlock', arguments: {
  password: 'YourSecureMasterPassword123!'
}});
// Now all write operations work
```

### Common Issues

| Symptom | Cause | Solution |
|---------|-------|----------|
| `STORE_NOT_INITIALIZED` | First run | Call `wallet_store_init` |
| `STORE_LOCKED` | New session | Call `wallet_store_unlock` |
| `INVALID_PASSWORD` | Wrong password | Check password (no recovery!) |
| Timeout on wallet ops | Store locked | Unlock first |
| `INSUFFICIENT_BALANCE` | Empty wallet | Use faucet |

---

## Quick Start (MCP Client)

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';

const server = spawn('npx', ['@quantulabs/8004-mcp'], {
  stdio: ['pipe', 'pipe', 'inherit'],
  env: { ...process.env, NETWORK_MODE: 'testnet' }
});

const client = new Client(
  { name: 'my-agent', version: '1.0.0' },
  { capabilities: {} }
);

await client.connect(new StdioClientTransport({
  reader: server.stdout,
  writer: server.stdin,
}));

// Ready - use client.callTool()
```

## Global ID Format

| Chain | Format | Example |
|-------|--------|---------|
| Solana | `sol:<pubkey>` | `sol:HHCVWcqs...` |
| Ethereum | `eth:<chainId>:<tokenId>` | `eth:11155111:738` |
| Base | `base:<chainId>:<tokenId>` | `base:84532:42` |

---

## Core Tools

### Read Operations (No wallet needed)

#### agent_search
Search agents across chains.
```typescript
await client.callTool({ name: 'agent_search', arguments: {
  query: 'trading bot',      // Search name/description
  chain: 'eth',              // Optional: sol, eth, base, arb, poly, op
  limit: 20,                 // Default: 20, max: 100
  offset: 0,                 // Pagination offset
  cursor: 'abc...',          // Cursor pagination (EVM only, faster)
  // Advanced filters (EVM only):
  hasMcp: true,              // Has MCP endpoint
  hasA2a: true,              // Has A2A endpoint
  active: true,              // Active agents only
  x402support: true,         // Supports x402 payments
  mcpTools: ['web-search'],  // Has specific MCP tools
  a2aSkills: ['translation'] // Has specific A2A skills
}});
// Returns: { results: IAgentSummary[], total, hasMore, cursor? }
```

#### cache_search
Fast fuzzy search (FTS5). Use for partial name matches.
```typescript
await client.callTool({ name: 'cache_search', arguments: {
  query: 'Upsense',  // Partial match works
  chain: 'all',
  limit: 20
}});
```

#### agent_get
Get agent details by ID.
```typescript
await client.callTool({ name: 'agent_get', arguments: {
  id: 'eth:11155111:738'  // Global ID
}});
// Returns: IAgent with name, description, owner, endpoints, metadata
```

#### agent_exists
Check if agent exists.
```typescript
await client.callTool({ name: 'agent_exists', arguments: {
  id: 'sol:HHCVWcqs...'
}});
// Returns: { exists: boolean }
```

#### reputation_get
Get reputation summary.
```typescript
await client.callTool({ name: 'reputation_get', arguments: {
  id: 'sol:HHCVWcqs...'
}});
// Returns: { averageScore, totalFeedbacks, trustTier (Solana only) }
```

#### feedback_list
List feedbacks for an agent.
```typescript
await client.callTool({ name: 'feedback_list', arguments: {
  id: 'sol:HHCVWcqs...',
  limit: 20,
  minScore: 50  // Optional filter
}});
```

#### leaderboard_get
Top agents by reputation.
```typescript
await client.callTool({ name: 'leaderboard_get', arguments: {
  chain: 'sol',
  limit: 10
}});
```

#### solana_atom_stats_get
ATOM reputation metrics (Solana only).
```typescript
await client.callTool({ name: 'solana_atom_stats_get', arguments: {
  asset: 'HHCVWcqs...'  // Solana pubkey (no sol: prefix)
}});
// Returns: { qualityScore, trustTier, uniqueClients, fastEma, slowEma }
```

#### solana_integrity_verify
Verify indexer data integrity (Solana only).
```typescript
await client.callTool({ name: 'solana_integrity_verify', arguments: {
  asset: 'HHCVWcqs...'
}});
// Returns: { status: 'valid' | 'syncing' | 'corrupted' }
```

### Write Operations (Wallet required)

#### Wallet Store Setup (Master Password)
```typescript
// 1. Initialize store (one-time) - SAVE THE MASTER PASSWORD!
await client.callTool({ name: 'wallet_store_init', arguments: {
  password: 'MySecureMaster123!'
}});

// 2. Create wallets (stored in encrypted store)
await client.callTool({ name: 'wallet_create', arguments: {
  name: 'my-solana',
  chainType: 'solana'  // or 'evm'
}});

// 3. On new session, unlock store with master password
await client.callTool({ name: 'wallet_store_unlock', arguments: {
  password: 'MySecureMaster123!'
}});

// 4. Now write operations work (all wallets unlocked)
```

#### feedback_give
Submit feedback for an agent.
```typescript
await client.callTool({ name: 'feedback_give', arguments: {
  id: 'sol:HHCVWcqs...',
  value: 85,              // Score 0-100
  tag1: 'uptime',         // Category tag
  tag2: 'day',            // Period tag
  comment: 'Great agent', // Optional
  skipSend: false         // true = dry-run (returns unsigned tx)
}});
```

#### agent_register
Register new agent.
```typescript
await client.callTool({ name: 'agent_register', arguments: {
  chain: 'sol',
  name: 'My Agent',
  description: 'Does cool stuff',
  tokenUri: 'ipfs://Qm...',  // Metadata URI
  skipSend: false,
  estimateCost: false        // Set true to get cost estimate without executing
}});
```

---

## Cost Estimation (estimateCost)

Get accurate cost estimates before registering. No wallet required.

### Solana

```typescript
const estimate = await client.callTool({ name: 'agent_register', arguments: {
  chain: 'sol',
  estimateCost: true
}});
// Returns:
// {
//   estimated: true,
//   chain: 'solana',
//   breakdown: {
//     agentAccountRent: { lamports: 2068605, sol: 0.002069, description: '297 bytes' },
//     metaplexAssetRent: { lamports: 1866620, sol: 0.001867, description: '~268 bytes' },
//     atomStatsRent: { lamports: 3907365, sol: 0.003907, description: '561 bytes' },
//     transactionFees: { lamports: 10000, sol: 0.00001 }
//   },
//   total: { lamports: 7852590, sol: 0.007853 },
//   recommended: { lamports: 9423108, sol: 0.009423 },
//   message: 'Estimated cost: 0.007853 SOL (~$1.18 USD)'
// }
```

### EVM (Two Registration Flows)

EVM has two registration flows with different costs:

| Flow | Transactions | Use Case |
|------|--------------|----------|
| **HTTP** | 1 tx | You already have the agent URI hosted |
| **IPFS** | 2 tx | SDK uploads to IPFS, then sets URI |

```typescript
const evmEstimate = await client.callTool({ name: 'agent_register', arguments: {
  chain: 'eth',
  estimateCost: true
}});
// Returns:
// {
//   estimated: true,
//   chain: 'eth',
//   chainId: 11155111,
//   gasPrice: { wei: '1000000000', gwei: 1 },
//   flows: {
//     http: {
//       description: 'Single transaction with HTTP/IPFS URI',
//       gas: '150000',
//       cost: { wei: '150000000000000', eth: 0.00015, usd: 0.45 },
//       recommended: { wei: '195000000000000', eth: 0.000195 }
//     },
//     ipfs: {
//       description: 'Two transactions: register() + setAgentURI()',
//       gas: '200000',
//       cost: { wei: '200000000000000', eth: 0.0002, usd: 0.60 },
//       recommended: { wei: '260000000000000', eth: 0.00026 }
//     }
//   },
//   breakdown: {
//     register: { gas: '150000', description: '5 cold SSTORE + ERC-721 mint' },
//     setAgentURI: { gas: '50000', description: 'Warm SSTORE (IPFS flow only)' }
//   },
//   note: 'Gas can spike 10-50x on mainnet during congestion'
// }
```

### Cost Reference (ETH @ $3000)

| Chain | Gas Price | HTTP Flow | IPFS Flow |
|-------|-----------|-----------|-----------|
| Base L2 | 0.01 gwei | ~$0.005 | ~$0.006 |
| Base L2 (busy) | 1 gwei | ~$0.45 | ~$0.60 |
| ETH Mainnet | 25 gwei | ~$11 | ~$15 |
| ETH Mainnet (busy) | 50 gwei | ~$22 | ~$30 |

Use `recommended` value to ensure transaction succeeds even with gas price fluctuations.

---

## Dry-Run Mode (skipSend)

Test write operations without funds or broadcasting:

```typescript
// Returns unsigned transaction, no funds needed
const preview = await client.callTool({ name: 'feedback_give', arguments: {
  id: 'sol:HHCVWcqs...',
  value: 85,
  tag1: 'uptime',
  skipSend: true  // Dry-run
}});
// preview.content[0].text contains: { unsigned: true, transaction: "base64...", message: "..." }
```

Supported on: `feedback_give`, `agent_register`, `agent_transfer`, `agent_uri_update`, `feedback_revoke`, `solana_validation_request`, `solana_validation_respond`

---

## Network Configuration

```typescript
// Check current network
await client.callTool({ name: 'network_get', arguments: {} });

// Switch to mainnet
await client.callTool({ name: 'network_set', arguments: { mode: 'mainnet' } });

// Switch to testnet (default)
await client.callTool({ name: 'network_set', arguments: { mode: 'testnet' } });
```

| Network | Solana | Ethereum | Base |
|---------|--------|----------|------|
| testnet | devnet | Sepolia (11155111) | Base Sepolia (84532) |
| mainnet | mainnet-beta | Mainnet (1) | Base (8453) |

---

## x402 Protocol

Payment-linked reputation.

```typescript
// 1. Build identity for 402 response
const identity = await client.callTool({ name: 'x402_identity_build', arguments: {
  agentId: 'sol:HHCVWcqs...'
}});

// 2. Parse payment proof from response header
const proof = await client.callTool({ name: 'x402_proof_parse', arguments: {
  paymentResponse: 'base64-encoded-header...'
}});

// 3. Submit feedback with proof
await client.callTool({ name: 'x402_feedback_submit', arguments: {
  agentId: 'sol:HHCVWcqs...',
  value: 90,
  tag1: 'x402-resource-delivered',
  tag2: 'exact-svm',
  proofOfPayment: proof.proofOfPayment
}});
```

---

## Error Codes

| Error | Cause | Solution |
|-------|-------|----------|
| `STORE_LOCKED` | Write op without unlock | Call `wallet_store_unlock` with master password |
| `STORE_NOT_INITIALIZED` | No wallet store | Call `wallet_store_init` first |
| `INVALID_PASSWORD` | Wrong master password | Check password (cannot recover if lost) |
| `AGENT_NOT_FOUND` | Invalid ID | Verify global ID format |
| `INSUFFICIENT_BALANCE` | Wallet empty | Fund wallet address |
| `PROVIDER_NOT_AVAILABLE` | Chain not initialized | Check `network_get` |

---

## OASF Standards

```typescript
// List valid skill slugs
await client.callTool({ name: 'oasf_list_skills', arguments: {} });

// List valid domain slugs
await client.callTool({ name: 'oasf_list_domains', arguments: {} });

// List feedback tags
await client.callTool({ name: 'oasf_list_tags', arguments: {} });
```

---

## All Tools Reference

### Agent Operations
- `agent_get` - Get agent by ID
- `agent_exists` - Check existence
- `agent_search` - Search with filters
- `agent_list_by_owner` - List by owner address
- `agent_register` - Register new agent (write)
- `agent_transfer` - Transfer ownership (write)
- `agent_uri_update` - Update metadata URI (write)
- `agent_metadata_set` - Set on-chain metadata (Solana, write)

### Feedback Operations
- `feedback_give` - Submit feedback (write)
- `feedback_read` - Read single feedback
- `feedback_list` - List feedbacks
- `feedback_revoke` - Revoke feedback (write)
- `feedback_response_append` - Respond to feedback (write)

### Reputation Operations
- `reputation_get` - Get summary
- `leaderboard_get` - Top agents

### Collection Operations
- `collection_get` - Get collection details
- `collection_list` - List collections
- `collection_agents` - List agents in collection
- `collection_base_get` - Get base registry
- `collection_create` - Create collection (Solana, write)
- `collection_uri_update` - Update collection URI (Solana, write)

### Wallet Store (Master Password)
- `wallet_store_init` - Initialize store with master password
- `wallet_store_unlock` - Unlock all wallets with master password
- `wallet_store_lock` - Lock store (secure wipe)
- `wallet_store_status` - Get store status
- `wallet_store_change_password` - Change master password
- `wallet_store_migrate` - Migrate legacy wallets

### Wallet Operations
- `wallet_list` - List wallets in store
- `wallet_info` - Wallet details
- `wallet_create` - Create new wallet (requires unlocked store)
- `wallet_import` - Import private key (requires unlocked store)
- `wallet_delete` - Delete wallet (requires unlocked store)
- `wallet_security` - Configure auto-lock timeout

### Cache Operations
- `cache_search` - Fast FTS5 search
- `cache_refresh` - Force refresh
- `cache_stats` - Cache statistics
- `cache_sync_status` - Sync status

### Solana-Specific
- `solana_atom_stats_get` - ATOM metrics
- `solana_atom_stats_initialize` - Init ATOM account (write)
- `solana_trust_tier_get` - Trust tier
- `solana_enriched_summary_get` - Combined metrics
- `solana_agent_wallet_get` - Get operational wallet
- `solana_sign` - Sign with agent wallet
- `solana_verify` - Verify signature
- `solana_validation_request` - Request validation (write)
- `solana_validation_respond` - Respond to validation (write)
- `solana_validation_read` - Read validation
- `solana_validation_wait` - Wait for response
- `solana_validation_pending_get` - Pending validations
- `solana_integrity_verify` - O(1) integrity check
- `solana_integrity_verify_deep` - Deep verification

### EVM-Specific
- `evm_agent_wallet_set` - Set operational wallet (write)
- `evm_agent_wallet_unset` - Remove operational wallet (write)

### x402 Protocol
- `x402_identity_build` - Build agent identity
- `x402_proof_parse` - Parse payment proof
- `x402_feedback_build` - Build feedback file
- `x402_feedback_submit` - Submit with proof (write)

### Configuration & Health
- `config_get` - Current config
- `config_set` - Update config
- `config_reset` - Reset to defaults
- `network_get` - Network status
- `network_set` - Switch network
- `health_check` - System health (server, chains, wallet store, cache)
- `faucet_info` - Testnet faucet URLs and funding info

### OASF Standards
- `oasf_list_skills` - Valid skill slugs
- `oasf_list_domains` - Valid domain slugs
- `oasf_list_tags` - Feedback tags
- `oasf_validate_skill` - Validate skill
- `oasf_validate_domain` - Validate domain
- `oasf_validate_tag` - Validate tag

### Crawler
- `crawler_fetch_mcp` - Fetch MCP capabilities
- `crawler_fetch_a2a` - Fetch A2A agent card
- `crawler_is_alive` - Health check

### IPFS
- `ipfs_configure` - Configure IPFS/Pinata
- `ipfs_add_json` - Store JSON
- `ipfs_add_registration` - Store registration file
- `ipfs_get_registration` - Retrieve registration

---

## Claude Code Integration

> This section is for Claude Code / AI assistants using 8004-MCP tools.

### Intent Mapping

| User Says | Tool | Notes |
|-----------|------|-------|
| "find agents", "search for X" | `agent_search` or `cache_search` | Use `cache_search` for partial names |
| "agent details", "info on X" | `agent_get` | Pass global ID |
| "is X reliable?", "reputation" | `reputation_get` | Returns score + trust tier |
| "top agents", "best agents" | `leaderboard_get` | Chain optional |
| "reviews for X", "feedback" | `feedback_list` | |
| "my wallets" | `wallet_list` | |
| "switch to mainnet" | `network_set` | `mode: 'mainnet'` |
| "OASF skills/domains/tags" | `oasf_list_*` | |

### DO NOT use web search for:
- Agent registry queries (use 8004 tools)
- Reputation/feedback lookups
- OASF standards
- x402 protocol

### Search Strategy
1. **Exact name known** → `agent_search` with `nameQuery`
2. **Partial name** → `cache_search` (fuzzy FTS5)
3. **By capabilities** → `agent_search` with `hasMcp`, `hasA2a`, `mcpTools`, etc.
4. **By owner** → `agent_search` with `owner`

### Write Operation Flow
1. Check `wallet_store_status` - is store initialized and unlocked?
2. If not initialized: `wallet_store_init` (save master password!)
3. If locked: `wallet_store_unlock` with master password
4. If no wallet: `wallet_create` for needed chain
5. Execute write operation
6. Report transaction hash on success
