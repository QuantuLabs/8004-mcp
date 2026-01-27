// Lazy cache - caches search results on-demand, no background sync
// Optimized for low memory footprint with TTL eviction

import { SlimStore, type ISlimCacheConfig } from './slim-store.js';
import type { IAgentSummary, ISearchResult, ChainPrefix } from '../interfaces/agent.js';

export interface ILazyCacheConfig extends ISlimCacheConfig {
  // No background sync config needed
}

export class LazyCache {
  private readonly store: SlimStore;

  constructor(config?: ILazyCacheConfig) {
    this.store = new SlimStore(config);
  }

  // Cache a single agent (called when agent is fetched)
  cacheAgent(agent: IAgentSummary): void {
    this.store.cache({
      id: agent.globalId,
      chain: agent.chainPrefix,
      rawId: agent.id,
      name: agent.name,
      owner: agent.owner,
      trustTier: agent.trustTier,
      qualityScore: agent.qualityScore,
    });
  }

  // Cache search results (called after provider search)
  cacheSearchResults(results: IAgentSummary[]): void {
    if (results.length === 0) return;

    const toCache = results.map(agent => ({
      id: agent.globalId,
      chain: agent.chainPrefix,
      rawId: agent.id,
      name: agent.name,
      owner: agent.owner,
      trustTier: agent.trustTier,
      qualityScore: agent.qualityScore,
    }));

    this.store.cacheBatch(toCache);
  }

  // Get cached agent
  getAgent(globalId: string): IAgentSummary | null {
    const cached = this.store.get(globalId);
    if (!cached) return null;

    return {
      id: cached.raw_id,
      globalId: cached.id,
      chainType: cached.chain === 'sol' ? 'solana' : 'evm',
      chainPrefix: cached.chain as ChainPrefix,
      name: cached.name,
      owner: cached.owner,
      trustTier: cached.trust_tier ?? undefined,
      qualityScore: cached.quality_score ?? undefined,
    };
  }

  // Search cached agents by name
  search(query: string, options?: {
    chainPrefix?: string;
    limit?: number;
    offset?: number;
  }): ISearchResult {
    return this.store.search(query, {
      chain: options?.chainPrefix,
      limit: options?.limit,
      offset: options?.offset,
    });
  }

  // List cached agents
  list(chain?: string, options?: { limit?: number; offset?: number }): ISearchResult {
    return this.store.list(chain, options);
  }

  // Stats
  getStats() {
    return this.store.getStats();
  }

  // Maintenance
  evictExpired(): number {
    return this.store.evictExpired();
  }

  clear(): void {
    this.store.clear();
  }

  stop(): void {
    this.store.close();
  }
}
