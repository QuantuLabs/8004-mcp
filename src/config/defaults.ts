// Default configuration values and network configs
// Registry addresses are hardcoded from deployment configs (source of truth)
// Subgraph URLs come from agent0-sdk where available, with README-backed fallbacks

import type { ChainType, ChainPrefix } from '../core/interfaces/agent.js';
import {
  DEFAULT_SUBGRAPH_URLS as EVM_DEFAULT_SUBGRAPH_URLS,
} from 'agent0-sdk';
import {
  DEVNET_AGENT_REGISTRY_PROGRAM_ID,
  MAINNET_AGENT_REGISTRY_PROGRAM_ID,
  DEVNET_ATOM_ENGINE_PROGRAM_ID,
  MAINNET_ATOM_ENGINE_PROGRAM_ID,
  DEFAULT_INDEXER_API_KEY as SOLANA_INDEXER_API_KEY,
  getDefaultIndexerUrl as getSolanaDefaultIndexerUrl,
  getDefaultIndexerGraphqlUrl as getSolanaDefaultIndexerGraphqlUrl,
} from '8004-solana';

// Network mode: testnet for development, mainnet for production
export type NetworkMode = 'testnet' | 'mainnet';

export const DEFAULT_NETWORK_MODE: NetworkMode = 'testnet';
export const DEFAULT_CRAWLER_TIMEOUT_MS = 5000;
export const DEFAULT_SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
export type SolanaCluster = 'devnet' | 'mainnet-beta';

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

// agent0-sdk currently does not ship default gateway URLs for every deployed EVM chain.
// Source of truth for the missing subgraph IDs:
// https://raw.githubusercontent.com/agent0lab/subgraph/refs/heads/main/README.md
const README_EVM_SUBGRAPH_IDS: Partial<Record<number, string>> = {
  56: 'D6aWqowLkWqBgcqmpNKXuNikPkob24ADXCciiP8Hvn1K',
  97: 'BTjind17gmRZ6YhT9peaCM13SvWuqztsmqyfjpntbg3Z',
  143: '4tvLxkczjhSaMiqRrCV1EyheYHyJ7Ad8jub1UUyukBjg',
  10143: '8iiMH9sj471jbp7AwUuuyBXvPJqCEsobuHBeUEKQSxhU',
};

function getGatewayPrefix(url: string): string {
  const match = url.match(/^(https:\/\/gateway\.thegraph\.com\/api\/[^/]+\/subgraphs\/id)\/[^/]+$/);
  return match?.[1] ?? '';
}

// The Ethereum mainnet gateway key from agent0-sdk is authorized for the extra BSC/Monad subgraphs.
const README_FALLBACK_GATEWAY_PREFIX = getGatewayPrefix(
  EVM_DEFAULT_SUBGRAPH_URLS[1 as keyof typeof EVM_DEFAULT_SUBGRAPH_URLS] || ''
);

// Helper to get EVM subgraph URL from SDK (optional, returns '' for unsupported chains)
function getEvmSubgraphUrl(chainId: number): string {
  const sdkUrl = EVM_DEFAULT_SUBGRAPH_URLS[chainId as keyof typeof EVM_DEFAULT_SUBGRAPH_URLS] || '';
  if (sdkUrl) return sdkUrl;

  const subgraphId = README_EVM_SUBGRAPH_IDS[chainId];
  if (!subgraphId || !README_FALLBACK_GATEWAY_PREFIX) return '';

  return `${README_FALLBACK_GATEWAY_PREFIX}/${subgraphId}`;
}

function getSolanaProgramId(cluster: SolanaCluster): string {
  return (
    cluster === 'mainnet-beta'
      ? MAINNET_AGENT_REGISTRY_PROGRAM_ID
      : DEVNET_AGENT_REGISTRY_PROGRAM_ID
  ).toBase58();
}

function getSolanaAtomProgramId(cluster: SolanaCluster): string {
  return (
    cluster === 'mainnet-beta'
      ? MAINNET_ATOM_ENGINE_PROGRAM_ID
      : DEVNET_ATOM_ENGINE_PROGRAM_ID
  ).toBase58();
}

