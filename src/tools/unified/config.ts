// Unified config tools

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getArgs, readString, readNumber, readBoolean } from '../../core/parsers/common.js';
import { successResponse, errorResponse } from '../../core/serializers/common.js';
import { globalState } from '../../state/global-state.js';
import type { SolanaChainProvider } from '../../chains/solana/provider.js';
import type { NetworkMode } from '../../config/defaults.js';
import { getWalletStore } from '../../core/wallet/index.js';

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
  {
    name: 'health_check',
    description: 'Check system health: server status, chain connectivity, wallet store status, and cache stats. Use this first to diagnose issues.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'faucet_info',
    description: 'Get testnet faucet URLs and funding info for a chain. Returns faucet links and minimum balance needed for registration.',
    inputSchema: {
      type: 'object',
      properties: {
        chain: {
          type: 'string',
          description: 'Chain to get faucet info for (sol, eth, base, arb, poly, op)',
        },
      },
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

  health_check: async () => {
    const walletStore = getWalletStore();

    // Get network status safely
    let networkStatus: { mode: string; deployedChains: string[] };
    try {
      networkStatus = globalState.getNetworkStatus();
    } catch {
      networkStatus = { mode: 'unknown', deployedChains: [] };
    }

    // Check each chain's RPC connectivity
    const chainHealth: Record<string, { status: string; latency?: number; error?: string }> = {};

    for (const prefix of networkStatus.deployedChains) {
      try {
        const provider = globalState.chains.getByPrefix(prefix as 'sol' | 'eth' | 'base' | 'arb' | 'poly' | 'op');
        if (provider) {
          const start = Date.now();
          chainHealth[prefix] = { status: 'ok', latency: Date.now() - start };
        } else {
          chainHealth[prefix] = { status: 'not_initialized' };
        }
      } catch (err) {
        chainHealth[prefix] = {
          status: 'error',
          error: err instanceof Error ? err.message : 'Unknown error'
        };
      }
    }

    // Wallet store status
    let walletStoreStatus: string;
    try {
      if (!walletStore.isInitialized()) {
        walletStoreStatus = 'not_initialized';
      } else if (walletStore.isUnlocked()) {
        walletStoreStatus = 'unlocked';
      } else {
        walletStoreStatus = 'locked';
      }
    } catch {
      walletStoreStatus = 'error';
    }

    // Cache stats - simplified (may not be initialized yet)
    let cacheStats = 'not_initialized';
    try {
      if (globalState.cache) {
        cacheStats = 'available';
      }
    } catch {
      // Cache not initialized - that's OK
    }

    return successResponse({
      server: 'ok',
      version: '0.3.0',
      networkMode: networkStatus.mode,
      chains: chainHealth,
      walletStore: walletStoreStatus,
      cache: cacheStats,
      hint: walletStoreStatus === 'not_initialized'
        ? 'Run wallet_store_init to create wallet store'
        : walletStoreStatus === 'locked'
        ? 'Run wallet_store_unlock to enable write operations'
        : undefined,
    });
  },

  faucet_info: async (args: unknown) => {
    const input = getArgs(args);
    const chain = readString(input, 'chain') || globalState.chains.getDefault()?.chainPrefix || 'eth';
    const networkStatus = globalState.getNetworkStatus();

    if (networkStatus.mode === 'mainnet') {
      // Get wallet address for mainnet funding request
      const walletStore = getWalletStore();
      let walletAddress: string | undefined;
      try {
        if (walletStore.isUnlocked()) {
          const wallets = walletStore.listWallets();
          const chainType = chain === 'sol' ? 'solana' : 'evm';
          const wallet = wallets.find(w => w.chainType === chainType);
          walletAddress = wallet?.address;
        }
      } catch { /* ignore */ }

      const ownerMessage = walletAddress
        ? `Please fund my mainnet wallet:\n` +
          `Chain: ${chain.toUpperCase()}\n` +
          `Address: ${walletAddress}\n` +
          `Note: This requires real funds (not testnet)`
        : null;

      return successResponse({
        chain,
        network: 'mainnet',
        message: 'Mainnet mode - no faucets available. Ask your owner to fund your wallet with real funds.',
        warning: 'Registration on mainnet costs real money!',
        walletAddress: walletAddress || 'No wallet created yet',
        askOwnerToFund: ownerMessage,
        nextSteps: walletAddress
          ? ['1. Send the funding request message to your owner', '2. Wait for real funds', '3. Ready for agent_register!']
          : [`1. Create wallet: wallet_create({ name: "my-wallet", chainType: "${chain === 'sol' ? 'solana' : 'evm'}" })`, '2. Run faucet_info again'],
      });
    }

    const faucets: Record<string, {
      name: string;
      chainId: number;
      faucets: { name: string; url: string; note: string }[];
      explorerUrl: string;
    }> = {
      sol: {
        name: 'Solana Devnet',
        chainId: 0,
        faucets: [
          { name: 'Solana CLI', url: 'solana airdrop 2 --url devnet', note: '2 SOL per request' },
          { name: 'SolFaucet', url: 'https://solfaucet.com/', note: 'Web faucet' },
        ],
        explorerUrl: 'https://explorer.solana.com/?cluster=devnet',
      },
      eth: {
        name: 'Ethereum Sepolia',
        chainId: 11155111,
        faucets: [
          { name: 'Alchemy Faucet', url: 'https://www.alchemy.com/faucets/ethereum-sepolia', note: '0.5 ETH/day, requires account' },
          { name: 'Sepolia PoW Faucet', url: 'https://sepolia-faucet.pk910.de/', note: 'Mining-based, no limits' },
          { name: 'QuickNode Faucet', url: 'https://faucet.quicknode.com/ethereum/sepolia', note: 'Requires QuickNode account' },
        ],
        explorerUrl: 'https://sepolia.etherscan.io',
      },
      base: {
        name: 'Base Sepolia',
        chainId: 84532,
        faucets: [
          { name: 'Alchemy Faucet', url: 'https://www.alchemy.com/faucets/base-sepolia', note: 'Requires account' },
          { name: 'Coinbase Faucet', url: 'https://portal.cdp.coinbase.com/products/faucet', note: 'Requires Coinbase account' },
        ],
        explorerUrl: 'https://sepolia.basescan.org',
      },
      arb: {
        name: 'Arbitrum Sepolia',
        chainId: 421614,
        faucets: [
          { name: 'Alchemy Faucet', url: 'https://www.alchemy.com/faucets/arbitrum-sepolia', note: 'Requires account' },
          { name: 'Triangle Faucet', url: 'https://faucet.triangleplatform.com/arbitrum/sepolia', note: 'Free' },
        ],
        explorerUrl: 'https://sepolia.arbiscan.io',
      },
      poly: {
        name: 'Polygon Amoy',
        chainId: 80002,
        faucets: [
          { name: 'Polygon Faucet', url: 'https://faucet.polygon.technology/', note: 'Official faucet' },
          { name: 'Alchemy Faucet', url: 'https://www.alchemy.com/faucets/polygon-amoy', note: 'Requires account' },
        ],
        explorerUrl: 'https://amoy.polygonscan.com',
      },
      op: {
        name: 'Optimism Sepolia',
        chainId: 11155420,
        faucets: [
          { name: 'Superchain Faucet', url: 'https://app.optimism.io/faucet', note: 'Official OP faucet' },
          { name: 'Alchemy Faucet', url: 'https://www.alchemy.com/faucets/optimism-sepolia', note: 'Requires account' },
        ],
        explorerUrl: 'https://sepolia-optimism.etherscan.io',
      },
    };

    const info = faucets[chain];
    if (!info) {
      return errorResponse(`Unknown chain: ${chain}. Valid: sol, eth, base, arb, poly, op`);
    }

    // Get wallet address if available
    const walletStore = getWalletStore();
    let walletAddress: string | undefined;
    if (walletStore.isUnlocked()) {
      const wallets = walletStore.listWallets();
      const chainType = chain === 'sol' ? 'solana' : 'evm';
      const wallet = wallets.find(w => w.chainType === chainType);
      walletAddress = wallet?.address;
    }

    // Build message for owner (without hardcoded amount - agent should use estimateCost)
    const ownerMessage = walletAddress
      ? `Please fund my ${info.name} wallet:\n` +
        `Address: ${walletAddress}\n` +
        `Explorer: ${info.explorerUrl}/address/${walletAddress}\n` +
        `(Run agent_register with estimateCost:true to get exact amount needed)`
      : null;

    return successResponse({
      chain,
      ...info,
      walletAddress: walletAddress || 'No wallet created yet - run wallet_create first',
      getCostEstimate: `agent_register({ chain: "${chain}", estimateCost: true })`,
      agentNote: 'Most faucets require human interaction (captchas, account creation). Ask your owner to fund your wallet.',
      askOwnerToFund: ownerMessage,
      nextSteps: walletAddress
        ? [
            `1. Get exact cost: agent_register({ chain: "${chain}", estimateCost: true })`,
            '2. Ask your owner to fund your wallet with the estimated amount',
            '3. Or try a faucet if available (may require captcha)',
            '4. Wait for funds to arrive',
            '5. Ready for agent_register!',
          ]
        : [
            `1. Create wallet: wallet_create({ name: "my-wallet", chainType: "${chain === 'sol' ? 'solana' : 'evm'}" })`,
            '2. Run faucet_info again to get funding instructions',
          ],
    });
  },
};

// Backward compatibility aliases
export const configAliases: Record<string, string> = {};
