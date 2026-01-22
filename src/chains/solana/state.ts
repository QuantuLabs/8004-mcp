// Solana runtime state management

import { Keypair } from '@solana/web3.js';
import { SolanaSDK, IndexerClient, IPFSClient } from '8004-solana';
import type { IPFSClientConfig } from '8004-solana';
import { DEFAULT_SOLANA_CLUSTER, DEFAULT_INDEXER_URL, DEFAULT_INDEXER_API_KEY } from '../../config/defaults.js';
import { getWalletManager } from '../../core/wallet/index.js';

// Note: 8004-solana SDK currently only supports 'devnet'
export type SolanaCluster = 'devnet';

export interface ISolanaConfig {
  cluster: SolanaCluster;
  rpcUrl?: string;
  indexerUrl?: string;
  indexerApiKey?: string;
  useIndexer: boolean;
  indexerFallback: boolean;
  forceOnChain: boolean;
}

export interface ISolanaState {
  config: ISolanaConfig;
  ipfsConfig?: IPFSClientConfig;
  sdk?: SolanaSDK;
  ipfs?: IPFSClient;
  indexer?: IndexerClient;
  keypair?: Keypair;
}

export interface ISignerInfo {
  configured: boolean;
  publicKey?: string;
  error?: string;
}

// Create default config
export function createDefaultConfig(): ISolanaConfig {
  return {
    cluster: DEFAULT_SOLANA_CLUSTER,
    useIndexer: true,
    indexerFallback: true,
    forceOnChain: false,
    indexerUrl: DEFAULT_INDEXER_URL,
    indexerApiKey: DEFAULT_INDEXER_API_KEY,
  };
}

// Parse keypair from environment or string
export function parseKeypairFromEnv(privateKey?: string): Keypair | undefined {
  if (!privateKey) return undefined;

  try {
    const trimmed = privateKey.trim();

    // JSON array format
    if (trimmed.startsWith('[')) {
      const arr = JSON.parse(trimmed) as number[];
      return Keypair.fromSecretKey(Uint8Array.from(arr));
    }

    // Hex format
    if (trimmed.startsWith('0x') || (trimmed.length === 128 && /^[0-9a-fA-F]+$/.test(trimmed))) {
      const hex = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed;
      return Keypair.fromSecretKey(Uint8Array.from(Buffer.from(hex, 'hex')));
    }

    // Base64 format
    const decoded = Buffer.from(trimmed, 'base64');
    if (decoded.length === 64) {
      return Keypair.fromSecretKey(Uint8Array.from(decoded));
    }

    return undefined;
  } catch {
    return undefined;
  }
}

// Solana state manager (per-instance, not singleton)
export class SolanaStateManager {
  private _config: ISolanaConfig;
  private _ipfsConfig?: IPFSClientConfig;
  private _sdk?: SolanaSDK;
  private _ipfs?: IPFSClient;
  private _indexer?: IndexerClient;
  private _keypair?: Keypair;

  constructor(config?: Partial<ISolanaConfig>, privateKey?: string) {
    this._config = { ...createDefaultConfig(), ...config };
    this._keypair = parseKeypairFromEnv(privateKey);
  }

  // Config management
  get config(): ISolanaConfig {
    return this._config;
  }

  setConfig(updates: Partial<ISolanaConfig>): void {
    this._config = { ...this._config, ...updates };
    // Invalidate cached instances
    this._sdk = undefined;
    this._indexer = undefined;
  }

  setIpfsConfig(config: IPFSClientConfig): void {
    this._ipfsConfig = config;
    this._ipfs = undefined;
  }

  // Keypair management - supports both env-based and wallet manager
  get keypair(): Keypair | undefined {
    // Priority: 1. Env keypair, 2. Wallet manager (any unlocked Solana wallet)
    if (this._keypair) {
      return this._keypair;
    }
    // Check wallet manager for any unlocked Solana keypair
    return getWalletManager().getAnyUnlockedSolanaKeypair() ?? undefined;
  }

  setKeypair(keypair: Keypair | undefined): void {
    this._keypair = keypair;
    // Invalidate SDK as signer changed
    this._sdk = undefined;
  }

  getSignerInfo(): ISignerInfo {
    const keypair = this.keypair;
    if (!keypair) {
      return { configured: false };
    }
    return {
      configured: true,
      publicKey: keypair.publicKey.toBase58(),
    };
  }

  canWrite(): boolean {
    return this.keypair !== undefined;
  }

  // Force SDK to rebuild (e.g., after wallet unlock)
  invalidateSdk(): void {
    this._sdk = undefined;
  }

  // SDK access (lazy initialization)
  getSdk(): SolanaSDK {
    if (!this._sdk) {
      this._sdk = new SolanaSDK({
        cluster: this._config.cluster,
        rpcUrl: this._config.rpcUrl,
        signer: this._keypair,
        indexerUrl: this._config.useIndexer ? this._config.indexerUrl : undefined,
        indexerApiKey: this._config.indexerApiKey,
        useIndexer: this._config.useIndexer,
        indexerFallback: this._config.indexerFallback,
        forceOnChain: this._config.forceOnChain,
      });
    }
    return this._sdk;
  }

  // Indexer access
  getIndexer(): IndexerClient | undefined {
    if (!this._config.useIndexer || !this._config.indexerUrl || !this._config.indexerApiKey) {
      return undefined;
    }
    if (!this._indexer) {
      this._indexer = new IndexerClient({
        baseUrl: this._config.indexerUrl,
        apiKey: this._config.indexerApiKey,
      });
    }
    return this._indexer;
  }

  // IPFS access
  getIpfs(): IPFSClient {
    if (!this._ipfsConfig) {
      throw new Error('IPFS not configured. Call setIpfsConfig() first.');
    }
    if (!this._ipfs) {
      this._ipfs = new IPFSClient(this._ipfsConfig);
    }
    return this._ipfs;
  }

  hasIpfs(): boolean {
    return this._ipfsConfig !== undefined;
  }

  // Async initialization check
  async isIndexerAvailable(): Promise<boolean> {
    const indexer = this.getIndexer();
    if (!indexer) return false;
    try {
      await indexer.getGlobalStats();
      return true;
    } catch {
      return false;
    }
  }

  // Get snapshot for debugging
  getSnapshot(): {
    config: ISolanaConfig;
    signer: ISignerInfo;
    hasIpfs: boolean;
    hasIndexer: boolean;
  } {
    return {
      config: this._config,
      signer: this.getSignerInfo(),
      hasIpfs: this.hasIpfs(),
      hasIndexer: this._config.useIndexer && !!this._config.indexerUrl,
    };
  }
}