export function getDefaultSolanaIndexerUrl(cluster: SolanaCluster): string {
  return getSolanaDefaultIndexerUrl(cluster);
}

export function getDefaultSolanaIndexerGraphqlUrl(cluster: SolanaCluster): string {
  return getSolanaDefaultIndexerGraphqlUrl(cluster);
}

// Helper to get Solana registries from SDK (source of truth)
// Note: 8004-solana uses a consolidated single program for identity/reputation/validation
function getSolanaRegistries(cluster: SolanaCluster): { identity: string; reputation: string; validation: string } {
  const programId = getSolanaProgramId(cluster);
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

// Hardcoded contract addresses from subgraph deployment configs (source of truth)
const MAINNET_REGISTRIES = {
  identity: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
  reputation: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63',
};

const TESTNET_REGISTRIES = {
  identity: '0x8004A818BFB912233c491871b3d84c89A494BD9e',
  reputation: '0x8004B663056A597Dffe9eCcC1965A193B7388713',
};

const UNDEPLOYED_REGISTRIES = {
  identity: '',
  reputation: '',
};

// All supported chains with their testnet/mainnet configurations
export const CHAIN_CONFIGS: Record<ChainPrefix, ChainConfig> = {
  sol: {
    prefix: 'sol',
    chainType: 'solana',
    displayName: 'Solana',
    testnet: {
      chainId: 'devnet',
      rpcUrl: 'https://api.devnet.solana.com',
      indexerUrl: getDefaultSolanaIndexerUrl('devnet'),
      registries: getSolanaRegistries('devnet'),
      blockExplorer: 'https://explorer.solana.com/?cluster=devnet',
    },
    mainnet: {
      chainId: 'mainnet-beta',
      rpcUrl: 'https://api.mainnet-beta.solana.com',
      indexerUrl: getDefaultSolanaIndexerUrl('mainnet-beta'),
      registries: getSolanaRegistries('mainnet-beta'),
      blockExplorer: 'https://explorer.solana.com',
    },
  },

  eth: {
    prefix: 'eth',
    chainType: 'evm',
    displayName: 'Ethereum',
    testnet: {
      chainId: 11155111,
      rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
      subgraphUrl: getEvmSubgraphUrl(11155111),
      registries: TESTNET_REGISTRIES,
      blockExplorer: 'https://sepolia.etherscan.io',
    },
    mainnet: {
      chainId: 1,
      rpcUrl: 'https://ethereum-rpc.publicnode.com',
      subgraphUrl: getEvmSubgraphUrl(1),
      registries: MAINNET_REGISTRIES,
      blockExplorer: 'https://etherscan.io',
    },
  },

  base: {
    prefix: 'base',
    chainType: 'evm',
    displayName: 'Base',
    testnet: {
      chainId: 84532,
      rpcUrl: 'https://sepolia.base.org',
      subgraphUrl: getEvmSubgraphUrl(84532),
      registries: TESTNET_REGISTRIES,
      blockExplorer: 'https://sepolia.basescan.org',
    },
    mainnet: {
      chainId: 8453,
      rpcUrl: 'https://mainnet.base.org',
      subgraphUrl: getEvmSubgraphUrl(8453),
      registries: MAINNET_REGISTRIES,
      blockExplorer: 'https://basescan.org',
    },
  },

  poly: {
    prefix: 'poly',
    chainType: 'evm',
    displayName: 'Polygon',
    testnet: {
      chainId: 80002,
      rpcUrl: 'https://rpc-amoy.polygon.technology',
      subgraphUrl: getEvmSubgraphUrl(80002),
      registries: UNDEPLOYED_REGISTRIES,
      blockExplorer: 'https://amoy.polygonscan.com',
    },
    mainnet: {
      chainId: 137,
      rpcUrl: 'https://polygon-bor-rpc.publicnode.com',
      subgraphUrl: getEvmSubgraphUrl(137),
      registries: MAINNET_REGISTRIES,
      blockExplorer: 'https://polygonscan.com',
    },
  },

  bsc: {
    prefix: 'bsc',
    chainType: 'evm',
    displayName: 'BSC',
    testnet: {
      chainId: 97,
      rpcUrl: 'https://data-seed-prebsc-1-s1.binance.org:8545',
      subgraphUrl: getEvmSubgraphUrl(97),
      registries: TESTNET_REGISTRIES,
      blockExplorer: 'https://testnet.bscscan.com',
    },
    mainnet: {
      chainId: 56,
      rpcUrl: 'https://bsc-dataseed1.binance.org',
      subgraphUrl: getEvmSubgraphUrl(56),
      registries: MAINNET_REGISTRIES,
      blockExplorer: 'https://bscscan.com',
    },
  },

  monad: {
    prefix: 'monad',
    chainType: 'evm',
    displayName: 'Monad',
    testnet: {
      chainId: 10143,
      rpcUrl: 'https://testnet-rpc.monad.xyz',
      subgraphUrl: getEvmSubgraphUrl(10143),
      registries: TESTNET_REGISTRIES,
      blockExplorer: 'https://testnet.monadexplorer.com',
    },
    mainnet: {
      chainId: 143,
      rpcUrl: 'https://rpc.monad.xyz',
      subgraphUrl: getEvmSubgraphUrl(143),
      registries: MAINNET_REGISTRIES,
      blockExplorer: 'https://monadexplorer.com',
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
    eth: 'Sepolia',
    base: 'Sepolia',
    poly: 'Amoy',
    bsc: 'Testnet',
    monad: 'Testnet',
  };

  return `${config.displayName} ${testnetNames[prefix] ?? chainIdStr}`;
}

// Default IPFS upload path for zero-config MCP usage.
export const DEFAULT_IPFS_UPLOAD_URL = 'https://studio.qnt.sh/api/mcp/ipfs/upload';
export const DEFAULT_IPFS_GATEWAY_URL = 'https://gateway.pinata.cloud/ipfs';

// Legacy exports for backward compatibility - values from SDKs (source of truth)
export const DEFAULT_SOLANA_CLUSTER = 'devnet' as const;
export const DEFAULT_SOLANA_RPC_URL = CHAIN_CONFIGS.sol.testnet.rpcUrl;
export const DEFAULT_INDEXER_URL = getDefaultSolanaIndexerUrl(DEFAULT_SOLANA_CLUSTER);
export const DEFAULT_INDEXER_GRAPHQL_URL = getDefaultSolanaIndexerGraphqlUrl(DEFAULT_SOLANA_CLUSTER);
export const DEFAULT_INDEXER_API_KEY = SOLANA_INDEXER_API_KEY;

export const SOLANA_PROGRAM_IDS = {
  devnet: {
    agentRegistry: getSolanaProgramId('devnet'),
    atomEngine: getSolanaAtomProgramId('devnet'),
  },
  'mainnet-beta': {
    agentRegistry: getSolanaProgramId('mainnet-beta'),
    atomEngine: getSolanaAtomProgramId('mainnet-beta'),
  },
  testnet: {
    agentRegistry: getSolanaProgramId('devnet'),
    atomEngine: getSolanaAtomProgramId('devnet'),
  },
} as const;

export const EVM_CHAIN_IDS = {
  ethereum: String(CHAIN_CONFIGS.eth.mainnet.chainId),
  sepolia: String(CHAIN_CONFIGS.eth.testnet.chainId),
  base: String(CHAIN_CONFIGS.base.mainnet.chainId),
  'base-sepolia': String(CHAIN_CONFIGS.base.testnet.chainId),
  polygon: String(CHAIN_CONFIGS.poly.mainnet.chainId),
  'polygon-amoy': String(CHAIN_CONFIGS.poly.testnet.chainId),
  bsc: String(CHAIN_CONFIGS.bsc.mainnet.chainId),
  'bsc-testnet': String(CHAIN_CONFIGS.bsc.testnet.chainId),
  monad: String(CHAIN_CONFIGS.monad.mainnet.chainId),
  'monad-testnet': String(CHAIN_CONFIGS.monad.testnet.chainId),
} as const;

export const CHAIN_PREFIX_MAP = {
  sol: 'solana',
  eth: 'evm',
  base: 'evm',
  poly: 'evm',
  bsc: 'evm',
  monad: 'evm',
} as const;
