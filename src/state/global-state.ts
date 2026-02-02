// Global state manager for multi-chain MCP

import { ChainRegistry } from '../core/registry/chain-registry.js';
import { ToolRegistry } from '../core/registry/tool-registry.js';
import { AgentCache } from '../core/cache/agent-cache.js';
import { LazyCache } from '../core/cache/lazy-cache.js';
import { IPFSService } from '../core/services/ipfs-service.js';
import type { IChainProvider } from '../core/interfaces/chain-provider.js';
import type { IEnvConfig } from '../config/env.js';
import { loadEnvConfig } from '../config/env.js';
import {
  type NetworkMode,
  DEFAULT_NETWORK_MODE,
  CHAIN_CONFIGS,
  getChainNetworkConfig,
  getDeployedChains,
  getNetworkDisplayName,
} from '../config/defaults.js';
import type { ChainPrefix } from '../core/interfaces/agent.js';
import { EVMChainProvider } from '../chains/evm/provider.js';

export interface IGlobalStateConfig {
  autoSync?: boolean;          // Only used with legacy cache
  cachePath?: string;
  networkMode?: NetworkMode;
  useLazyCache?: boolean;      // Default: true (lightweight on-demand caching)
  cacheTtlMs?: number;         // TTL for lazy cache entries (default: 24h)
  cacheMaxEntries?: number;    // Max entries in lazy cache (default: 10000)
}

export interface INetworkStatus {
  mode: NetworkMode;
  deployedChains: ChainPrefix[];
  chainStatus: Record<ChainPrefix, {
    deployed: boolean;
    displayName: string;
    chainId: number | string;
    rpcUrl: string;
    hasSubgraph: boolean;
  }>;
}

export interface IGlobalStateSnapshot {
  config: IEnvConfig;
  networkMode: NetworkMode;
  chains: {
    registered: string[];
    default: string | null;
    ready: string[];
  };
  network: INetworkStatus;
  tools: {
    count: number;
  };
  cache: {
    total: number;
    byChain: Record<string, number>;
    dbSize: string;
  };
  ipfs: {
    configured: boolean;
    hasPinata: boolean;
    hasIpfsNode: boolean;
    hasFilecoin: boolean;
  };
  crawlerTimeoutMs: number;
}

class GlobalState {
  private _config: IEnvConfig;
  private _networkMode: NetworkMode;
  private _chainRegistry: ChainRegistry;
  private _toolRegistry: ToolRegistry;
  private _legacyCache: AgentCache | null = null;
  private _lazyCache: LazyCache | null = null;
  private _useLazyCache = true;
  private _crawlerTimeoutMs: number;
  private _ipfsService: IPFSService;
  private _initialized = false;
  // Cache of unregistered providers for re-registration on network switch
  private _dormantProviders: Map<string, IChainProvider> = new Map();

  constructor() {
    this._config = loadEnvConfig();
    this._networkMode = DEFAULT_NETWORK_MODE;
    this._chainRegistry = new ChainRegistry();
    this._toolRegistry = new ToolRegistry();
    this._ipfsService = new IPFSService();
    this._crawlerTimeoutMs = this._config.crawlerTimeoutMs;

    // Initialize IPFS from env config if available
    if (this._config.ipfs?.pinataJwt || this._config.ipfs?.ipfsUrl) {
      this._ipfsService.configure({
        pinataJwt: this._config.ipfs.pinataJwt,
        pinataEnabled: !!this._config.ipfs.pinataJwt,
        url: this._config.ipfs.ipfsUrl,
        filecoinPinEnabled: this._config.ipfs.filecoinEnabled,
        filecoinPrivateKey: this._config.ipfs.filecoinPrivateKey,
      });
    }
  }

  // Network mode
  get networkMode(): NetworkMode {
    return this._networkMode;
  }

  setNetworkMode(mode: NetworkMode): { previous: NetworkMode; current: NetworkMode; deployedChains: ChainPrefix[] } {
    const previous = this._networkMode;
    if (previous === mode) {
      // No change, return current state
      return {
        previous,
        current: mode,
        deployedChains: getDeployedChains(mode),
      };
    }

    this._networkMode = mode;

    // Re-register providers for the new network mode
    // Each chain type has its own re-registration strategy:
    // - EVM: chainId changes per network, so unregister/register
    // - Solana: chainId stays 'sol', but config changes (cluster, RPC, indexer)
    // - Future chains: can implement their own pattern
    this._switchProvidersNetwork(mode);

    const deployedChains = getDeployedChains(mode);

    return {
      previous,
      current: mode,
      deployedChains,
    };
  }

  // Switch all providers to a new network mode
  // Extensible pattern for multiple chain types
  private _switchProvidersNetwork(mode: NetworkMode): void {
    // 1. Handle Solana providers (config update, same registry key)
    this._updateSolanaProviders(mode);

    // 2. Handle EVM providers (re-registration, chainId changes)
    this._reregisterEVMProviders(mode);

    // 3. Invalidate all SDKs to force reconnection with new config
    this._chainRegistry.invalidateAll();
  }

