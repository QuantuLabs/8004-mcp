# 8004-mcp Tools Reference

Complete list of all MCP tools available in @quantulabs/8004-mcp.

## Categories

| Category | Prefix |
|----------|--------|
| Configuration | `config_*`, `network_*` |
| Agents | `agent_*` |
| Feedback | `feedback_*` |
| Reputation | `reputation_*`, `leaderboard_*` |
| Collections | `collection_*` |
| Cache | `cache_*` |
| Wallets | `wallet_*` |
| IPFS | `ipfs_*` |
| OASF | `oasf_*` |
| Crawler | `crawler_*` |
| x402 Protocol | `x402_*` |
| Solana-specific | `solana_*` |
| EVM-specific | `evm_*` |

---

## Configuration

| Tool | Description |
|------|-------------|
| `config_get` | Get current configuration |
| `config_set` | Update configuration (chain, RPC, indexer settings) |
| `config_reset` | Reset configuration from environment |
| `network_get` | Get network status for all chains |
| `network_set` | Switch between testnet and mainnet |
| `health_check` | Get server, chain, wallet store, and cache health |
| `faucet_info` | Get funding guidance for a chain (faucets on testnet, owner funding on mainnet) |

## Agent Operations

| Tool | Description |
|------|-------------|
| `agent_get` | Get agent details by ID |
| `agent_exists` | Check if agent exists on-chain |
| `agent_search` | Search agents with filters (name, OASF skills/domains, keyword, feedback, capabilities). If `chain` is omitted, searches all deployed chains in the current network |
| `agent_list_by_owner` | List all agents owned by an address |
| `agent_register` | Register a new agent |
| `agent_transfer` | Transfer agent ownership |
| `agent_uri_update` | Update agent metadata URI |
| `agent_metadata_set` | Set on-chain metadata key-value (Solana only) |

### agent_search Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | string | General search query (name + description) |
| `nameQuery` | string | Search by agent name |
| `descriptionQuery` | string | Search by description |
| `endpointQuery` | string | Search by MCP/A2A endpoint |
| `searchMode` | string | `name`, `description`, `endpoint`, or `all` (default) |
| `owner` | string | Filter by owner address |
| `chain` | string | Chain prefix (`sol`, `base`, `eth`, `poly`, `bsc`, `monad`, `all`). Omit it for default cross-chain discovery across all deployed chains |
| `mcpTools` | string[] | Filter by MCP tools |
| `a2aSkills` | string[] | Filter by A2A skills |
| `oasfSkills` | string[] | Filter by OASF skills (e.g., `web-search`) |
| `oasfDomains` | string[] | Filter by OASF domains (e.g., `finance`) |
| `keyword` | string | Semantic keyword search |
| `minFeedbackCount` | number | Minimum feedback count |
| `minFeedbackValue` | number | Minimum average feedback value |
| `active` | boolean | Filter by active status |
| `x402support` | boolean | Filter by x402 payment support |
| `hasMcp` | boolean | Filter by has MCP endpoint |
| `hasA2a` | boolean | Filter by has A2A endpoint |
| `limit` | number | Max results (default: 20, max: 100) |
| `offset` | number | Pagination offset |

## Feedback

| Tool | Description |
|------|-------------|
| `feedback_give` | Submit feedback for an agent (requires signer) |
| `feedback_read` | Read a single feedback by agent, client, and index |
| `feedback_list` | List all feedbacks for an agent |
| `feedback_revoke` | Revoke a previously given feedback |
| `feedback_response_append` | Append a response to feedback (as agent owner) |

### feedback_give Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Agent ID (global or chain-specific) |
| `value` | number/string | Yes | Metric value - accepts decimal strings (`"99.77"`) or raw integers |
| `valueDecimals` | number | No | Only needed for raw integers. Auto-detected from decimal strings |
| `score` | number | No | Quality score (0-100), optional |
| `tag1` | string | No | Primary standardized tag (e.g., `uptime`, `successrate`, `revenues`) |
| `tag2` | string | No | Time period or x402 network tag (e.g., `day`, `week`, `exact-svm`, `exact-evm`) |
| `comment` | string | No | Optional feedback comment |
| `skipSend` | boolean | No | Return unsigned transaction if true |

**Value Format Examples:**
```json
// Recommended: Decimal string (auto-encoded)
{ "value": "99.77", "tag1": "uptime" }
// → Encoded as value=9977, valueDecimals=2

// Also supported: Raw integer with explicit decimals
{ "value": 9977, "valueDecimals": 2, "tag1": "uptime" }
```

### ATOM Tags (Solana)

The ATOM reputation engine uses standardized tags for automatic normalization:

**tag1 (Category):**
- `starred`
- `reachable`
- `ownerverified`
- `uptime`
- `successrate`
- `responsetime`
- `blocktimefreshness`
- `revenues`
- `tradingyield`

