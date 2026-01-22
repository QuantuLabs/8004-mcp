# @quantulabs/8004-mcp

Multi-chain MCP (Model Context Protocol) server for the ERC-8004 Agent Registry Standard. Supports Solana and EVM chains (Ethereum, Base, Arbitrum, Polygon, Optimism).

## Features

- Multi-chain agent registry (Solana + EVM)
- Unified API with chain-specific extensions
- Wallet management with encrypted storage
- ATOM reputation system (Solana)
- Feedback and validation systems
- Local cache with FTS5 search
- IPFS integration for metadata
- MCP/A2A endpoint crawling

## Installation

```bash
npm install @quantulabs/8004-mcp
```

Or run directly:

```bash
npx @quantulabs/8004-mcp
```

## Configuration

### Environment Variables

```env
# Default chain (sol, base, eth, arb, poly, op)
DEFAULT_CHAIN=sol

# Network mode
NETWORK_MODE=testnet

# Solana
SOLANA_RPC_MAINNET=https://api.mainnet-beta.solana.com
SOLANA_RPC_TESTNET=https://api.devnet.solana.com

# EVM (Base example)
BASE_RPC_MAINNET=https://mainnet.base.org
BASE_RPC_TESTNET=https://sepolia.base.org

# Indexer (optional)
INDEXER_URL=https://indexer.8004.app

# IPFS (optional)
PINATA_JWT=your-pinata-jwt
```

### Claude Code Integration

Add to `~/.claude/mcp_servers.json`:

```json
{
  "mcpServers": {
    "8004-mcp": {
      "command": "npx",
      "args": ["@quantulabs/8004-mcp"],
      "env": {
        "DEFAULT_CHAIN": "sol",
        "NETWORK_MODE": "testnet"
      }
    }
  }
}
```

## Available Tools

### Configuration

| Tool | Description |
|------|-------------|
| `config_get` | Get current configuration |
| `config_set` | Update configuration |
| `config_reset` | Reset to defaults |
| `network_get` | Get network status |
| `network_set` | Switch testnet/mainnet |

### Agent Operations

| Tool | Description |
|------|-------------|
| `agent_get` | Get agent by ID |
| `agent_exists` | Check if agent exists |
| `agent_search` | Search agents |
| `agent_list_by_owner` | List agents by owner |
| `agent_register` | Register new agent |
| `agent_transfer` | Transfer ownership |
| `agent_uri_update` | Update agent URI |
| `agent_metadata_set` | Set on-chain metadata (Solana) |

### Feedback

| Tool | Description |
|------|-------------|
| `feedback_give` | Submit feedback |
| `feedback_read` | Read specific feedback |
| `feedback_list` | List feedbacks for agent |
| `feedback_revoke` | Revoke feedback |
| `feedback_response_append` | Respond to feedback |

### Reputation

| Tool | Description |
|------|-------------|
| `reputation_get` | Get reputation summary |
| `leaderboard_get` | Get top agents |

### Collections

| Tool | Description |
|------|-------------|
| `collection_get` | Get collection details |
| `collection_list` | List collections |
| `collection_agents` | List agents in collection |
| `collection_base_get` | Get base collection |
| `collection_create` | Create collection |
| `collection_uri_update` | Update collection URI |

### Cache

| Tool | Description |
|------|-------------|
| `cache_search` | Full-text search agents |
| `cache_refresh` | Refresh from indexer |
| `cache_stats` | Get cache statistics |
| `cache_sync_status` | Get sync status |

### Wallet Management

| Tool | Description |
|------|-------------|
| `wallet_list` | List all wallets |
| `wallet_info` | Get wallet details |
| `wallet_create` | Create new wallet |
| `wallet_import` | Import existing key |
| `wallet_unlock` | Unlock for signing |
| `wallet_lock` | Lock wallet |
| `wallet_export` | Export encrypted backup |
| `wallet_delete` | Delete wallet |
| `wallet_change_password` | Change password |

### IPFS

| Tool | Description |
|------|-------------|
| `ipfs_configure` | Configure IPFS service |
| `ipfs_add_json` | Store JSON to IPFS |
| `ipfs_add_registration` | Store registration file |
| `ipfs_get_registration` | Fetch registration file |

### OASF Validation

| Tool | Description |
|------|-------------|
| `oasf_validate_skill` | Validate skill slug |
| `oasf_validate_domain` | Validate domain slug |
| `oasf_list_skills` | List all skills |
| `oasf_list_domains` | List all domains |

### Crawler

| Tool | Description |
|------|-------------|
| `crawler_fetch_mcp` | Fetch MCP capabilities |
| `crawler_fetch_a2a` | Fetch A2A agent card |
| `crawler_is_alive` | Health check endpoint |

### Solana-Specific

| Tool | Description |
|------|-------------|
| `solana_atom_stats_get` | Get ATOM stats |
| `solana_atom_stats_initialize` | Initialize ATOM |
| `solana_trust_tier_get` | Get trust tier |
| `solana_enriched_summary_get` | Get enriched summary |
| `solana_agent_wallet_get` | Get agent wallet |
| `solana_sign` | Sign with agent wallet |
| `solana_verify` | Verify signature |
| `solana_validation_request` | Request validation |
| `solana_validation_respond` | Respond to validation |
| `solana_validation_read` | Read validation |
| `solana_validation_wait` | Wait for validation |
| `solana_validation_pending_get` | Get pending validations |

### EVM-Specific

| Tool | Description |
|------|-------------|
| `evm_agent_wallet_set` | Set operational wallet |
| `evm_agent_wallet_unset` | Remove operational wallet |

## Global ID Format

Agents are identified using global IDs:

- Solana: `sol:<asset-pubkey>`
- EVM: `<chain>:<chainId>:<tokenId>` (e.g., `base:8453:123`)

## Example Usage

```
# Search for agents
Use cache_search with query "trading bot"

# Get agent details
Use agent_get with id "sol:AgentPubkeyBase58..."

# Submit feedback
Use feedback_give with id "sol:..." and score 85
```

## Development

```bash
# Build
npm run build

# Run tests
npm test

# Type check
npm run typecheck
```

## License

MIT