  // Update Solana provider config for new network mode
  // Solana chainId stays 'sol', but cluster/RPC/indexer change
  private _updateSolanaProviders(mode: NetworkMode): void {
    // Check if Solana is deployed for this network mode
    const networkConfig = getChainNetworkConfig('sol', mode);
    const isDeployed = !!(networkConfig && networkConfig.registries.identity);

    // Try to get active Solana provider
    let solanaProvider = this._chainRegistry.getByPrefix('sol');

    // If not registered but we have a dormant one, check if we should reactivate
    if (!solanaProvider && isDeployed) {
      const dormantSolana = this._dormantProviders.get('sol');
      if (dormantSolana) {
        // Re-register the dormant provider
        this._chainRegistry.register(dormantSolana);
        this._dormantProviders.delete('sol');
        solanaProvider = dormantSolana;
      }
    }

    if (!solanaProvider) return;

    if (!isDeployed) {
      // Solana not deployed for this network mode, make it dormant
      this._dormantProviders.set('sol', solanaProvider);
      this._chainRegistry.unregister('sol');
      return;
    }

    // Update Solana provider's state config
    // The SolanaStateManager has setConfig() which invalidates SDK
    if ('getState' in solanaProvider && typeof solanaProvider.getState === 'function') {
      const state = (solanaProvider as { getState: () => { setConfig: (cfg: object) => void } }).getState();
      state.setConfig({
        cluster: networkConfig.chainId as 'devnet', // TODO: extend when mainnet-beta is supported
        rpcUrl: networkConfig.rpcUrl,
        indexerUrl: networkConfig.indexerUrl,
      });
    }
  }

  // Re-register EVM providers for a new network mode
  // EVM chainIds change per network (e.g., base:84532 vs base:8453)
  private _reregisterEVMProviders(mode: NetworkMode): void {
    // 1. Unregister all existing EVM providers
    const evmProviders = this._chainRegistry.getAllByType('evm');
    for (const provider of evmProviders) {
      const config = provider.getConfig();
      const chainId = `${provider.chainPrefix}:${config.chainId}`;
      this._chainRegistry.unregister(chainId);
    }

    // 2. Register new EVM providers for deployed chains in the new network mode
    const deployedChains = getDeployedChains(mode);
    const evmChains = deployedChains.filter(
      (prefix) => CHAIN_CONFIGS[prefix]?.chainType === 'evm'
    );

    for (const prefix of evmChains) {
      const chainConfig = CHAIN_CONFIGS[prefix];
      const networkConfig = mode === 'mainnet' ? chainConfig.mainnet : chainConfig.testnet;

      const evmProvider = new EVMChainProvider({
        chainId: networkConfig.chainId as number,
        chainPrefix: prefix,
        rpcUrl: networkConfig.rpcUrl,
        subgraphUrl: networkConfig.subgraphUrl,
      });

      this._chainRegistry.register(evmProvider);
    }
  }

  // Get network status
  getNetworkStatus(): INetworkStatus {
    const mode = this._networkMode;
    const deployedChains = getDeployedChains(mode);

    const chainStatus: INetworkStatus['chainStatus'] = {} as INetworkStatus['chainStatus'];

    for (const prefix of Object.keys(CHAIN_CONFIGS) as ChainPrefix[]) {
      const networkConfig = getChainNetworkConfig(prefix, mode);
      if (networkConfig) {
        chainStatus[prefix] = {
          deployed: !!(networkConfig.registries.identity || networkConfig.registries.reputation),
          displayName: getNetworkDisplayName(prefix, mode),
          chainId: networkConfig.chainId,
          rpcUrl: networkConfig.rpcUrl,
          hasSubgraph: !!(networkConfig.subgraphUrl || networkConfig.indexerUrl),
        };
      }
    }

    return {
      mode,
      deployedChains,
      chainStatus,
    };
  }

  // Configuration
  get config(): IEnvConfig {
    return this._config;
  }

  setConfig(updates: Partial<IEnvConfig>): void {
    this._config = {
      ...this._config,
      ...updates,
      solana: { ...this._config.solana, ...updates.solana },
      indexer: { ...this._config.indexer, ...updates.indexer },
      ipfs: { ...this._config.ipfs, ...updates.ipfs },
    };
  }

  resetConfig(): void {
    this._config = loadEnvConfig();
    this._networkMode = DEFAULT_NETWORK_MODE;
    this._crawlerTimeoutMs = this._config.crawlerTimeoutMs;
    this._chainRegistry.invalidateAll();

    // Reset IPFS from env config
    this._ipfsService.clearConfig();
    if (this._config.ipfs?.pinataJwt || this._config.ipfs?.ipfsUrl) {
      this._ipfsService.configure({
        pinataJwt: this._config.ipfs.pinataJwt,
        pinataEnabled: !!this._config.ipfs.pinataJwt,
        url: this._config.ipfs.ipfsUrl,
        filecoinPinEnabled: this._config.ipfs.filecoinEnabled,
        filecoinPrivateKey: this._config.ipfs.filecoinPrivateKey,
      });
    }
  }

