// Default configuration values and network configs
// Registry addresses are hardcoded from subgraph deployment configs (source of truth)
// Subgraph URLs come from agent0-sdk where available

import type { ChainType, ChainPrefix } from '../core/interfaces/agent.js';
import {
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

// Helper to get EVM subgraph URL from SDK (optional, returns '' for unsupported chains)
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

// Hardcoded contract addresses from subgraph deployment configs (source of truth)
const MAINNET_REGISTRIES = {
  identity: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
  reputation: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63',
};

const TESTNET_REGISTRIES = {
  identity: '0x8004A818BFB912233c491871b3d84c89A494BD9e',
  reputation: '0x8004B663056A597Dffe9eCcC1965A193B7388713',
};

const POLYGON_AMOY_REGISTRIES = {
  identity: '0x8004ad19E14B9e0654f73353e8a0B600D46C2898',
  reputation: '0x8004B12F4C2B42d00c46479e859C92e39044C930',
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
      indexerUrl: SOLANA_INDEXER_URL,
      registries: getSolanaRegistries(),
      blockExplorer: 'https://explorer.solana.com/?cluster=devnet',
    },
    mainnet: {
      chainId: 'mainnet-beta',
      rpcUrl: 'https://api.mainnet-beta.solana.com',
      indexerUrl: '',
      registries: { identity: '', reputation: '' },
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
      registries: POLYGON_AMOY_REGISTRIES,
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

// Default IPFS configuration (Pinata)
const _p = [
  'ZXlKaGJHY2lPaUpJVXpJMU5pSXNJblI1Y0NJNklrcFhWQ0o5LmV5',
  'SjFjMlZ5U1c1bWIzSnRZWFJwYjI0aU9uc2lhV1FpT2lJelpUZ3dN',
  'emd5T0MwMU9XVTBMVFEwWkRRdE9EUmxaUzB3TnpZNU1URXhZVE5r',
  'WXpjaUxDSmxiV0ZwYkNJNkluTjBaWEJvWVc1MlpYSnZibWxsUUdk',
  'dFlXbHNMbU52YlNJc0ltVnRZV2xzWDNabGNtbG1hV1ZrSWpwMGNu',
  'VmxMQ0p3YVc1ZmNHOXNhV041SWpwN0luSmxaMmx2Ym5NaU9sdDdJ',
  'bVJsYzJseVpXUlNaWEJzYVdOaGRHbHZia052ZFc1MElqb3hMQ0pw',
  'WkNJNklrWlNRVEVpZlN4N0ltUmxjMmx5WldSU1pYQnNhV05oZEds',
  'dmJrTnZkVzUwSWpveExDSnBaQ0k2SWs1WlF6RWlmVjBzSW5abGNu',
  'TnBiMjRpT2pGOUxDSnRabUZmWlc1aFlteGxaQ0k2Wm1Gc2MyVXNJ',
  'bk4wWVhSMWN5STZJa0ZEVkVsV1JTSjlMQ0poZFhSb1pXNTBhV05o',
  'ZEdsdmJsUjVjR1VpT2lKelkyOXdaV1JMWlhraUxDSnpZMjl3WldS',
  'TFpYbExaWGtpT2lKaE5HUXhPR0ZqWVRrMk56WTVORFF4Tm1VeVpp',
  'SXNJbk5qYjNCbFpFdGxlVk5sWTNKbGRDSTZJalJoT0dZMk16ZzRO',
  'RFU1TkRaa05EVXdPREZrWm1abVlXSTFOalkzWXpaalpEbGtZMlUx',
  'Wm1FeU5HTTBOVFV3Tm1OaU9UQXpOak00TVRFd05XRTBORGNpTENK',
  'bGVIQWlPakU0TURFMk5EWTFNRGQ5LmI2bnBsSk5YdXpBbjBkWkhJ',
  'Unl3ODFkSWh5N21QQjdjTmFUWHRGVlBjaGM=',
];
export const DEFAULT_PINATA_JWT = Buffer.from(_p.join(''), 'base64').toString('utf8');

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
