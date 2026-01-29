// Default configuration values and network configs

import type { ChainType, ChainPrefix } from '../core/interfaces/agent.js';

// Network mode: testnet for development, mainnet for production
export type NetworkMode = 'testnet' | 'mainnet';

export const DEFAULT_NETWORK_MODE: NetworkMode = 'testnet';
export const DEFAULT_CRAWLER_TIMEOUT_MS = 5000;
export const DEFAULT_SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Chain network configuration
export interface ChainNetworkConfig {
  chainId: number | string; // number for EVM, string for Solana cluster
  rpcUrl: string;
  subgraphUrl?: string;
  indexerUrl?: string;
  registries: {
    identity: string;
    reputation: string;
    validation?: string;
  };
  blockExplorer?: string;
}

// Full chain configuration with both networks
export interface ChainConfig {
  prefix: ChainPrefix;
  chainType: ChainType;
  displayName: string;
  testnet: ChainNetworkConfig;
  mainnet: ChainNetworkConfig;
}

// All supported chains with their testnet/mainnet configurations
export const CHAIN_CONFIGS: Record<ChainPrefix, ChainConfig> = {
  // Solana
  sol: {
    prefix: 'sol',
    chainType: 'solana',
    displayName: 'Solana',
    testnet: {
      chainId: 'devnet',
      rpcUrl: 'https://api.devnet.solana.com',
      // Supabase indexer for Solana devnet
      indexerUrl: 'https://uhjytdjxvfbppgjicfly.supabase.co/rest/v1',
      registries: {
        identity: '8oo4SbcgjRBAXjmGU4YMcdFqfeLLrtn7n6f358PkAc3N',
        reputation: '8oo4SbcgjRBAXjmGU4YMcdFqfeLLrtn7n6f358PkAc3N', // Same program
        validation: '8oo4SbcgjRBAXjmGU4YMcdFqfeLLrtn7n6f358PkAc3N',
      },
      blockExplorer: 'https://explorer.solana.com/?cluster=devnet',
    },
    mainnet: {
      chainId: 'mainnet-beta',
      rpcUrl: 'https://api.mainnet-beta.solana.com',
      indexerUrl: '', // TBD
      registries: {
        identity: '', // TBD - mainnet deployment
        reputation: '',
        validation: '',
      },
      blockExplorer: 'https://explorer.solana.com',
    },
  },

  // Base
  base: {
    prefix: 'base',
    chainType: 'evm',
    displayName: 'Base',
    testnet: {
      chainId: 84532, // Base Sepolia
      rpcUrl: 'https://sepolia.base.org',
      subgraphUrl: '', // Subgraph deprecated - use on-chain queries
      registries: {
        identity: '0x8004AA63c570c570eBF15376c0dB199918BFe9Fb',
        reputation: '0x8004bd8daB57f14Ed299135749a5CB5c42d341BF',
      },
      blockExplorer: 'https://sepolia.basescan.org',
    },
    mainnet: {
      chainId: 8453, // Base Mainnet
      rpcUrl: 'https://mainnet.base.org',
      subgraphUrl: '', // TBD
      registries: {
        identity: '', // TBD - mainnet deployment
        reputation: '',
      },
      blockExplorer: 'https://basescan.org',
    },
  },

  // Ethereum
  eth: {
    prefix: 'eth',
    chainType: 'evm',
    displayName: 'Ethereum',
    testnet: {
      chainId: 11155111, // Sepolia
      rpcUrl: 'https://rpc.sepolia.org',
      subgraphUrl: 'https://gateway.thegraph.com/api/00a452ad3cd1900273ea62c1bf283f93/subgraphs/id/6wQRC7geo9XYAhckfmfo8kbMRLeWU8KQd3XsJqFKmZLT',
      registries: {
        identity: '0x8004a6090Cd10A7288092483047B097295Fb8847',
        reputation: '0x8004B8FD1A363aa02fDC07635C0c5F94f6Af5B7E',
      },
      blockExplorer: 'https://sepolia.etherscan.io',
    },
    mainnet: {
      chainId: 1, // Ethereum Mainnet
      rpcUrl: 'https://eth.llamarpc.com',
      subgraphUrl: '', // TBD
      registries: {
        identity: '', // TBD
        reputation: '',
      },
      blockExplorer: 'https://etherscan.io',
    },
  },

  // Arbitrum
  arb: {
    prefix: 'arb',
    chainType: 'evm',
    displayName: 'Arbitrum',
    testnet: {
      chainId: 421614, // Arbitrum Sepolia
      rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
      subgraphUrl: '', // TBD
      registries: {
        identity: '', // TBD
        reputation: '',
      },
      blockExplorer: 'https://sepolia.arbiscan.io',
    },
    mainnet: {
      chainId: 42161, // Arbitrum One
      rpcUrl: 'https://arb1.arbitrum.io/rpc',
      subgraphUrl: '', // TBD
      registries: {
        identity: '', // TBD
        reputation: '',
      },
      blockExplorer: 'https://arbiscan.io',
    },
  },

  // Polygon
  poly: {
    prefix: 'poly',
    chainType: 'evm',
    displayName: 'Polygon',
    testnet: {
      chainId: 80002, // Polygon Amoy
      rpcUrl: 'https://rpc-amoy.polygon.technology',
      subgraphUrl: '', // Subgraph deprecated - use on-chain queries
      registries: {
        identity: '0x8004ad19E14B9e0654f73353e8a0B600D46C2898',
        reputation: '0x8004B12F4C2B42d00c46479e859C92e39044C930',
      },
      blockExplorer: 'https://amoy.polygonscan.com',
    },
    mainnet: {
      chainId: 137, // Polygon PoS
      rpcUrl: 'https://polygon-rpc.com',
      subgraphUrl: '', // TBD
      registries: {
        identity: '', // TBD
        reputation: '',
      },
      blockExplorer: 'https://polygonscan.com',
    },
  },

  // Optimism
  op: {
    prefix: 'op',
    chainType: 'evm',
    displayName: 'Optimism',
    testnet: {
      chainId: 11155420, // Optimism Sepolia
      rpcUrl: 'https://sepolia.optimism.io',
      subgraphUrl: '', // TBD
      registries: {
        identity: '', // TBD
        reputation: '',
      },
      blockExplorer: 'https://sepolia-optimism.etherscan.io',
    },
    mainnet: {
      chainId: 10, // Optimism Mainnet
      rpcUrl: 'https://mainnet.optimism.io',
      subgraphUrl: '', // TBD
      registries: {
        identity: '', // TBD
        reputation: '',
      },
      blockExplorer: 'https://optimistic.etherscan.io',
    },
  },
};