**tag2 (Time Period):**
- `day` - Daily measurement
- `week` - Weekly measurement
- `month` - Monthly measurement
- `year` - Yearly measurement

**x402 / network tags:**
- `x402-resource-delivered`
- `x402-delivery-failed`
- `x402-delivery-timeout`
- `x402-quality-issue`
- `x402-good-payer`
- `x402-payment-failed`
- `x402-insufficient-funds`
- `x402-invalid-signature`
- `exact-evm`
- `exact-svm`

## Reputation

| Tool | Description |
|------|-------------|
| `reputation_get` | Get reputation summary (trust tier, quality score, stats) |
| `leaderboard_get` | Get top agents ranked by reputation |

## Collections

| Tool | Description |
|------|-------------|
| `collection_get` | Get collection details by ID (currently Solana only) |
| `collection_list` | List all collections (currently Solana only) |
| `collection_agents` | List agents in a collection |
| `collection_base_get` | Get the base/default collection (currently Solana only) |
| `collection_create` | Create a new collection (Solana only) |
| `collection_uri_update` | Update collection metadata URI |

`collection_list` is currently Solana-only, fetches the full list first, then applies `limit`/`offset`, and may require an advanced Solana RPC provider that supports `getProgramAccounts` memcmp filters.

## Cache

| Tool | Description |
|------|-------------|
| `cache_search` | Full-text search agents by name (FTS5) |
| `cache_refresh` | Force refresh cache from indexers |
| `cache_stats` | Get cache statistics |
| `cache_sync_status` | Get detailed sync status per data source |

## Wallet Management

| Tool | Description |
|------|-------------|
| `wallet_list` | List all wallets with status |
| `wallet_store_init` | Initialize the encrypted wallet store |
| `wallet_store_unlock` | Unlock the wallet store for write operations |
| `wallet_store_lock` | Lock the wallet store and wipe keys from memory |
| `wallet_store_status` | Get wallet store status |
| `wallet_store_change_password` | Change the wallet store master password |
| `wallet_store_migrate` | Migrate legacy wallets into the wallet store |
| `wallet_info` | Get detailed wallet information |
| `wallet_create` | Create a new wallet (Solana or EVM) |
| `wallet_import` | Import existing private key |
| `wallet_delete` | Delete wallet permanently |
| `wallet_security` | Inspect wallet security settings and status |

## IPFS

IPFS is a global service (chain-agnostic). The Studio MCP upload endpoint works by default; `ipfs_configure` is only needed for overrides.

| Tool | Description |
|------|-------------|
| `ipfs_configure` | Override the Studio MCP upload endpoint or switch to explicit Pinata, Filecoin, or a custom node |
| `ipfs_add_json` | Store JSON data to IPFS |
| `ipfs_add_registration` | Store agent registration file |
| `ipfs_add_image` | Upload an image to IPFS |
| `ipfs_get_registration` | Retrieve registration file by CID |

## OASF Validation

| Tool | Description |
|------|-------------|
| `oasf_validate_skill` | Validate a skill slug format |
| `oasf_validate_domain` | Validate a domain slug format |
| `oasf_list_skills` | List all valid OASF skills |
| `oasf_list_domains` | List all valid OASF domains |
| `oasf_list_tags` | List all valid OASF and x402 tags |
| `oasf_validate_tag` | Validate an OASF/x402 tag slug |

## Crawler

| Tool | Description |
|------|-------------|
| `crawler_fetch_mcp` | Fetch MCP capabilities from endpoint |
| `crawler_fetch_a2a` | Fetch A2A agent card from endpoint |
| `crawler_is_alive` | Health check an endpoint |

For a reachable public endpoint that is not actually an MCP or A2A server, `crawler_fetch_mcp` and `crawler_fetch_a2a` can return `success: true` with `capabilities: null`.

## Solana-Specific: ATOM Reputation

| Tool | Description |
|------|-------------|
| `solana_atom_stats_get` | Get ATOM stats (HyperLogLog, EMA, history) |
| `solana_atom_stats_initialize` | Initialize ATOM stats account |
| `solana_trust_tier_get` | Get trust tier (0-4: Unrated to Platinum) |
| `solana_enriched_summary_get` | Get enriched summary with ATOM metrics |

## Solana-Specific: Agent Wallet

| Tool | Description |
|------|-------------|
| `solana_agent_wallet_get` | Get operational wallet for agent |
| `solana_sign` | Sign data with agent wallet |
| `solana_verify` | Verify signature against agent wallet |

## Solana-Specific: Validation

| Tool | Description |
|------|-------------|
| `solana_validation_request` | Request third-party validation |
| `solana_validation_respond` | Respond to validation request |
| `solana_validation_read` | Read validation request details |
| `solana_validation_wait` | Wait for validation with retry |
| `solana_validation_pending_get` | Archived compatibility shim. Kept for older clients; not a supported live indexer read path |

## EVM-Specific

