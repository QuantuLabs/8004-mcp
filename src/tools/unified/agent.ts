// Unified agent tools

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  getArgs,
  readString,
  readNumber,
  readBoolean,
  readStringArray,
  parseChainParam,
  parsePagination,
} from '../../core/parsers/common.js';
import { successResponse } from '../../core/serializers/common.js';
import { globalState } from '../../state/global-state.js';
import { parseGlobalId, isValidGlobalId, type ChainPrefix } from '../../core/interfaces/agent.js';
import { agentNotFoundError } from '../../core/errors/mcp-error.js';

export const agentTools: Tool[] = [
  {
    name: 'agent_get',
    description: 'Get agent details by ID. Supports global IDs (sol:xxx, base:8453:xxx) or chain-specific IDs with chain parameter.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Agent ID (global format like sol:xxx or chain-specific)',
        },
        chain: {
          type: 'string',
          description: 'Chain prefix (sol, base, eth, poly, bsc, monad) - optional if using global ID',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'agent_exists',
    description: 'Check if an agent exists on-chain',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Agent ID (global or chain-specific)',
        },
        chain: {
          type: 'string',
          description: 'Chain prefix (optional if using global ID)',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'agent_search',
    description: 'Search agents across chains with advanced filters. Supports search by name, capabilities, MCP tools, A2A skills, and more.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'General search query - searches name and description',
        },
        nameQuery: {
          type: 'string',
          description: 'Search by agent name (exact or partial match)',
        },
        descriptionQuery: {
          type: 'string',
          description: 'Search by description, skills, or capabilities',
        },
        endpointQuery: {
          type: 'string',
          description: 'Search by MCP or A2A endpoint URL',
        },
        searchMode: {
          type: 'string',
          enum: ['name', 'description', 'endpoint', 'all'],
          description: 'Which fields to search in (default: all)',
        },
        owner: {
          type: 'string',
          description: 'Filter by owner address',
        },
        collection: {
          type: 'string',
          description: 'Filter by collection',
        },
        chain: {
          type: 'string',
          description: 'Filter by chain (sol, base, eth, poly, bsc, monad, all)',
        },
        minQualityScore: {
          type: 'number',
          description: 'Minimum quality score (0-100)',
        },
        minTrustTier: {
          type: 'number',
          description: 'Minimum trust tier (0-4)',
        },
        // Advanced SDK filters (EVM)
        mcpTools: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by MCP tools (agent must have ALL listed tools)',
        },
        a2aSkills: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by A2A skills (agent must have ALL listed skills)',
        },
        oasfSkills: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by OASF skills (e.g., text-generation, image-classification)',
        },
        oasfDomains: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by OASF domains (e.g., finance, healthcare)',
        },
        active: {
          type: 'boolean',
          description: 'Filter by active status (true=active only, false=inactive only)',
        },
        x402support: {
          type: 'boolean',
          description: 'Filter by x402 payment support',
        },
        hasMcp: {
          type: 'boolean',
          description: 'Filter by has MCP endpoint',
        },
        hasA2a: {
          type: 'boolean',
          description: 'Filter by has A2A endpoint',
        },
        keyword: {
          type: 'string',
          description: 'Semantic keyword search across agent name, description, and capabilities',
        },
        minFeedbackCount: {
          type: 'number',
          description: 'Minimum feedback count',
        },
        minFeedbackValue: {
          type: 'number',
          description: 'Minimum average feedback value',
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
    },
  },
  {
    name: 'agent_list_by_owner',
    description: 'List all agents owned by an address',
    inputSchema: {
      type: 'object',
      properties: {
        owner: {
          type: 'string',
          description: 'Owner address',
        },
        chain: {
          type: 'string',
          description: 'Chain to query (default: current chain)',
        },
        limit: {
          type: 'number',
          description: 'Max results (default: 20)',
        },
        offset: {
          type: 'number',
          description: 'Pagination offset',
        },
      },
      required: ['owner'],
    },
  },
];