  // Crawler timeout
  get crawlerTimeoutMs(): number {
    return this._crawlerTimeoutMs;
  }

  set crawlerTimeoutMs(value: number) {
    this._crawlerTimeoutMs = Math.max(1000, Math.min(value, 60000));
  }

  // Registries
  get chains(): ChainRegistry {
    return this._chainRegistry;
  }

  get tools(): ToolRegistry {
    return this._toolRegistry;
  }

  // Global IPFS service
  get ipfs(): IPFSService {
    return this._ipfsService;
  }

  // Cache - supports both legacy (full sync) and lazy (on-demand) modes
  get cache(): AgentCache | LazyCache {
    if (this._useLazyCache) {
      if (!this._lazyCache) {
        throw new Error('LazyCache not initialized. Call initialize() first.');
      }
      return this._lazyCache;
    }
    if (!this._legacyCache) {
      throw new Error('AgentCache not initialized. Call initialize() first.');
    }
    return this._legacyCache;
  }

  get lazyCache(): LazyCache | null {
    return this._lazyCache;
  }

  get legacyCache(): AgentCache | null {
    return this._legacyCache;
  }

  get hasCache(): boolean {
    return this._useLazyCache ? this._lazyCache !== null : this._legacyCache !== null;
  }

  get isLazyCache(): boolean {
    return this._useLazyCache;
  }

  // Lifecycle
  async initialize(config?: IGlobalStateConfig): Promise<void> {
    if (this._initialized) return;

    // Set network mode if provided
    if (config?.networkMode) {
      this._networkMode = config.networkMode;
    }

    // Choose cache mode (lazy by default for lightweight operation)
    this._useLazyCache = config?.useLazyCache ?? true;

    if (this._useLazyCache) {
      // Initialize lazy cache (lightweight, on-demand)
      this._lazyCache = new LazyCache({
        dbPath: config?.cachePath,
        ttlMs: config?.cacheTtlMs,
        maxEntries: config?.cacheMaxEntries,
      });
    } else {
      // Initialize legacy cache (full sync, background updates)
      this._legacyCache = new AgentCache({
        dbPath: config?.cachePath,
        autoSync: config?.autoSync ?? true,
      });
    }

    // Initialize all registered chains
    await this._chainRegistry.initializeAll();

    this._initialized = true;
  }

  start(): void {
    // Legacy cache has background sync, lazy cache doesn't need it
    if (this._legacyCache && !this._useLazyCache) {
      this._legacyCache.start();
    }
  }

  stop(): void {
    if (this._legacyCache) {
      this._legacyCache.stop();
      this._legacyCache = null;
    }
    if (this._lazyCache) {
      this._lazyCache.stop();
      this._lazyCache = null;
    }
    this._initialized = false;
  }

  // Helpers
  getDefaultChain(): IChainProvider | null {
    return this._chainRegistry.getDefault();
  }

  requireDefaultChain(): IChainProvider {
    return this._chainRegistry.require();
  }

  getChain(chainId?: string): IChainProvider | null {
    if (!chainId) {
      return this.getDefaultChain();
    }
    return this._chainRegistry.get(chainId);
  }

  requireChain(chainId?: string): IChainProvider {
    return this._chainRegistry.require(chainId);
  }

  // Snapshot for debugging/status
  getSnapshot(): IGlobalStateSnapshot {
    const chains = this._chainRegistry.getAll();
    const defaultChain = this._chainRegistry.getDefault();

    // Get cache stats from either lazy or legacy cache
    let cacheStats: { total: number; byChain: Record<string, number>; dbSize: string };
    if (this._useLazyCache && this._lazyCache) {
      const stats = this._lazyCache.getStats();
      cacheStats = { total: stats.total, byChain: stats.byChain, dbSize: stats.dbSize };
    } else if (this._legacyCache) {
      const stats = this._legacyCache.getStats();
      cacheStats = { total: stats.total, byChain: stats.byChain, dbSize: stats.dbSize };
    } else {
      cacheStats = { total: 0, byChain: {}, dbSize: '0 B' };
    }

    const ipfsConfig = this._ipfsService.getConfig();

    return {
      config: this._config,
      networkMode: this._networkMode,
      chains: {
        registered: chains.map(c => c.chainId),
        default: defaultChain?.chainId ?? null,
        ready: chains.filter(c => c.isReady()).map(c => c.chainId),
      },
      network: this.getNetworkStatus(),
      tools: {
        count: this._toolRegistry.size(),
      },
      cache: {
        total: cacheStats.total,
        byChain: cacheStats.byChain,
        dbSize: cacheStats.dbSize,
      },
      ipfs: {
        configured: this._ipfsService.isConfigured(),
        hasPinata: !!ipfsConfig?.pinataJwt,
        hasIpfsNode: !!ipfsConfig?.url,
        hasFilecoin: !!ipfsConfig?.filecoinPinEnabled,
      },
      crawlerTimeoutMs: this._crawlerTimeoutMs,
    };
  }
}

// Singleton instance
export const globalState = new GlobalState();

// Re-export for convenience
export { GlobalState };
export type { NetworkMode };
