# @quantulabs/8004-mcp

Multi-chain MCP server for the ERC-8004 Agent Registry Standard. Supports Solana and EVM chains (Ethereum, Base, Arbitrum, Polygon, Optimism).

## Requirements

- Node.js >= 20.0.0
- npm or pnpm

## Installation

```bash
npm install -g @quantulabs/8004-mcp
```

Or run directly without installing:

```bash
npx @quantulabs/8004-mcp
```

## Features

- **Multi-chain**: Solana + EVM (Base, Ethereum, Arbitrum, Polygon, Optimism)
- **Unified API**: Same tools work across chains with automatic routing
- **Wallet Management**: Encrypted local storage with auto-lock
- **Local Cache**: SQLite with FTS5 for fast agent search
- **ATOM Reputation**: Full integration with Solana's reputation system
- **IPFS Support**: Pinata, Filecoin, or custom node

## Configuration

The MCP automatically loads a `.env` file from the current directory.

```bash
cp .env.example .env
# Edit .env with your values
npx @quantulabs/8004-mcp
```

See [.env.example](./.env.example) for all available options.

## Usage with Claude Code

### Quick Start

```bash
claude mcp add 8004-mcp -- npx @quantulabs/8004-mcp
```

With configuration:

```bash
claude mcp add 8004-mcp \
  -e DEFAULT_CHAIN=sol \
  -e NETWORK_MODE=testnet \
  -e PINATA_JWT=your-jwt \
  -- npx @quantulabs/8004-mcp
```

### Examples

#### Search for AI agents

```
> Find trading agents on Solana with good reputation

I'll search for trading agents using the cache_search tool.

Found 5 agents matching "trading":
1. sol:7xKXt... - "AlphaTrader" - Trust: Gold (87/100)
2. sol:9mPQr... - "DeFi Trading Bot" - Trust: Silver (72/100)
...
```

#### Get agent details

```
> Show me details about agent sol:7xKXtG8vN2...

Using agent_get to fetch details...

Agent: AlphaTrader
- Owner: 5kR9x...
- Trust Tier: Gold
- Quality Score: 87/100
- Total Feedbacks: 156
- MCP Endpoint: https://alpha.trading/mcp
```

#### Check agent reputation

```
> What's the reputation of sol:7xKXtG8vN2...?

Using reputation_get...

Trust Tier: Gold (3/4)
Quality Score: 87
Unique Clients: 89
Total Feedbacks: 156
Positive Rate: 94%
```

#### Submit feedback

```
> Give a score of 90 to agent sol:7xKXtG8vN2... with comment "Fast execution"

First I need to unlock a wallet. Using wallet_unlock...
Now submitting feedback with feedback_give...

Feedback submitted successfully!
Transaction: 4xR7m...
```

#### Register a new agent

```
> Register a new agent called "MyBot" with MCP endpoint https://mybot.com/mcp

I'll help you register a new agent:
1. First, let me upload the registration file to IPFS...
2. Now registering on-chain with agent_register...

Agent registered!
- ID: sol:NewAgentPubkey...
- Name: MyBot
- Transaction: 5tY8n...
```

#### Manage wallets

```
> Create a new Solana wallet called "trading-wallet"

Using wallet_create...

Wallet created:
- Name: trading-wallet
- Address: 8xM2k...
- Chain: Solana

Fund this address to start using it for transactions.
```

#### Switch networks

```
> Switch to mainnet

Using network_set with mode "mainnet"...

Switched to mainnet. Active chains:
- Solana: mainnet-beta
- Base: mainnet (chainId: 8453)
- Ethereum: mainnet (chainId: 1)
```

## Tools

See [TOOLS.md](./TOOLS.md) for the complete list of 60+ available tools.

## Global ID Format

Agents are identified using global IDs:

- Solana: `sol:<pubkey>`
- EVM: `<chain>:<chainId>:<tokenId>`

Examples:
- `sol:7xKXtG8vN2mPQr...`
- `base:8453:123`
- `eth:1:456`

## Development

```bash
git clone https://github.com/QuantuLabs/8004-mcp.git
cd 8004-mcp
npm install
npm run build
npm test
```

## License

MIT
