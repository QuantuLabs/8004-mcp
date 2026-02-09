// Agent cache facade - combines SQLite store with sync manager

import { SqliteStore } from './sqlite-store.js';
import type { ICacheStats, IUpsertAgent } from './sqlite-store.js';
import { SyncManager } from './sync-manager.js';
import type { ISyncManagerConfig, ISyncProgress, ISyncOptions } from './sync-manager.js';
import type { IDataSource } from './data-source.js';
import type { IAgentSummary, ISearchParams, ISearchResult, ChainPrefix } from '../interfaces/agent.js';

export interface IAgentCacheConfig {
  dbPath?: string;
  sync?: ISyncManagerConfig;
  autoSync?: boolean;
}

export class AgentCache {
  private readonly store: SqliteStore;
  private readonly syncManager: SyncManager;
  private readonly autoSync: boolean;

  constructor(config?: IAgentCacheConfig) {
    this.store = new SqliteStore(config?.dbPath);
    this.syncManager = new SyncManager(this.store, config?.sync);
    this.autoSync = config?.autoSync ?? true;
  }

  // Lifecycle
  start(): void {
    if (this.autoSync) {
      this.syncManager.startBackgroundSync();
    }
  }

  stop(): void {
    this.syncManager.stopBackgroundSync();
    this.store.close();
  }

  // Data source management
  registerDataSource(dataSource: IDataSource): void {
    this.syncManager.registerDataSource(dataSource);
  }

  unregisterDataSource(sourceId: string): void {
    this.syncManager.unregisterDataSource(sourceId);
  }

  // Search operations
  search(query: string, options?: {
    chainPrefix?: string;
    limit?: number;
    offset?: number;
  }): ISearchResult {
    return this.store.searchByName(query, options);
  }

  searchAgents(params: ISearchParams): ISearchResult {
    return this.store.searchAgents(params);
  }

  // Agent operations
  getAgent(globalId: string): IAgentSummary | null {
    const cached = this.store.getAgent(globalId);
    if (!cached) return null;

    return {
      id: cached.raw_id,
      globalId: cached.id,
      chainType: cached.chain_type as 'solana' | 'evm',
      chainPrefix: cached.chain_prefix as ChainPrefix,
      name: cached.name,
      description: cached.description ?? undefined,
      image: cached.image ?? undefined,
      owner: cached.owner,
      collection: cached.collection ?? undefined,
      trustTier: cached.trust_tier ?? undefined,
      qualityScore: cached.quality_score ?? undefined,
      totalFeedbacks: cached.total_feedbacks ?? undefined,
    };
  }

  upsertAgent(agent: IUpsertAgent): void {
    this.store.upsertAgent(agent);
  }

  upsertAgentsBatch(agents: IUpsertAgent[]): void {
    this.store.upsertAgentsBatch(agents);
  }

  deleteAgent(globalId: string): boolean {
    return this.store.deleteAgent(globalId);
  }

  // Sync operations
  async refresh(options?: ISyncOptions & { sourceId?: string }): Promise<Map<string, ISyncProgress>> {
    if (options?.sourceId) {
      const result = await this.syncManager.syncSource(options.sourceId, undefined, options);
      return new Map([[options.sourceId, result]]);
    }
    return this.syncManager.syncAll(options);
  }

  getSyncProgress(sourceId?: string): ISyncProgress | Map<string, ISyncProgress> {
    return this.syncManager.getProgress(sourceId);
  }

  // Stats
  getStats(): ICacheStats {
    return this.store.getStats();
  }

  // Maintenance
  optimize(): void {
    this.store.optimizeFts();
    this.store.vacuum();
  }
}
