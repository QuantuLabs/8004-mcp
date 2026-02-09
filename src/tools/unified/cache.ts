// Unified cache tools

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  getArgs,
  readString,
  readNumber,
  readBoolean,
} from '../../core/parsers/common.js';
import { successResponse } from '../../core/serializers/common.js';
import { globalState } from '../../state/global-state.js';

export const cacheTools: Tool[] = [
  {
    name: 'cache_search',
    description: 'Search agents by name across all chains using full-text search (FTS5). Very fast even with millions of agents.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (agent name or description)',
        },
        chain: {
          type: 'string',
          description: 'Filter by chain prefix (sol, base, eth, poly, bsc, monad, all)',
        },
        limit: {
          type: 'number',
          description: 'Max results (default: 20, max: 100)',
        },
        offset: {
          type: 'number',
          description: 'Pagination offset (default: 0)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'cache_refresh',
    description: 'Force refresh cache from indexers',
    inputSchema: {
      type: 'object',
      properties: {
        chain: {
          type: 'string',
          description: 'Chain to refresh (sol, base, all)',
        },
        force: {
          type: 'boolean',
          description: 'Force refresh even if recently synced',
        },
      },
    },
  },
  {
    name: 'cache_stats',
    description: 'Get cache statistics including total agents, size, and sync status',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'cache_sync_status',
    description: 'Get detailed sync status for each data source',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

export const cacheHandlers: Record<string, (args: unknown) => Promise<unknown>> = {
  cache_search: async (args: unknown) => {
    const input = getArgs(args);
    const query = readString(input, 'query', true);
    const chain = readString(input, 'chain');
    const limit = Math.min(readNumber(input, 'limit') ?? 20, 100);
    const offset = readNumber(input, 'offset') ?? 0;

    if (!globalState.hasCache) {
      return successResponse({
        error: 'Cache not initialized',
        results: [],
        total: 0,
        hasMore: false,
      });
    }

    // Both LazyCache and AgentCache have compatible search() method
    const cache = globalState.cache;
    const result = cache.search(query, {
      chainPrefix: chain !== 'all' ? chain : undefined,
      limit,
      offset,
    });

    return successResponse(result);
  },

  cache_refresh: async (args: unknown) => {
    const input = getArgs(args);
    const chain = readString(input, 'chain');
    const force = readBoolean(input, 'force') ?? false;

    if (!globalState.hasCache) {
      return successResponse({
        error: 'Cache not initialized',
        status: 'not_available',
      });
    }

    // LazyCache: just evict expired entries (no background sync)
    if (globalState.isLazyCache) {
      const lazyCache = globalState.lazyCache;
      if (lazyCache) {
        const evicted = lazyCache.evictExpired();
        if (force) {
          lazyCache.clear();
          return successResponse({
            message: 'Cache cleared (lazy mode)',
            evicted: 'all',
          });
        }
        return successResponse({
          message: 'Expired entries evicted (lazy mode)',
          evicted,
        });
      }
    }

    // Legacy AgentCache: trigger background sync
    const legacyCache = globalState.legacyCache;
    if (!legacyCache) {
      return successResponse({
        error: 'Legacy cache not available',
        status: 'not_available',
      });
    }

    // Map chain prefix (e.g., 'sol') to full sourceId (e.g., 'sol:devnet')
    let sourceId: string | undefined;
    if (chain && chain !== 'all') {
      const allProgress = legacyCache.getSyncProgress();
      if (allProgress instanceof Map) {
        for (const [id] of allProgress) {
          if (id === chain || id.startsWith(`${chain}:`)) {
            sourceId = id;
            break;
          }
        }
        if (!sourceId) {
          sourceId = chain;
        }
      } else {
        sourceId = chain;
      }
    }

    const results = await legacyCache.refresh({
      sourceId,
      force,
    });

    // Convert Map to object for JSON serialization
    const progress: Record<string, unknown> = {};
    for (const [id, status] of results) {
      progress[id] = status;
    }

    return successResponse({
      message: 'Cache refresh initiated',
      progress,
    });
  },

  cache_stats: async () => {
    if (!globalState.hasCache) {
      return successResponse({
        error: 'Cache not initialized',
        total: 0,
        byChain: {},
        dbSize: '0 B',
        mode: 'none',
      });
    }

    const stats = globalState.cache.getStats();
    const mode = globalState.isLazyCache ? 'lazy' : 'legacy';

    return successResponse({ ...stats, mode });
  },

  cache_sync_status: async () => {
    if (!globalState.hasCache) {
      return successResponse({
        error: 'Cache not initialized',
        sources: {},
      });
    }

    // LazyCache doesn't have sync progress (on-demand caching)
    if (globalState.isLazyCache) {
      const stats = globalState.lazyCache?.getStats();
      return successResponse({
        mode: 'lazy',
        message: 'Lazy cache uses on-demand caching, no background sync',
        stats: stats ?? { total: 0, byChain: {}, dbSize: '0 B', expired: 0 },
      });
    }

    // Legacy cache has sync progress
    const legacyCache = globalState.legacyCache;
    if (!legacyCache) {
      return successResponse({ sources: {} });
    }

    const progress = legacyCache.getSyncProgress();

    if (progress instanceof Map) {
      const sources: Record<string, unknown> = {};
      for (const [id, status] of progress) {
        sources[id] = status;
      }
      return successResponse({ mode: 'legacy', sources });
    }

    return successResponse({ mode: 'legacy', sources: { default: progress } });
  },
};

// No backward compatibility aliases for cache tools (new feature)
export const cacheAliases: Record<string, string> = {};
