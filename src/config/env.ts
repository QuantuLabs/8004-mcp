// Environment variable parsing

import {
  DEFAULT_SOLANA_CLUSTER,
  DEFAULT_INDEXER_URL,
  DEFAULT_CRAWLER_TIMEOUT_MS,
  DEFAULT_NETWORK_MODE,
  type NetworkMode,
} from './defaults.js';

// Note: 8004-solana SDK currently only supports 'devnet'
export type SolanaCluster = 'devnet';

export interface ISolanaEnvConfig {
  cluster: SolanaCluster;
  rpcUrl?: string;
  privateKey?: string;
}

export interface IEvmEnvConfig {
  privateKey?: string;
}

export interface IIndexerEnvConfig {
  url: string;
  apiKey?: string;
  enabled: boolean;
  fallback: boolean;
  forceOnChain: boolean;
}

export interface IIpfsEnvConfig {
  pinataJwt?: string;
  ipfsUrl?: string;
  filecoinEnabled: boolean;
  filecoinPrivateKey?: string;
}

export interface IEnvConfig {
  solana: ISolanaEnvConfig;
  evm: IEvmEnvConfig;
  indexer: IIndexerEnvConfig;
  ipfs: IIpfsEnvConfig;
  crawlerTimeoutMs: number;
  networkMode: NetworkMode;
}

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

function parseIntEnv(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

export function loadEnvConfig(): IEnvConfig {
  const env = process.env;

  return {
    solana: {
      cluster: (env.SOLANA_CLUSTER as SolanaCluster) ?? DEFAULT_SOLANA_CLUSTER,
      rpcUrl: env.SOLANA_RPC_URL,
      privateKey: env.SOLANA_PRIVATE_KEY,
    },
    evm: {
      privateKey: env.EVM_PRIVATE_KEY,
    },
    indexer: {
      url: env.INDEXER_URL ?? DEFAULT_INDEXER_URL,
      apiKey: env.INDEXER_API_KEY,
      enabled: parseBooleanEnv(env.USE_INDEXER, true),
      fallback: parseBooleanEnv(env.INDEXER_FALLBACK, true),
      forceOnChain: parseBooleanEnv(env.FORCE_ON_CHAIN, false),
    },
    ipfs: {
      pinataJwt: env.PINATA_JWT,
      ipfsUrl: env.IPFS_URL,
      filecoinEnabled: parseBooleanEnv(env.FILECOIN_PIN_ENABLED, false),
      filecoinPrivateKey: env.FILECOIN_PRIVATE_KEY,
    },
    crawlerTimeoutMs: parseIntEnv(env.MCP_CRAWLER_TIMEOUT_MS, DEFAULT_CRAWLER_TIMEOUT_MS),
    networkMode: (env.NETWORK_MODE as NetworkMode) ?? DEFAULT_NETWORK_MODE,
  };
}
