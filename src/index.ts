#!/usr/bin/env node

// @quantulabs/8004-mcp - Multi-chain Agent Registry MCP Server

import 'dotenv/config';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { globalState } from './state/global-state.js';
import { SolanaChainProvider } from './chains/solana/provider.js';
import { SolanaDataSource } from './chains/solana/data-source.js';
import { EVMChainProvider } from './chains/evm/provider.js';
import { loadEnvConfig } from './config/env.js';
import { CHAIN_CONFIGS, getDeployedChains } from './config/defaults.js';
import type { ChainPrefix } from './core/interfaces/agent.js';
import {
  registerUnifiedTools,
  registerSolanaTools,
  getAllTools,
} from './tools/definitions.js';
import { formatOutput } from './core/serializers/common.js';
import { getWalletManager } from './core/wallet/index.js';

const SERVER_NAME = '8004-mcp';
const SERVER_VERSION = '0.1.0';

async function main() {
  // Load environment configuration
  const envConfig = loadEnvConfig();

  // Create MCP server
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } }
  );

  // Initialize Solana provider
  const solanaProvider = new SolanaChainProvider(
    {
      cluster: envConfig.solana.cluster,
      rpcUrl: envConfig.solana.rpcUrl,
      indexerUrl: envConfig.indexer.url,
      indexerApiKey: envConfig.indexer.apiKey,
      useIndexer: envConfig.indexer.enabled,
      indexerFallback: envConfig.indexer.fallback,
      forceOnChain: envConfig.indexer.forceOnChain,
    },
    envConfig.solana.privateKey
  );

  // Register chain provider
  globalState.chains.register(solanaProvider);

  // Initialize and register EVM chain providers for deployed chains
  const deployedChains = getDeployedChains(envConfig.networkMode || 'testnet');
  const evmChains = deployedChains.filter(
    (prefix) => CHAIN_CONFIGS[prefix as ChainPrefix]?.chainType === 'evm'
  );

  for (const prefix of evmChains) {
    const chainConfig = CHAIN_CONFIGS[prefix as ChainPrefix];
    const networkConfig =
      envConfig.networkMode === 'mainnet' ? chainConfig.mainnet : chainConfig.testnet;

    const evmProvider = new EVMChainProvider({
      chainId: networkConfig.chainId as number,
      chainPrefix: prefix as ChainPrefix,
      rpcUrl: networkConfig.rpcUrl,
      subgraphUrl: networkConfig.subgraphUrl,
    });

    globalState.chains.register(evmProvider);
  }

  // Register tools
  registerUnifiedTools(globalState.tools);
  registerSolanaTools(globalState.tools, () => solanaProvider.getState());

  // Initialize global state (cache, etc.)
  await globalState.initialize({
    autoSync: true,
  });

  // Register Solana data source for cache sync
  if (solanaProvider.getState().getIndexer()) {
    const solanaDataSource = new SolanaDataSource(
      solanaProvider.getState().getIndexer()!,
      envConfig.solana.cluster
    );
    globalState.cache.registerDataSource(solanaDataSource);
  }

  // Start background sync
  globalState.start();

  // Handle list tools request
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: getAllTools(globalState.tools) };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const handler = globalState.tools.getHandler(name);
    if (!handler) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    try {
      const result = await handler(args);

      // Handle pre-formatted responses
      if (
        result &&
        typeof result === 'object' &&
        'content' in result &&
        Array.isArray((result as { content: unknown[] }).content)
      ) {
        return result as { content: Array<{ type: 'text'; text: string }> };
      }

      // Format other responses
      return {
        content: [{ type: 'text', text: formatOutput(result) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  // Cleanup on exit
  process.on('SIGINT', () => {
    globalState.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    globalState.stop();
    process.exit(0);
  });

  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Check wallet status
  const walletManager = getWalletManager();
  const walletList = await walletManager.list();

  console.error(`${SERVER_NAME} v${SERVER_VERSION} started`);
  console.error(`Network mode: ${envConfig.networkMode}`);
  console.error(`Chains: Solana ${envConfig.solana.cluster}${evmChains.length > 0 ? ', ' + evmChains.join(', ') : ''}`);
  console.error(`Tools registered: ${globalState.tools.size()}`);
  if (walletList.wallets.length === 0) {
    console.error(`Wallets: none (use wallet_create to create a wallet)`);
  } else {
    console.error(`Wallets: ${walletList.wallets.length} total, ${walletList.unlockedCount} unlocked`);
    if (walletList.unlockedCount === 0) {
      console.error(`  (use wallet_unlock to enable signing)`);
    }
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