// Helper to get chain config for a specific network mode
export function getChainNetworkConfig(
  prefix: ChainPrefix,
  networkMode: NetworkMode
): ChainNetworkConfig | null {
  const config = CHAIN_CONFIGS[prefix];
  if (!config) return null;
  return networkMode === 'mainnet' ? config.mainnet : config.testnet;
}

// Helper to check if a chain has deployed contracts for a network mode
export function isChainDeployed(prefix: ChainPrefix, networkMode: NetworkMode): boolean {
  const config = getChainNetworkConfig(prefix, networkMode);
  if (!config) return false;
  // Check if at least one registry address is set
  return !!(config.registries.identity || config.registries.reputation);
}

// Get all chains that are deployed for a network mode
export function getDeployedChains(networkMode: NetworkMode): ChainPrefix[] {
  return (Object.keys(CHAIN_CONFIGS) as ChainPrefix[]).filter((prefix) =>
    isChainDeployed(prefix, networkMode)
  );
}

// Get display name for network mode + chain
export function getNetworkDisplayName(prefix: ChainPrefix, networkMode: NetworkMode): string {
  const config = CHAIN_CONFIGS[prefix];
  if (!config) return `Unknown (${prefix})`;

  const network = networkMode === 'mainnet' ? config.mainnet : config.testnet;
  const chainIdStr = typeof network.chainId === 'number' ? `Chain ${network.chainId}` : network.chainId;

  if (networkMode === 'mainnet') {
    return `${config.displayName} Mainnet`;
  }

  // For testnet, show the specific testnet name
  const testnetNames: Record<ChainPrefix, string> = {
    sol: 'Devnet',
    base: 'Sepolia',
    eth: 'Sepolia',
    arb: 'Sepolia',
    poly: 'Amoy',
    op: 'Sepolia',
  };

  return `${config.displayName} ${testnetNames[prefix] ?? chainIdStr}`;
}

// Legacy exports for backward compatibility
export const DEFAULT_SOLANA_CLUSTER = 'devnet' as const;
export const DEFAULT_SOLANA_RPC_URL = CHAIN_CONFIGS.sol.testnet.rpcUrl;
export const DEFAULT_INDEXER_URL = CHAIN_CONFIGS.sol.testnet.indexerUrl ?? '';
// Supabase anon key for read-only indexer access (safe to commit)
export const DEFAULT_INDEXER_API_KEY = 'sb_publishable_i-ycBRGiolBr8GMdiVq1rA_nwt7N2bq';

export const SOLANA_PROGRAM_IDS = {
  devnet: {
    agentRegistry: CHAIN_CONFIGS.sol.testnet.registries.identity,
    atomEngine: 'AToMNmthLzvTy3D2kz2obFmbVCsTCmYpDw1ptWUJdeU8',
  },
  'mainnet-beta': {
    agentRegistry: CHAIN_CONFIGS.sol.mainnet.registries.identity,
    atomEngine: '', // TBD
  },
  testnet: {
    agentRegistry: '',
    atomEngine: '',
  },
} as const;

export const EVM_CHAIN_IDS = {
  base: String(CHAIN_CONFIGS.base.mainnet.chainId),
  'base-sepolia': String(CHAIN_CONFIGS.base.testnet.chainId),
  ethereum: String(CHAIN_CONFIGS.eth.mainnet.chainId),
  sepolia: String(CHAIN_CONFIGS.eth.testnet.chainId),
  arbitrum: String(CHAIN_CONFIGS.arb.mainnet.chainId),
  'arbitrum-sepolia': String(CHAIN_CONFIGS.arb.testnet.chainId),
  polygon: String(CHAIN_CONFIGS.poly.mainnet.chainId),
  'polygon-amoy': String(CHAIN_CONFIGS.poly.testnet.chainId),
  optimism: String(CHAIN_CONFIGS.op.mainnet.chainId),
  'optimism-sepolia': String(CHAIN_CONFIGS.op.testnet.chainId),
} as const;

export const CHAIN_PREFIX_MAP = {
  sol: 'solana',
  eth: 'evm',
  base: 'evm',
  arb: 'evm',
  poly: 'evm',
  op: 'evm',
} as const;
