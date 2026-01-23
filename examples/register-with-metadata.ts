/**
 * Agent Registration with Rich Metadata Example
 *
 * This example demonstrates how to register an agent with comprehensive
 * metadata including OASF skills, A2A/MCP endpoints, and x402 support.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';

/**
 * Complete agent registration file with all metadata fields
 * This follows the ERC-8004 registration file specification
 */
const agentRegistration = {
  // Required fields
  name: 'AlphaTrader AI',
  description:
    'Advanced AI trading agent specializing in DeFi arbitrage and market making on Solana DEXs.',

  // Visual identity
  image: 'ipfs://QmXyz123.../alpha-trader-logo.png',
  animation_url: 'ipfs://QmXyz456.../demo-video.mp4',
  external_url: 'https://alphatrader.ai',

  // OASF Skills (validated slugs)
  skills: [
    'defi-trading',
    'market-analysis',
    'portfolio-management',
    'risk-assessment',
    'price-prediction',
  ],

  // OASF Domains
  domains: ['finance', 'blockchain', 'trading'],

  // Protocol endpoints
  endpoints: {
    // MCP endpoint for tool invocation
    mcp: {
      url: 'https://api.alphatrader.ai/mcp',
      transport: 'streamable-http',
      version: '2024-11-05',
      capabilities: {
        tools: true,
        resources: true,
        prompts: false,
      },
    },

    // A2A endpoint for agent-to-agent communication
    a2a: {
      url: 'https://api.alphatrader.ai',
      version: '0.1.0',
      capabilities: {
        streaming: true,
        pushNotifications: false,
      },
    },

    // REST API for direct integration
    api: {
      url: 'https://api.alphatrader.ai/v1',
      version: '1.0.0',
      openapi: 'https://api.alphatrader.ai/openapi.json',
    },
  },

  // x402 Payment Support
  x402: {
    enabled: true,
    // Supported payment networks
    networks: [
      {
        chain: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1', // Devnet
        tokens: ['SOL', 'USDC'],
        minPayment: '0.01',
        paymentAddress: 'PaymentPubkey111111111111111111111111111111',
      },
      {
        chain: 'eip155:8453', // Base
        tokens: ['ETH', 'USDC'],
        minPayment: '0.001',
        paymentAddress: '0x1234567890abcdef1234567890abcdef12345678',
      },
    ],
    // Pricing model
    pricing: {
      model: 'per-request',
      basePrice: '0.001 USDC',
      tiers: [
        { requests: 100, discount: 0 },
        { requests: 1000, discount: 10 },
        { requests: 10000, discount: 20 },
      ],
    },
  },

  // Capabilities metadata
  capabilities: {
    languages: ['en', 'es', 'zh'],
    responseTime: '< 500ms',
    uptime: '99.9%',
    rateLimit: '100 req/min',
  },

  // Social and verification
  social: {
    twitter: 'https://twitter.com/alphatrader_ai',
    discord: 'https://discord.gg/alphatrader',
    github: 'https://github.com/alphatrader/agent',
  },

  // Legal and compliance
  legal: {
    termsOfService: 'https://alphatrader.ai/tos',
    privacyPolicy: 'https://alphatrader.ai/privacy',
    license: 'MIT',
  },

  // Version and changelog
  version: '2.1.0',
  releaseNotes: 'Added support for Jupiter DEX aggregation and improved slippage protection.',

  // Custom attributes (chain-specific)
  attributes: [
    { trait_type: 'Category', value: 'Trading' },
    { trait_type: 'Risk Level', value: 'Medium' },
    { trait_type: 'Min Investment', value: '10 SOL' },
    { trait_type: 'Max Drawdown', value: '15%' },
    { trait_type: 'Supported DEXs', value: 'Raydium, Orca, Jupiter' },
  ],
};

