// Unified reputation tools

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

export const reputationTools: Tool[] = [
  {
    name: 'reputation_get',
    description: 'Get reputation summary for an agent including trust tier, quality score, and feedback statistics',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Agent ID (global or chain-specific)',
        },
        chain: {
          type: 'string',
          description: 'Chain to use (optional if using global ID)',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'leaderboard_get',
    description: 'Get top agents ranked by reputation score',
    inputSchema: {
      type: 'object',
      properties: {
        chain: {
          type: 'string',
          description: 'Chain to query (sol, base, all)',
        },
        collection: {
          type: 'string',
          description: 'Filter by collection',
        },
        minFeedbacks: {
          type: 'number',
          description: 'Minimum feedback count to qualify',
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
    },
  },
];

export const reputationHandlers: Record<string, (args: unknown) => Promise<unknown>> = {
  reputation_get: async (args: unknown) => {
    const input = getArgs(args);
    const agentId = readString(input, 'id', true);
    const { chainPrefix } = parseChainParam(input);

    let provider;
    let rawId = agentId;

    if (isValidGlobalId(agentId)) {
      const parsed = parseGlobalId(agentId);
      provider = globalState.chains.getByPrefix(parsed.prefix);
      rawId = parsed.rawId;
    } else if (chainPrefix) {
      provider = globalState.chains.getByPrefix(chainPrefix as 'sol' | 'base' | 'eth' | 'arb' | 'poly' | 'op');
    } else {
      provider = globalState.chains.getDefault();
    }

    if (!provider) {
      throw new Error('No chain provider available');
    }

    const summary = await provider.getReputationSummary(rawId);
    if (!summary) {
      throw new Error(`Reputation data not found for agent: ${rawId}`);
    }

    return successResponse(summary);
  },

  leaderboard_get: async (args: unknown) => {
    const input = getArgs(args);
    const { chainPrefix } = parseChainParam(input);
    const collection = readString(input, 'collection');
    const minFeedbacks = readNumber(input, 'minFeedbacks');
    const { limit, offset } = parsePagination(input);

    // If specific chain requested
    if (chainPrefix && chainPrefix !== 'all') {
      const provider = globalState.chains.getByPrefix(chainPrefix as 'sol' | 'base' | 'eth' | 'arb' | 'poly' | 'op');
      if (provider && provider.getLeaderboard) {
        const result = await provider.getLeaderboard({
          collection,
          minFeedbacks,
          limit,
          offset,
        });
        return successResponse(result);
      }
      return successResponse({ entries: [], total: 0, hasMore: false });
    }

    // Default to current chain
    const provider = globalState.chains.getDefault();
    if (!provider || !provider.getLeaderboard) {
      return successResponse({ entries: [], total: 0, hasMore: false });
    }

    const result = await provider.getLeaderboard({
      collection,
      minFeedbacks,
      limit,
      offset,
    });

    return successResponse(result);
  },
};

// Backward compatibility aliases
export const reputationAliases: Record<string, string> = {
  sdk_get_reputation_summary: 'reputation_get',
  sdk_get_leaderboard: 'leaderboard_get',
};
