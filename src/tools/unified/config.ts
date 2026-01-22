// Unified config tools

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getArgs, readString, readNumber, readBoolean } from '../../core/parsers/common.js';
import { successResponse, errorResponse } from '../../core/serializers/common.js';
import { globalState } from '../../state/global-state.js';
import type { SolanaChainProvider } from '../../chains/solana/provider.js';
import type { NetworkMode } from '../../config/defaults.js';

export const configTools: Tool[] = [
  {
    name: 'config_get',
    description: 'Get current MCP configuration including chain settings, network mode, signer status, and cache statistics',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'config_set',
    description: 'Update runtime configuration (chain, network mode, RPC URL, indexer settings, etc.)',
    inputSchema: {
      type: 'object',
      properties: {
        chain: {
          type: 'string',
          description: 'Default chain to use (sol, base, eth, arb, poly, op)',
        },
        networkMode: {
          type: 'string',
          enum: ['testnet', 'mainnet'],
          description: 'Network mode: testnet (devnet/sepolia) or mainnet',
        },
        rpcUrl: {
          type: 'string',
          description: 'Custom RPC URL for the current chain',
        },
        indexerUrl: {
          type: 'string',
          description: 'Indexer service URL',
        },
        useIndexer: {
          type: 'boolean',
          description: 'Enable/disable indexer queries',
        },
        indexerFallback: {
          type: 'boolean',
          description: 'Fallback to RPC on indexer failure',
        },
        forceOnChain: {
          type: 'boolean',
          description: 'Force on-chain queries only',
        },
        crawlerTimeoutMs: {
          type: 'number',
          description: 'Timeout for MCP/A2A crawler (ms)',
        },
      },
    },
  },
  {
    name: 'config_reset',
    description: 'Reset configuration from environment variables (including network mode to testnet)',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'network_get',
    description: 'Get current network mode and status of all chains (testnet/mainnet deployment status)',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'network_set',
    description: 'Switch between testnet and mainnet for all chains. WARNING: Only chains with deployed contracts will be available.',
    inputSchema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['testnet', 'mainnet'],
          description: 'Network mode: testnet (devnet/sepolia/amoy) or mainnet',
        },
      },
      required: ['mode'],
    },
  },
];

export const configHandlers: Record<string, (args: unknown) => Promise<unknown>> = {
  config_get: async () => {
    const snapshot = globalState.getSnapshot();

    // Get Solana-specific state if available
    const solanaProvider = globalState.chains.getByPrefix('sol') as SolanaChainProvider | null;
    const solanaState = solanaProvider?.getState().getSnapshot();

    return successResponse({
      ...snapshot,
      solana: solanaState,
    });
  },

  config_set: async (args: unknown) => {
    const input = getArgs(args);
    const changes: string[] = [];

    // Handle network mode change
    const networkMode = readString(input, 'networkMode') as NetworkMode | undefined;
    if (networkMode && (networkMode === 'testnet' || networkMode === 'mainnet')) {
      const result = globalState.setNetworkMode(networkMode);
      changes.push(`Network mode: ${result.previous} → ${result.current}`);

      if (result.deployedChains.length === 0) {
        return errorResponse(
          `No chains have deployed contracts for ${networkMode} mode. ` +
          'Use network_get to see deployment status.'
        );
      }
    }

    // Handle chain default change
    const chain = readString(input, 'chain');
    if (chain) {
      const chainId = chain === 'solana' ? 'sol' : chain;
      if (globalState.chains.has(chainId)) {
        globalState.chains.setDefault(chainId);
        changes.push(`Default chain: ${chainId}`);
      }
    }

    // Handle Solana-specific config
    const solanaProvider = globalState.chains.getByPrefix('sol') as SolanaChainProvider | null;
    if (solanaProvider) {
      const state = solanaProvider.getState();
      const updates: Record<string, unknown> = {};

      const rpcUrl = readString(input, 'rpcUrl');
      if (rpcUrl) {
        updates.rpcUrl = rpcUrl;
        changes.push(`RPC URL: ${rpcUrl}`);
      }

      const indexerUrl = readString(input, 'indexerUrl');
      if (indexerUrl) {
        updates.indexerUrl = indexerUrl;
        changes.push(`Indexer URL: ${indexerUrl}`);
      }

      const useIndexer = readBoolean(input, 'useIndexer');
      if (useIndexer !== undefined) {
        updates.useIndexer = useIndexer;
        changes.push(`Use indexer: ${useIndexer}`);
      }

      const indexerFallback = readBoolean(input, 'indexerFallback');
      if (indexerFallback !== undefined) {
        updates.indexerFallback = indexerFallback;
        changes.push(`Indexer fallback: ${indexerFallback}`);
      }

      const forceOnChain = readBoolean(input, 'forceOnChain');
      if (forceOnChain !== undefined) {
        updates.forceOnChain = forceOnChain;
        changes.push(`Force on-chain: ${forceOnChain}`);
      }

      if (Object.keys(updates).length > 0) {
        state.setConfig(updates as Parameters<typeof state.setConfig>[0]);
      }
    }

    // Handle crawler timeout
    const crawlerTimeoutMs = readNumber(input, 'crawlerTimeoutMs');
    if (crawlerTimeoutMs !== undefined) {
      globalState.crawlerTimeoutMs = crawlerTimeoutMs;
      changes.push(`Crawler timeout: ${crawlerTimeoutMs}ms`);
    }

    return successResponse({
      message: changes.length > 0 ? `Configuration updated:\n- ${changes.join('\n- ')}` : 'No changes made',
      snapshot: globalState.getSnapshot(),
    });
  },

  config_reset: async () => {
    globalState.resetConfig();
    return successResponse({
      message: 'Configuration reset from environment (network mode: testnet)',
      snapshot: globalState.getSnapshot(),
    });
  },

  network_get: async () => {
    const status = globalState.getNetworkStatus();

    // Format chain status for display
    const chainLines = Object.entries(status.chainStatus).map(([prefix, info]) => {
      const deployedIcon = info.deployed ? '✓' : '✗';
      const indexerIcon = info.hasSubgraph ? '📊' : '';
      return `  ${prefix}: ${deployedIcon} ${info.displayName} (chain ${info.chainId}) ${indexerIcon}`;
    });

    return successResponse({
      mode: status.mode,
      deployedChains: status.deployedChains,
      chainStatus: status.chainStatus,
      summary: `Network Mode: ${status.mode.toUpperCase()}\n` +
        `Deployed Chains: ${status.deployedChains.length > 0 ? status.deployedChains.join(', ') : 'none'}\n\n` +
        `Chain Status:\n${chainLines.join('\n')}`,
    });
  },

  network_set: async (args: unknown) => {
    const input = getArgs(args);
    const mode = readString(input, 'mode') as NetworkMode;

    if (!mode || (mode !== 'testnet' && mode !== 'mainnet')) {
      return errorResponse('Invalid network mode. Use "testnet" or "mainnet".');
    }

    const result = globalState.setNetworkMode(mode);

    if (result.deployedChains.length === 0) {
      return successResponse({
        warning: `⚠️ No chains have deployed contracts for ${mode} mode yet.`,
        previous: result.previous,
        current: result.current,
        deployedChains: result.deployedChains,
        network: globalState.getNetworkStatus(),
      });
    }

    return successResponse({
      message: `Network mode switched: ${result.previous} → ${result.current}`,
      previous: result.previous,
      current: result.current,
      deployedChains: result.deployedChains,
      network: globalState.getNetworkStatus(),
    });
  },
};

// Backward compatibility aliases
export const configAliases: Record<string, string> = {};
