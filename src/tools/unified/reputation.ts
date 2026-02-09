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
import { parseGlobalId, type ChainPrefix } from '../../core/interfaces/agent.js';
import { parseEvmAgentId, isChainId, VALID_EVM_PREFIXES } from '../../core/utils/agent-id.js';
import type { EVMChainProvider } from '../../chains/evm/provider.js';

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

    // Resolve provider and normalize ID
    let provider;
    let rawId = agentId;
    const firstPart = agentId.split(':')[0] || agentId;

    if (firstPart === 'sol') {
      // Solana global ID
      const parsed = parseGlobalId(agentId);
      provider = globalState.chains.getByPrefix('sol');
      rawId = parsed.rawId;
    } else if (isChainId(firstPart) || VALID_EVM_PREFIXES.includes(firstPart as any)) {
      // EVM ID in any format
      const defaultProvider = globalState.chains.getDefault() as EVMChainProvider | null;
      const defaultChainId = defaultProvider ? parseInt(defaultProvider.chainId.split(':')[1] || '1', 10) : undefined;
      const parsed = parseEvmAgentId(agentId, { prefix: chainPrefix as ChainPrefix | undefined, chainId: defaultChainId });
      provider = globalState.chains.getByPrefix(parsed.prefix);
      rawId = parsed.sdkId;
    } else if (chainPrefix) {
      provider = globalState.chains.getByPrefix(chainPrefix as ChainPrefix);
      if (provider?.chainType === 'evm') {
        const evmProvider = provider as EVMChainProvider;
        const chainId = parseInt(evmProvider.chainId.split(':')[1] || '1', 10);
        rawId = `${chainId}:${agentId}`;
      }
    } else {
      provider = globalState.chains.getDefault();
      if (provider?.chainType === 'evm') {
        const evmProvider = provider as EVMChainProvider;
        const chainId = parseInt(evmProvider.chainId.split(':')[1] || '1', 10);
        rawId = `${chainId}:${agentId}`;
      }
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
      const provider = globalState.chains.getByPrefix(chainPrefix as ChainPrefix);
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
