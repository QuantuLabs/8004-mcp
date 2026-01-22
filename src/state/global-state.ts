// Global state manager for multi-chain MCP

import { ChainRegistry } from '../core/registry/chain-registry.js';
import { ToolRegistry } from '../core/registry/tool-registry.js';
import { AgentCache } from '../core/cache/agent-cache.js';
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

export interface IGlobalStateConfig {
  autoSync?: boolean;
  cachePath?: string;
  networkMode?: NetworkMode;
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
  crawlerTimeoutMs: number;
}

class GlobalState {
  private _config: IEnvConfig;
  private _networkMode: NetworkMode;
  private _chainRegistry: ChainRegistry;
  private _toolRegistry: ToolRegistry;
  private _cache: AgentCache | null = null;
  private _crawlerTimeoutMs: number;
  private _initialized = false;

  constructor() {
    this._config = loadEnvConfig();
    this._networkMode = DEFAULT_NETWORK_MODE;
    this._chainRegistry = new ChainRegistry();
    this._toolRegistry = new ToolRegistry();
    this._crawlerTimeoutMs = this._config.crawlerTimeoutMs;
  }

  // Network mode
  get networkMode(): NetworkMode {
    return this._networkMode;
  }

  setNetworkMode(mode: NetworkMode): { previous: NetworkMode; current: NetworkMode; deployedChains: ChainPrefix[] } {
    const previous = this._networkMode;
    this._networkMode = mode;

    // Invalidate chain providers so they reconfigure with new network settings
    this._chainRegistry.invalidateAll();

    const deployedChains = getDeployedChains(mode);

    return {
      previous,
      current: mode,
      deployedChains,
    };
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

  // Cache
  get cache(): AgentCache {
    if (!this._cache) {
      throw new Error('Cache not initialized. Call initialize() first.');
    }
    return this._cache;
  }

  get hasCache(): boolean {
    return this._cache !== null;
  }

  // Lifecycle
  async initialize(config?: IGlobalStateConfig): Promise<void> {
    if (this._initialized) return;

    // Set network mode if provided
    if (config?.networkMode) {
      this._networkMode = config.networkMode;
    }

    // Initialize cache
    this._cache = new AgentCache({
      dbPath: config?.cachePath,
      autoSync: config?.autoSync ?? true,
    });

    // Initialize all registered chains
    await this._chainRegistry.initializeAll();

    this._initialized = true;
  }

  start(): void {
    if (this._cache) {
      this._cache.start();
    }
  }

  stop(): void {
    if (this._cache) {
      this._cache.stop();
    }
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
    const cacheStats = this._cache?.getStats() ?? { total: 0, byChain: {}, dbSize: '0 B', lastSync: {} };

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
      crawlerTimeoutMs: this._crawlerTimeoutMs,
    };
  }
}

// Singleton instance
export const globalState = new GlobalState();

// Re-export for convenience
export { GlobalState };
export type { NetworkMode };
