// Unified agent tools

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  getArgs,
  readString,
  readNumber,
  parseChainParam,
  parsePagination,
} from '../../core/parsers/common.js';
import { successResponse } from '../../core/serializers/common.js';
import { globalState } from '../../state/global-state.js';
import { parseGlobalId, isValidGlobalId } from '../../core/interfaces/agent.js';
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
          description: 'Chain prefix (sol, base, eth) - optional if using global ID',
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
    description: 'Search agents across chains with filters',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (name, description)',
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
          description: 'Filter by chain (sol, base, eth, all)',
        },
        minQualityScore: {
          type: 'number',
          description: 'Minimum quality score (0-100)',
        },
        minTrustTier: {
          type: 'number',
          description: 'Minimum trust tier (0-4)',
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
      provider = globalState.chains.getByPrefix(chainPrefix as 'sol' | 'base' | 'eth' | 'arb' | 'poly' | 'op');
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
      provider = globalState.chains.getByPrefix(chainPrefix as 'sol' | 'base' | 'eth' | 'arb' | 'poly' | 'op');
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
    const owner = readString(input, 'owner');
    const collection = readString(input, 'collection');
    const { chainPrefix } = parseChainParam(input);
    const minQualityScore = readNumber(input, 'minQualityScore');
    const minTrustTier = readNumber(input, 'minTrustTier');
    const { limit, offset } = parsePagination(input);

    // If chain specified, search that chain only
    if (chainPrefix && chainPrefix !== 'all') {
      const provider = globalState.chains.getByPrefix(chainPrefix as 'sol' | 'base' | 'eth' | 'arb' | 'poly' | 'op');
      if (provider) {
        const result = await provider.searchAgents({
          query,
          owner,
          collection,
          minQualityScore,
          minTrustTier,
          limit,
          offset,
        });
        return successResponse(result);
      }
    }

    // Search cache for cross-chain
    if (query && globalState.hasCache) {
      const result = globalState.cache.search(query, {
        chainPrefix: chainPrefix !== 'all' ? chainPrefix : undefined,
        limit,
        offset,
      });
      return successResponse(result);
    }

    // Default to current chain
    const provider = globalState.chains.getDefault();
    if (!provider) {
      return successResponse({ results: [], total: 0, hasMore: false, offset, limit });
    }

    const result = await provider.searchAgents({
      query,
      owner,
      collection,
      minQualityScore,
      minTrustTier,
      limit,
      offset,
    });
    return successResponse(result);
  },

  agent_list_by_owner: async (args: unknown) => {
    const input = getArgs(args);
    const owner = readString(input, 'owner', true);
    const { chainPrefix } = parseChainParam(input);
    const { limit, offset } = parsePagination(input);

    const provider = chainPrefix
      ? globalState.chains.getByPrefix(chainPrefix as 'sol' | 'base' | 'eth' | 'arb' | 'poly' | 'op')
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
