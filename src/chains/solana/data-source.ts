// Solana data source for cache sync

import type { IndexerClient, IndexedAgent } from '8004-solana';
import { BaseDataSource } from '../../core/cache/data-source.js';
import type { ISyncBatch } from '../../core/cache/data-source.js';
import type { IUpsertAgent } from '../../core/cache/sqlite-store.js';

export class SolanaDataSource extends BaseDataSource {
  readonly sourceId = 'sol:devnet';
  readonly chainPrefix = 'sol';

  private readonly indexer: IndexerClient;

  constructor(indexer: IndexerClient, cluster: string = 'devnet') {
    super();
    this.indexer = indexer;
    (this as { sourceId: string }).sourceId = `sol:${cluster}`;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.indexer.getGlobalStats();
      return true;
    } catch {
      return false;
    }
  }

  async fetchBatch(options: {
    cursor?: string;
    updatedSince?: number;
    limit?: number;
  }): Promise<ISyncBatch> {
    const limit = options.limit ?? this.defaultBatchSize;

    // Parse cursor for offset
    const offset = options.cursor ? parseInt(options.cursor, 10) : 0;

    // Fetch agents from indexer using getAgents (no searchAgents method)
    const indexedAgents = await this.indexer.getAgents({
      limit,
      offset,
      order: 'updated_at.desc',
    });

    const agents: IUpsertAgent[] = indexedAgents.map((agent: IndexedAgent) => ({
      id: `sol:${agent.asset}`,
      chainPrefix: 'sol' as const,
      chainType: 'solana' as const,
      rawId: agent.asset,
      name: agent.nft_name ?? 'Unknown',
      description: undefined,
      image: undefined,
      owner: agent.owner,
      collection: agent.collection,
      metadata: undefined,
      endpoints: undefined,
      trustTier: agent.trust_tier,
      qualityScore: agent.quality_score,
      totalFeedbacks: agent.feedback_count,
      averageScore: agent.raw_avg_score,
      createdAt: agent.created_at ? new Date(agent.created_at).getTime() : Date.now(),
      updatedAt: agent.updated_at ? new Date(agent.updated_at).getTime() : Date.now(),
    }));

    const nextOffset = offset + agents.length;
    // Since getAgents doesn't return total, we check if we got a full batch
    const hasMore = agents.length === limit;

    return {
      agents,
      cursor: hasMore ? String(nextOffset) : undefined,
      hasMore,
      total: undefined, // Not available from getAgents
    };
  }

  async getTotalCount(): Promise<number> {
    const stats = await this.indexer.getGlobalStats();
    return stats.total_agents ?? 0;
  }
}