export const agentHandlers: Record<string, (args: unknown) => Promise<unknown>> = {
  agent_get: async (args: unknown) => {
    const input = getArgs(args);
    const id = readString(input, 'id', true);
    const { chainPrefix } = parseChainParam(input);

    // Resolve chain from ID or parameter
    let provider;
    let rawId = id;

    if (isValidGlobalId(id)) {
      const parsed = parseGlobalId(id);
      provider = globalState.chains.getByPrefix(parsed.prefix);
      rawId = parsed.rawId;
    } else if (chainPrefix) {
      provider = globalState.chains.getByPrefix(chainPrefix as ChainPrefix);
    } else {
      provider = globalState.chains.getDefault();
    }

    if (!provider) {
      throw agentNotFoundError(id);
    }

    const agent = await provider.getAgent(rawId);
    if (!agent) {
      throw agentNotFoundError(id);
    }

    return successResponse(agent);
  },

  agent_exists: async (args: unknown) => {
    const input = getArgs(args);
    const id = readString(input, 'id', true);
    const { chainPrefix } = parseChainParam(input);

    let provider;
    let rawId = id;

    if (isValidGlobalId(id)) {
      const parsed = parseGlobalId(id);
      provider = globalState.chains.getByPrefix(parsed.prefix);
      rawId = parsed.rawId;
    } else if (chainPrefix) {
      provider = globalState.chains.getByPrefix(chainPrefix as ChainPrefix);
    } else {
      provider = globalState.chains.getDefault();
    }

    if (!provider) {
      return successResponse({ exists: false, chain: null });
    }

    const exists = await provider.agentExists(rawId);
    return successResponse({
      exists,
      chain: provider.chainId,
    });
  },

  agent_search: async (args: unknown) => {
    const input = getArgs(args);
    const query = readString(input, 'query');
    const nameQuery = readString(input, 'nameQuery');
    const descriptionQuery = readString(input, 'descriptionQuery');
    const endpointQuery = readString(input, 'endpointQuery');
    const searchMode = readString(input, 'searchMode') as 'name' | 'description' | 'endpoint' | 'all' | undefined;
    const owner = readString(input, 'owner');
    const collection = readString(input, 'collection');
    const { chainPrefix } = parseChainParam(input);
    const minQualityScore = readNumber(input, 'minQualityScore');
    const minTrustTier = readNumber(input, 'minTrustTier');
    const { limit, offset } = parsePagination(input);
    // Advanced SDK filters (EVM)
    const mcpTools = readStringArray(input, 'mcpTools');
    const a2aSkills = readStringArray(input, 'a2aSkills');
    const oasfSkills = readStringArray(input, 'oasfSkills');
    const oasfDomains = readStringArray(input, 'oasfDomains');
    const active = readBoolean(input, 'active');
    const x402support = readBoolean(input, 'x402support');
    const hasMcp = readBoolean(input, 'hasMcp');
    const hasA2a = readBoolean(input, 'hasA2a');
    const keyword = readString(input, 'keyword');
    const minFeedbackCount = readNumber(input, 'minFeedbackCount');
    const minFeedbackValue = readNumber(input, 'minFeedbackValue');

    // Build feedback filters if specified
    const feedback = (minFeedbackCount !== undefined || minFeedbackValue !== undefined)
      ? {
          ...(minFeedbackCount !== undefined ? { minCount: minFeedbackCount } : {}),
          ...(minFeedbackValue !== undefined ? { minValue: minFeedbackValue } : {}),
        }
      : undefined;

    // Build search params with specific field queries
    const searchParams = {
      query,
      nameQuery,
      descriptionQuery,
      endpointQuery,
      searchMode: searchMode ?? 'all',
      owner,
      collection,
      minQualityScore,
      minTrustTier,
      limit,
      offset,
      // Advanced SDK filters
      mcpTools,
      a2aSkills,
      oasfSkills,
      oasfDomains,
      active,
      x402support,
      hasMcp,
      hasA2a,
      keyword,
      feedback,
    };

    // If specific chain requested (not "all"), search that chain only
    if (chainPrefix && chainPrefix !== 'all') {
      const provider = globalState.chains.getByPrefix(chainPrefix as ChainPrefix);
      if (provider) {
        const result = await provider.searchAgents(searchParams);
        // Cache results for future searches
        if (globalState.isLazyCache && globalState.lazyCache) {
          globalState.lazyCache.cacheSearchResults(result.results);
        }
        return successResponse(result);
      }
    }

    // Multi-chain search: query ALL deployed providers in parallel
    const allProviders = globalState.chains.getAll();
    if (allProviders.length === 0) {
      return successResponse({ results: [], total: 0, hasMore: false, offset, limit });
    }

    // Search all chains in parallel with per-chain limit
    // For deep pagination, fetch enough results to satisfy offset + limit
    // Each chain needs to return at least (offset + limit) / numChains results
    // but we fetch offset + limit per chain to ensure enough after deduplication
    const perChainLimit = Math.min(offset + limit, 100);
    const searchPromises = allProviders.map(async (provider) => {
      try {
        const result = await provider.searchAgents({
          ...searchParams,
          limit: perChainLimit,
          offset: 0, // Always start from 0 for multi-chain, handle offset after merge
        });
        return result.results;
      } catch (err) {
        // Log but don't fail entire search if one chain fails
        console.warn(`Search failed for ${provider.chainId}: ${err}`);
        return [];
      }
    });

    const resultsPerChain = await Promise.all(searchPromises);

    // Flatten and deduplicate by globalId
    const seen = new Set<string>();
    const allResults = resultsPerChain.flat().filter(agent => {
      if (seen.has(agent.globalId)) return false;
      seen.add(agent.globalId);
      return true;
    });

    // Sort by qualityScore (descending) then by name
    allResults.sort((a, b) => {
      const scoreA = a.qualityScore ?? 0;
      const scoreB = b.qualityScore ?? 0;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return (a.name ?? '').localeCompare(b.name ?? '');
    });

    // Apply pagination after merge
    const paginated = allResults.slice(offset, offset + limit);

    // Cache results for future searches
    if (globalState.isLazyCache && globalState.lazyCache) {
      globalState.lazyCache.cacheSearchResults(paginated);
    }

    return successResponse({
      results: paginated,
      total: allResults.length,
      hasMore: offset + paginated.length < allResults.length,
      offset,
      limit,
    });
  },

  agent_list_by_owner: async (args: unknown) => {
    const input = getArgs(args);
    const owner = readString(input, 'owner', true);
    const { chainPrefix } = parseChainParam(input);
    const { limit, offset } = parsePagination(input);

    const provider = chainPrefix
      ? globalState.chains.getByPrefix(chainPrefix as ChainPrefix)
      : globalState.chains.getDefault();

    if (!provider) {
      return successResponse({ results: [], total: 0, hasMore: false, offset, limit });
    }

    const result = await provider.searchAgents({ owner, limit, offset });
    return successResponse(result);
  },
};

// Backward compatibility aliases
export const agentAliases: Record<string, string> = {
  sdk_get_agent: 'agent_get',
  sdk_agent_exists: 'agent_exists',
  sdk_search_agents: 'agent_search',
  sdk_get_agents_by_owner: 'agent_list_by_owner',
};
