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

#### x402 Payment Integration

Submit feedback with proof-of-payment from x402 transactions:

```
> Submit x402 feedback for agent sol:7xKXtG8vN2... with payment proof

Using x402_feedback_submit...

Feedback submitted with proof-of-payment:
- Score: 85
- Tag: x402-resource-delivered
- Proof: txHash 5xR7m... verified
- Stored on IPFS: ipfs://QmXyz...
- Transaction: 6tY8n...
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

## x402 Protocol Integration

The MCP supports the x402 payment protocol extension for reputation (`8004-reputation`). This allows linking feedback to actual payment transactions, creating verifiable proof-of-payment reputation.

### How it works

1. **Server announces identity**: When returning 402 Payment Required, include agent identity in CAIP-2 format
2. **Client pays**: Standard x402 payment flow
3. **Feedback with proof**: Both parties can submit feedback linked to the payment transaction

### Example: Connecting to 8004-mcp

```javascript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';

// Start the MCP server
const server = spawn('npx', ['@quantulabs/8004-mcp'], {
  stdio: ['pipe', 'pipe', 'inherit'],
});

const transport = new StdioClientTransport({
  reader: server.stdout,
  writer: server.stdin,
});

const mcpClient = new Client(
  { name: 'my-app', version: '1.0.0' },
  { capabilities: {} }
);

await mcpClient.connect(transport);
```

### Example: Server-side (announcing identity)

```javascript
// Build identity for PaymentRequired response
const result = await mcpClient.callTool({
  name: 'x402_identity_build',
  arguments: { agentId: 'sol:AgentPubkey...' }
});

const identity = JSON.parse(result.content[0].text);
// Returns: { identity: { agentRegistry: "solana:EtWTRA...:HHCVWc...", agentId: "..." } }

// Add to PaymentRequired headers
const paymentRequired = {
  ...standardX402Fields,
  extensions: {
    '8004-reputation': identity.identity
  }
};
```

### Example: Client-side (submitting feedback)

```javascript
// After receiving PaymentResponse, parse the proof
const proofResult = await mcpClient.callTool({
  name: 'x402_proof_parse',
  arguments: { paymentResponse: base64EncodedPaymentResponse }
});

const proof = JSON.parse(proofResult.content[0].text);

// Submit feedback with proof
await mcpClient.callTool({
  name: 'x402_feedback_submit',
  arguments: {
    agentId: 'sol:AgentPubkey...',
    score: 85,
    tag1: 'x402-resource-delivered',
    tag2: 'exact-svm',
    endpoint: 'https://agent.example.com/api',
    proofOfPayment: proof.proofOfPayment,
    storeOnIpfs: true
  }
});
```

### Feedback File (IPFS)

When `storeOnIpfs: true`, the complete feedback is stored on IPFS:

```json
{
  "agentRegistry": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1:HHCVWcqs...",
  "agentId": "AgentPubkey...",
  "clientAddress": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1:ClientPubkey...",
  "createdAt": "2026-01-23T12:00:00Z",
  "score": 85,
  "tag1": "x402-resource-delivered",
  "tag2": "exact-svm",
  "endpoint": "https://agent.example.com/api",
  "proofOfPayment": {
    "fromAddress": "ClientPubkey...",
    "toAddress": "AgentPubkey...",
    "chainId": "EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
    "txHash": "5xR7mN2k..."
  }
}
```

See [TOOLS.md](./TOOLS.md#x402-protocol-integration) for more details on x402 tools.

## Development

```bash
git clone https://github.com/QuantuLabs/8004-mcp.git
cd 8004-mcp
npm install
npm run build
npm test
```

## Adding Your Registry

> **Note:** Registries supported by the [8004-solana SDK](https://github.com/QuantuLabs/8004-solana) and [agent0-ts SDK](https://github.com/agent0lab/agent0-ts) are automatically included in this MCP. No action needed for those chains.

Want to add your own ERC-8004 compatible registry to the MCP? [Open an issue on GitHub](https://github.com/QuantuLabs/8004-mcp/issues/new?template=registry-request.md) with the following requirements:

### Requirements

1. **Open Source**: Your registry must be public and open source
   - Provide link to your GitHub repository

2. **Indexer**: Provide an open source indexer or equivalent data access method
   - We need a way to query agents efficiently
   - Subgraph, REST API, or RPC-based indexing supported

3. **Documentation**: Complete API documentation including:
   - All contract methods and events
   - Data structures and types
   - Example requests/responses

4. **API Compatibility**: We recommend following the [8004-solana SDK](https://github.com/QuantuLabs/8004-solana) API patterns:
   - `getAgent(id)` - Get agent details
   - `agentExists(id)` - Check existence
   - `searchAgents(params)` - Search with filters
   - `giveFeedback(input)` - Submit feedback
   - `getFeedback(agentId, client, index)` - Read feedback
   - `listFeedbacks(query)` - List feedbacks
   - `getReputationSummary(id)` - Get reputation

### How to Submit

[Open an issue](https://github.com/QuantuLabs/8004-mcp/issues/new) with:
- Link to your registry repository (public, open source)
- Link to your indexer or data source (open source)
- Link to API documentation
- Contract addresses (testnet and/or mainnet)

We review submissions regularly and will provide feedback.

## License

MIT
