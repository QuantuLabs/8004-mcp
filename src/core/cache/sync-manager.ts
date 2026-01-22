// Background sync manager for cache

import type { IDataSource } from './data-source.js';
import type { SqliteStore } from './sqlite-store.js';

export interface ISyncOptions {
  force?: boolean;
  batchSize?: number;
}

export interface ISyncProgress {
  sourceId: string;
  status: 'idle' | 'syncing' | 'completed' | 'error';
  progress: number;
  total?: number;
  synced?: number;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface ISyncManagerConfig {
  syncIntervalMs?: number;
  minSyncIntervalMs?: number;
  maxRetries?: number;
}

const DEFAULT_CONFIG: Required<ISyncManagerConfig> = {
  syncIntervalMs: 5 * 60 * 1000, // 5 minutes
  minSyncIntervalMs: 30 * 1000, // 30 seconds minimum between syncs
  maxRetries: 3,
};

export class SyncManager {
  private readonly store: SqliteStore;
  private readonly dataSources: Map<string, IDataSource> = new Map();
  private readonly config: Required<ISyncManagerConfig>;
  private readonly progress: Map<string, ISyncProgress> = new Map();
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private isSyncing = false;

  constructor(store: SqliteStore, config?: ISyncManagerConfig) {
    this.store = store;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  registerDataSource(dataSource: IDataSource): void {
    this.dataSources.set(dataSource.sourceId, dataSource);
    this.progress.set(dataSource.sourceId, {
      sourceId: dataSource.sourceId,
      status: 'idle',
      progress: 0,
    });
  }

  unregisterDataSource(sourceId: string): void {
    this.dataSources.delete(sourceId);
    this.progress.delete(sourceId);
  }

  getProgress(sourceId?: string): ISyncProgress | Map<string, ISyncProgress> {
    if (sourceId) {
      return this.progress.get(sourceId) ?? {
        sourceId,
        status: 'idle',
        progress: 0,
      };
    }
    return this.progress;
  }

  startBackgroundSync(): void {
    if (this.syncInterval) return;

    this.syncInterval = setInterval(() => {
      void this.syncAll();
    }, this.config.syncIntervalMs);

    // Initial sync
    void this.syncAll();
  }

  stopBackgroundSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  async syncAll(options?: ISyncOptions): Promise<Map<string, ISyncProgress>> {
    if (this.isSyncing && !options?.force) {
      return this.progress;
    }

    this.isSyncing = true;

    const results = new Map<string, ISyncProgress>();
    for (const [sourceId, dataSource] of this.dataSources) {
      try {
        const result = await this.syncSource(sourceId, dataSource, options);
        results.set(sourceId, result);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.set(sourceId, {
          sourceId,
          status: 'error',
          progress: 0,
          error: errorMessage,
        });
      }
    }

    this.isSyncing = false;
    return results;
  }

  async syncSource(sourceId: string, dataSource?: IDataSource, options?: ISyncOptions): Promise<ISyncProgress> {
    const source = dataSource ?? this.dataSources.get(sourceId);
    if (!source) {
      return {
        sourceId,
        status: 'error',
        progress: 0,
        error: `Data source not found: ${sourceId}`,
      };
    }

    // Check rate limiting
    if (!options?.force) {
      const syncState = this.store.getSyncState(sourceId);
      if (syncState?.last_timestamp) {
        const elapsed = Date.now() - syncState.last_timestamp;
        if (elapsed < this.config.minSyncIntervalMs) {
          return {
            sourceId,
            status: 'idle',
            progress: 100,
            total: syncState.total_agents ?? undefined,
          };
        }
      }
    }

    // Check availability
    const available = await source.isAvailable();
    if (!available) {
      const progress: ISyncProgress = {
        sourceId,
        status: 'error',
        progress: 0,
        error: 'Data source not available',
      };
      this.progress.set(sourceId, progress);
      return progress;
    }

    // Start sync
    const startedAt = Date.now();
    let progress: ISyncProgress = {
      sourceId,
      status: 'syncing',
      progress: 0,
      startedAt,
    };
    this.progress.set(sourceId, progress);

    this.store.updateSyncState(sourceId, {
      chain_prefix: source.chainPrefix,
      status: 'syncing',
    });

    try {
      // Get last sync state
      const syncState = this.store.getSyncState(sourceId);
      let cursor = options?.force ? undefined : syncState?.last_cursor ?? undefined;
      const updatedSince = options?.force ? undefined : syncState?.last_timestamp ?? undefined;

      // Get total for progress calculation
      const total = await source.getTotalCount();
      let synced = 0;

      // Fetch batches
      let hasMore = true;
      let retries = 0;

      while (hasMore) {
        try {
          const batch = await source.fetchBatch({
            cursor,
            updatedSince,
            limit: options?.batchSize ?? 1000,
          });

          if (batch.agents.length > 0) {
            this.store.upsertAgentsBatch(batch.agents);
            synced += batch.agents.length;
          }

          cursor = batch.cursor;
          hasMore = batch.hasMore;

          // Update progress
          progress = {
            ...progress,
            progress: total > 0 ? Math.min(100, Math.round((synced / total) * 100)) : 0,
            total,
            synced,
          };
          this.progress.set(sourceId, progress);

          retries = 0;
        } catch (error) {
          retries++;
          if (retries >= this.config.maxRetries) {
            throw error;
          }
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * retries));
        }
      }

      // Sync completed
      const completedAt = Date.now();
      progress = {
        sourceId,
        status: 'completed',
        progress: 100,
        total,
        synced,
        startedAt,
        completedAt,
      };
      this.progress.set(sourceId, progress);

      this.store.updateSyncState(sourceId, {
        chain_prefix: source.chainPrefix,
        last_cursor: cursor,
        last_timestamp: completedAt,
        total_agents: total,
        status: 'idle',
        error_message: null,
      });

      return progress;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      progress = {
        sourceId,
        status: 'error',
        progress: progress.progress,
        error: errorMessage,
        startedAt,
      };
      this.progress.set(sourceId, progress);

      this.store.updateSyncState(sourceId, {
        chain_prefix: source.chainPrefix,
        status: 'error',
        error_message: errorMessage,
      });

      return progress;
    }
  }
}