async function main() {
  // Start the MCP server
  const server = spawn('npx', ['@quantulabs/8004-mcp'], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  const transport = new StdioClientTransport({
    reader: server.stdout!,
    writer: server.stdin!,
  });

  const client = new Client(
    { name: 'registration-example', version: '1.0.0' },
    { capabilities: {} }
  );

  await client.connect(transport);

  console.log('Connected to 8004-mcp');

  // ============================================
  // Step 1: Configure IPFS (Pinata)
  // ============================================

  console.log('\n--- Step 1: Configure IPFS ---');

  // In production, set PINATA_JWT in environment
  // await client.callTool({
  //   name: 'ipfs_configure',
  //   arguments: {
  //     pinataJwt: process.env.PINATA_JWT,
  //   },
  // });
  console.log('Skipped: Set PINATA_JWT environment variable for IPFS');

  // ============================================
  // Step 2: Validate OASF Skills
  // ============================================

  console.log('\n--- Step 2: Validate OASF Skills ---');

  for (const skill of agentRegistration.skills.slice(0, 2)) {
    const result = await client.callTool({
      name: 'oasf_validate_skill',
      arguments: { skill },
    });
    console.log(`Skill "${skill}":`, JSON.parse((result.content as any)[0].text));
  }

  // ============================================
  // Step 3: Upload Registration to IPFS
  // ============================================

  console.log('\n--- Step 3: Upload Registration to IPFS ---');

  // In production with IPFS configured:
  // const ipfsResult = await client.callTool({
  //   name: 'ipfs_add_registration',
  //   arguments: {
  //     registration: agentRegistration,
  //     name: 'alphatrader-v2.1.0',
  //   },
  // });

  console.log('Registration file structure:');
  console.log(JSON.stringify(agentRegistration, null, 2));

  // ============================================
  // Step 4: Create/Unlock Wallet
  // ============================================

  console.log('\n--- Step 4: Create/Unlock Wallet ---');

  // List existing wallets
  const walletList = await client.callTool({
    name: 'wallet_list',
    arguments: {},
  });
  console.log('Existing wallets:', JSON.parse((walletList.content as any)[0].text));

  // In production:
  // await client.callTool({
  //   name: 'wallet_unlock',
  //   arguments: { name: 'my-wallet', password: '...' },
  // });

  // ============================================
  // Step 5: Register Agent On-Chain
  // ============================================

  console.log('\n--- Step 5: Register Agent ---');

  // For Solana, the registration requires:
  // 1. tokenUri pointing to IPFS (or HTTP)
  // 2. Funded wallet for transaction fees

  console.log('Registration would use:');
  console.log({
    chain: 'sol',
    name: agentRegistration.name,
    tokenUri: 'ipfs://QmRegistrationCID...',
    // The following fields are extracted from tokenUri on EVM:
    description: agentRegistration.description,
    image: agentRegistration.image,
    mcpEndpoint: agentRegistration.endpoints.mcp.url,
    a2aEndpoint: agentRegistration.endpoints.a2a.url,
  });

  // Actual registration (uncomment with funded wallet):
  // const registerResult = await client.callTool({
  //   name: 'agent_register',
  //   arguments: {
  //     chain: 'sol',
  //     tokenUri: ipfsResult.uri,
  //     name: agentRegistration.name,
  //   },
  // });

  // ============================================
  // Step 6: Initialize ATOM Stats (Solana)
  // ============================================

  console.log('\n--- Step 6: Initialize ATOM Stats ---');

  // After registration, initialize the ATOM reputation account
  // This is required before the agent can receive feedback

  console.log('After registration, initialize ATOM:');
  console.log({
    tool: 'solana_atom_stats_initialize',
    asset: 'NewAgentPubkey...',
  });

  // ============================================
  // Step 7: Announce x402 Support
  // ============================================

  console.log('\n--- Step 7: Build x402 Identity ---');

  // Once registered, use x402_identity_build to get the CAIP-2 identity
  // for including in 402 Payment Required responses

  // const x402Identity = await client.callTool({
  //   name: 'x402_identity_build',
  //   arguments: {
  //     agentId: 'sol:NewAgentPubkey...',
  //   },
  // });

  console.log('x402 identity would be:');
  console.log({
    agentRegistry: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1:HHCVWcqs...',
    agentId: 'NewAgentPubkey...',
  });

  // Cleanup
  await client.close();
  server.kill();

  console.log('\n--- Registration Example Complete ---');
  console.log('\nNext steps:');
  console.log('1. Fund your wallet with SOL for transaction fees');
  console.log('2. Configure IPFS with Pinata JWT');
  console.log('3. Run the actual registration');
  console.log('4. Initialize ATOM stats for reputation tracking');
  console.log('5. Start accepting x402 payments!');
}

main().catch(console.error);