| Tool | Description |
|------|-------------|
| `evm_agent_wallet_set` | Set operational wallet (EIP-712) |
| `evm_agent_wallet_unset` | Remove operational wallet |

## x402 Protocol Integration

Tools for integrating ERC-8004 agent reputation with the x402 payment protocol.

| Tool | Description |
|------|-------------|
| `x402_identity_build` | Build AgentIdentity for PaymentRequired responses (CAIP-2 format) |
| `x402_proof_parse` | Parse PaymentResponse header and extract proof-of-payment |
| `x402_feedback_build` | Build feedback file for manual storage (IPFS, Arweave, etc.) |
| `x402_feedback_submit` | Submit feedback on-chain with feedbackUri or auto-store on IPFS |

### x402 Tags

**Client → Server (tag1):**
- `x402-resource-delivered` - Service was delivered successfully
- `x402-delivery-failed` - Service delivery failed
- `x402-delivery-timeout` - Service timed out
- `x402-quality-issue` - Quality issues with delivery

**Server → Client (tag1):**
- `x402-good-payer` - Client paid successfully
- `x402-payment-failed` - Payment transaction failed
- `x402-insufficient-funds` - Client had insufficient funds

**Network (tag2):**
- `exact-evm` - EVM-based networks (Ethereum, Base, etc.)
- `exact-svm` - Solana Virtual Machine

### x402_feedback_submit Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `agentId` | string | Yes | Agent ID (global format like sol:xxx or base:8453:123) |
| `value` | number/string | Yes | Raw metric value |
| `valueDecimals` | number | No | Decimal precision (0-6), default 0 |
| `score` | number | No | Quality score (0-100), optional |
| `tag1` | string | Yes | Primary tag (e.g., x402-resource-delivered) |
| `tag2` | string | Yes | Secondary tag (e.g., exact-svm, exact-evm) |
| `proofOfPayment` | object | Yes | Proof of payment object |
| `feedbackUri` | string | No | URI where feedback file is stored |
| `storeOnIpfs` | boolean | No | Store feedback file on IPFS (default: true) |
| `skipSend` | boolean | No | Return unsigned transaction if true |

### Example Flows

#### Option A: Auto-store on IPFS (works out of the box)

```javascript
// 1. Server: Build identity for PaymentRequired response
const identity = await x402_identity_build({ agentId: "sol:AgentPubkey..." });
// Returns: { agentRegistry: "solana:EtWTRA...:HHCVWc...", agentId: "AgentPubkey..." }

// 2. Client: Parse PaymentResponse after payment
const proof = await x402_proof_parse({ paymentResponse: "eyJ0eEhhc2gi..." });
// Returns: { proofOfPayment: { fromAddress, toAddress, chainId, txHash }, settlement: {...} }

// 3. Submit feedback (auto-stores on IPFS)
await x402_feedback_submit({
  agentId: "sol:AgentPubkey...",
  value: 8500,
  valueDecimals: 2,
  tag1: "x402-resource-delivered",
  tag2: "exact-svm",
  endpoint: "https://agent.example.com/api",
  proofOfPayment: proof.proofOfPayment,
  storeOnIpfs: true
});
```

#### Option B: Manual storage with `feedbackUri`

```javascript
// 1. Build feedback file
const result = await x402_feedback_build({
  agentId: "base:84532:123",
  value: 9000,
  valueDecimals: 2,
  tag1: "x402-resource-delivered",
  tag2: "exact-evm",
  endpoint: "https://agent.example.com/api",
  proofOfPayment: { txHash: "0x...", fromAddress: "0x...", toAddress: "0x...", chainId: "84532" }
});
// Returns: { feedbackFile: {...}, sealHash: "0x35d6439b..." }

// 2. Store the file yourself (Arweave, your own IPFS, HTTP server, etc.)
const feedbackUri = "ar://abc123..."; // or "ipfs://Qm...", "https://..."

// 3. Submit with your URI
await x402_feedback_submit({
  agentId: "base:84532:123",
  value: 9000,
  valueDecimals: 2,
  tag1: "x402-resource-delivered",
  tag2: "exact-evm",
  proofOfPayment: result.feedbackFile.proofOfPayment,
  feedbackUri: feedbackUri,  // Your storage URI
  storeOnIpfs: false
});
```

## Global ID Format

Agents use global IDs for cross-chain identification:

| Chain | Format | Example |
|-------|--------|---------|
| Solana | `sol:<pubkey>` | `sol:AgentPubkeyBase58...` |
| Base | `base:<chainId>:<tokenId>` | `base:8453:123` |
| Ethereum | `eth:<chainId>:<tokenId>` | `eth:1:456` |
| Polygon | `poly:<chainId>:<tokenId>` | `poly:137:101` |
| BSC | `bsc:<chainId>:<tokenId>` | `bsc:56:789` |
| Monad | `monad:<chainId>:<tokenId>` | `monad:143:202` |
