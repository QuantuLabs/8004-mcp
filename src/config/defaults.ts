// Default configuration values and network configs
// NOTE: Registry addresses and subgraph URLs come from the SDKs (agent0-sdk, 8004-solana)
// This file only contains RPC URLs, block explorers, and chain metadata

import type { ChainType, ChainPrefix } from '../core/interfaces/agent.js';
import {
  DEFAULT_REGISTRIES as EVM_DEFAULT_REGISTRIES,
  DEFAULT_SUBGRAPH_URLS as EVM_DEFAULT_SUBGRAPH_URLS,
} from 'agent0-sdk';
import {
  PROGRAM_ID as SOLANA_PROGRAM_ID,
  ATOM_ENGINE_PROGRAM_ID as SOLANA_ATOM_ENGINE_PROGRAM_ID,
  DEFAULT_INDEXER_URL as SOLANA_INDEXER_URL,
  DEFAULT_INDEXER_API_KEY as SOLANA_INDEXER_API_KEY,
} from '8004-solana';

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

// Helper to get EVM registries from SDK (source of truth)
function getEvmRegistries(chainId: number): { identity: string; reputation: string } {
  const sdkRegistries = EVM_DEFAULT_REGISTRIES[chainId as keyof typeof EVM_DEFAULT_REGISTRIES];
  if (sdkRegistries) {
    return {
      identity: sdkRegistries.IDENTITY || '',
      reputation: sdkRegistries.REPUTATION || '',
    };
  }
  return { identity: '', reputation: '' };
}

// Helper to get EVM subgraph URL from SDK (source of truth)
function getEvmSubgraphUrl(chainId: number): string {
  return EVM_DEFAULT_SUBGRAPH_URLS[chainId as keyof typeof EVM_DEFAULT_SUBGRAPH_URLS] || '';
}

// Helper to get Solana registries from SDK (source of truth)
// Note: 8004-solana uses a consolidated single program for identity/reputation/validation
function getSolanaRegistries(): { identity: string; reputation: string; validation: string } {
  const programId = SOLANA_PROGRAM_ID.toBase58();
  return {
    identity: programId,
    reputation: programId, // Same consolidated program
    validation: programId,
  };
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
  // Solana - registries and indexer from 8004-solana SDK (source of truth)
  sol: {
    prefix: 'sol',
    chainType: 'solana',
    displayName: 'Solana',
    testnet: {
      chainId: 'devnet',
      rpcUrl: 'https://api.devnet.solana.com',
      indexerUrl: SOLANA_INDEXER_URL,
      registries: getSolanaRegistries(),
      blockExplorer: 'https://explorer.solana.com/?cluster=devnet',
    },
    mainnet: {
      chainId: 'mainnet-beta',
      rpcUrl: 'https://api.mainnet-beta.solana.com',
      indexerUrl: '', // TBD - mainnet indexer
      registries: {
        identity: '', // TBD - mainnet deployment (will come from SDK when ready)
        reputation: '',
        validation: '',
      },
      blockExplorer: 'https://explorer.solana.com',
    },
  },

  // Base - registries and subgraph from agent0-sdk (source of truth)
  base: {
    prefix: 'base',
    chainType: 'evm',
    displayName: 'Base',
    testnet: {
      chainId: 84532, // Base Sepolia
      rpcUrl: 'https://sepolia.base.org',
      subgraphUrl: getEvmSubgraphUrl(84532),
      registries: getEvmRegistries(84532),
      blockExplorer: 'https://sepolia.basescan.org',
    },
    mainnet: {
      chainId: 8453, // Base Mainnet
      rpcUrl: 'https://mainnet.base.org',
      subgraphUrl: getEvmSubgraphUrl(8453),
      registries: getEvmRegistries(8453),
      blockExplorer: 'https://basescan.org',
    },
  },

  // Ethereum - registries and subgraph from agent0-sdk (source of truth)
  eth: {
    prefix: 'eth',
    chainType: 'evm',
    displayName: 'Ethereum',
    testnet: {
      chainId: 11155111, // Sepolia
      rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
      subgraphUrl: getEvmSubgraphUrl(11155111),
      registries: getEvmRegistries(11155111),
      blockExplorer: 'https://sepolia.etherscan.io',
    },
    mainnet: {
      chainId: 1, // Ethereum Mainnet
      rpcUrl: 'https://ethereum-rpc.publicnode.com',
      subgraphUrl: getEvmSubgraphUrl(1),
      registries: getEvmRegistries(1),
      blockExplorer: 'https://etherscan.io',
    },
  },

  // Arbitrum - registries and subgraph from agent0-sdk (source of truth)
  arb: {
    prefix: 'arb',
    chainType: 'evm',
    displayName: 'Arbitrum',
    testnet: {
      chainId: 421614, // Arbitrum Sepolia
      rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
      subgraphUrl: getEvmSubgraphUrl(421614),
      registries: getEvmRegistries(421614),
      blockExplorer: 'https://sepolia.arbiscan.io',
    },
    mainnet: {
      chainId: 42161, // Arbitrum One
      rpcUrl: 'https://arb1.arbitrum.io/rpc',
      subgraphUrl: getEvmSubgraphUrl(42161),
      registries: getEvmRegistries(42161),
      blockExplorer: 'https://arbiscan.io',
    },
  },

  // Polygon - registries and subgraph from agent0-sdk (source of truth)
  poly: {
    prefix: 'poly',
    chainType: 'evm',
    displayName: 'Polygon',
    testnet: {
      chainId: 80002, // Polygon Amoy
      rpcUrl: 'https://rpc-amoy.polygon.technology',
      subgraphUrl: getEvmSubgraphUrl(80002),
      registries: getEvmRegistries(80002),
      blockExplorer: 'https://amoy.polygonscan.com',
    },
    mainnet: {
      chainId: 137, // Polygon PoS
      rpcUrl: 'https://polygon-bor-rpc.publicnode.com',
      subgraphUrl: getEvmSubgraphUrl(137),
      registries: getEvmRegistries(137),
      blockExplorer: 'https://polygonscan.com',
    },
  },

  // Optimism - registries and subgraph from agent0-sdk (source of truth)
  op: {
    prefix: 'op',
    chainType: 'evm',
    displayName: 'Optimism',
    testnet: {
      chainId: 11155420, // Optimism Sepolia
      rpcUrl: 'https://sepolia.optimism.io',
      subgraphUrl: getEvmSubgraphUrl(11155420),
      registries: getEvmRegistries(11155420),
      blockExplorer: 'https://sepolia-optimism.etherscan.io',
    },
    mainnet: {
      chainId: 10, // Optimism Mainnet
      rpcUrl: 'https://mainnet.optimism.io',
      subgraphUrl: getEvmSubgraphUrl(10),
      registries: getEvmRegistries(10),
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

// Legacy exports for backward compatibility - values from SDKs (source of truth)
export const DEFAULT_SOLANA_CLUSTER = 'devnet' as const;
export const DEFAULT_SOLANA_RPC_URL = CHAIN_CONFIGS.sol.testnet.rpcUrl;
export const DEFAULT_INDEXER_URL = SOLANA_INDEXER_URL;
export const DEFAULT_INDEXER_API_KEY = SOLANA_INDEXER_API_KEY;

export const SOLANA_PROGRAM_IDS = {
  devnet: {
    agentRegistry: SOLANA_PROGRAM_ID.toBase58(),
    atomEngine: SOLANA_ATOM_ENGINE_PROGRAM_ID.toBase58(),
  },
  'mainnet-beta': {
    agentRegistry: '', // TBD - will come from SDK when deployed
    atomEngine: '',
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
