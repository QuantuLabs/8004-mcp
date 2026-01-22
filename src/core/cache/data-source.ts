// Data source interface for cache sync

import type { IUpsertAgent } from './sqlite-store.js';

export interface ISyncBatch {
  agents: IUpsertAgent[];
  cursor?: string;
  hasMore: boolean;
  total?: number;
}

export interface IDataSource {
  readonly sourceId: string;
  readonly chainPrefix: string;

  // Check if data source is available
  isAvailable(): Promise<boolean>;

  // Fetch a batch of agents (for incremental sync)
  fetchBatch(options: {
    cursor?: string;
    updatedSince?: number;
    limit?: number;
  }): Promise<ISyncBatch>;

  // Get total count of agents
  getTotalCount(): Promise<number>;
}

// Abstract base class with common functionality
export abstract class BaseDataSource implements IDataSource {
  abstract readonly sourceId: string;
  abstract readonly chainPrefix: string;

  abstract isAvailable(): Promise<boolean>;
  abstract fetchBatch(options: {
    cursor?: string;
    updatedSince?: number;
    limit?: number;
  }): Promise<ISyncBatch>;
  abstract getTotalCount(): Promise<number>;

  protected defaultBatchSize = 1000;
}
