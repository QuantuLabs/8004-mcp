// Environment variable parsing

import {
  DEFAULT_SOLANA_CLUSTER,
  DEFAULT_INDEXER_API_KEY,
  DEFAULT_CRAWLER_TIMEOUT_MS,
  DEFAULT_IPFS_UPLOAD_URL,
  DEFAULT_NETWORK_MODE,
  getDefaultSolanaIndexerUrl,
  type NetworkMode,
} from './defaults.js';

export type SolanaCluster = 'devnet' | 'mainnet-beta';

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
  uploadUrl?: string;
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

function parseOptionalStringEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseSolanaCluster(value: string | undefined): SolanaCluster {
  if (value === 'mainnet-beta') return 'mainnet-beta';
  if (value === 'devnet') return 'devnet';
  return DEFAULT_SOLANA_CLUSTER;
}

export function loadEnvConfig(): IEnvConfig {
  const env = process.env;
  const solanaCluster = parseSolanaCluster(env.SOLANA_CLUSTER);

  return {
    solana: {
      cluster: solanaCluster,
      rpcUrl: parseOptionalStringEnv(env.SOLANA_RPC_URL),
      privateKey: parseOptionalStringEnv(env.SOLANA_PRIVATE_KEY),
    },
    evm: {
      privateKey: parseOptionalStringEnv(env.EVM_PRIVATE_KEY),
    },
    indexer: {
      url: parseOptionalStringEnv(env.INDEXER_URL) ?? getDefaultSolanaIndexerUrl(solanaCluster),
      apiKey: parseOptionalStringEnv(env.INDEXER_API_KEY) ?? DEFAULT_INDEXER_API_KEY,
      enabled: parseBooleanEnv(env.USE_INDEXER, true),
      fallback: parseBooleanEnv(env.INDEXER_FALLBACK, true),
      forceOnChain: parseBooleanEnv(env.FORCE_ON_CHAIN, false),
    },
    ipfs: {
      uploadUrl: parseOptionalStringEnv(env.IPFS_UPLOAD_URL) ?? DEFAULT_IPFS_UPLOAD_URL,
      pinataJwt: parseOptionalStringEnv(env.PINATA_JWT),
      ipfsUrl: parseOptionalStringEnv(env.IPFS_URL),
      filecoinEnabled: parseBooleanEnv(env.FILECOIN_PIN_ENABLED, false),
      filecoinPrivateKey: parseOptionalStringEnv(env.FILECOIN_PRIVATE_KEY),
    },
    crawlerTimeoutMs: parseIntEnv(env.MCP_CRAWLER_TIMEOUT_MS, DEFAULT_CRAWLER_TIMEOUT_MS),
    networkMode: (env.NETWORK_MODE as NetworkMode) ?? DEFAULT_NETWORK_MODE,
  };
}
