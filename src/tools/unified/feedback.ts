// Unified feedback tools

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  getArgs,
  readString,
  readNumber,
  readBoolean,
  parseBigIntInput,
  parseChainParam,
  parsePagination,
} from '../../core/parsers/common.js';
import { successResponse } from '../../core/serializers/common.js';
import { globalState } from '../../state/global-state.js';
import { parseGlobalId, isValidGlobalId, type ChainPrefix } from '../../core/interfaces/agent.js';
import type { IWritableChainProvider } from '../../core/interfaces/chain-provider.js';
import { isWritableProvider } from '../../core/interfaces/chain-provider.js';
import { encodeReputationValue } from '../../core/utils/value-encoding.js';
import { parseEvmAgentId, isChainId } from '../../core/utils/agent-id.js';
import type { EVMChainProvider } from '../../chains/evm/provider.js';

export const feedbackTools: Tool[] = [
  {
    name: 'feedback_give',
    description: 'Submit feedback for an agent (requires signer)',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Agent ID (global or chain-specific)',
        },
        value: {
          type: ['number', 'string'],
          description: 'Metric value - accepts decimal strings ("99.77") or raw integers (9977). Decimals auto-detected from string format.',
        },
        valueDecimals: {
          type: 'number',
          description: 'Decimal precision (0-6) - only needed for raw integer values. Auto-detected when using decimal strings.',
        },
        score: {
          type: 'number',
          description: 'Quality score (0-100), optional - takes priority over tag normalization',
        },
        tag1: {
          type: 'string',
          description: 'Category tag (e.g., uptime, successRate, revenues). Use oasf_list_tags to see all standardized tags.',
        },
        tag2: {
          type: 'string',
          description: 'Period tag (day, week, month, year) or x402 network tag (exact-svm, exact-evm)',
        },
        comment: {
          type: 'string',
          description: 'Optional feedback comment',
        },
        chain: {
          type: 'string',
          description: 'Chain to use (optional if using global ID)',
        },
        skipSend: {
          type: 'boolean',
          description: 'If true, returns unsigned transaction',
        },
      },
      required: ['id', 'value'],
    },
  },
  {
    name: 'feedback_read',
    description: 'Read a single feedback by agent, client, and index',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Agent ID',
        },
        client: {
          type: 'string',
          description: 'Client address who gave feedback',
        },
        index: {
          type: ['number', 'string'],
          description: 'Feedback index',
        },
        chain: {
          type: 'string',
          description: 'Chain to use',
        },
      },
      required: ['id', 'client', 'index'],
    },
  },
  {
    name: 'feedback_list',
    description: 'List all feedbacks for an agent',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Agent ID',
        },
        client: {
          type: 'string',
          description: 'Filter by client address',
        },
        minScore: {
          type: 'number',
          description: 'Minimum score filter',
        },
        maxScore: {
          type: 'number',
          description: 'Maximum score filter',
        },
        chain: {
          type: 'string',
          description: 'Chain to use',
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
      required: ['id'],
    },
  },
];

export const feedbackHandlers: Record<string, (args: unknown) => Promise<unknown>> = {
  feedback_give: async (args: unknown) => {
    const input = getArgs(args);
    const agentId = readString(input, 'id', true);
    const comment = readString(input, 'comment');
    const tag1 = readString(input, 'tag1');
    const tag2 = readString(input, 'tag2');
    const skipSend = readBoolean(input, 'skipSend') ?? false;
    const { chainPrefix } = parseChainParam(input);

    // Parse value (required) - accepts decimal strings ("99.77") or raw integers
    // Auto-encodes to { value: bigint, valueDecimals: number }
    const rawValue = input.value;
    if (rawValue === undefined || rawValue === null) {
      throw new Error('value is required');
    }
    if (typeof rawValue !== 'string' && typeof rawValue !== 'number' && typeof rawValue !== 'bigint') {
      throw new Error('value must be a number or string');
    }

    // Use encodeReputationValue for auto-encoding decimal strings
    // e.g., "99.77" → { value: 9977n, valueDecimals: 2 }
    const explicitDecimals = readNumber(input, 'valueDecimals');
    const encoded = encodeReputationValue(rawValue, explicitDecimals);
    const value = encoded.value;
    const valueDecimals = encoded.valueDecimals;

    // Parse score (optional)
    const score = readNumber(input, 'score');
    if (score !== undefined && (score < 0 || score > 100)) {
      throw new Error('score must be between 0 and 100');
    }

    // Resolve provider and normalize ID
    let provider;
    let rawId = agentId;
    const firstPart = agentId.split(':')[0] || agentId;

    if (firstPart === 'sol') {
      // Solana global ID: sol:pubkey
      const parsed = parseGlobalId(agentId);
      provider = globalState.chains.getByPrefix('sol');
      rawId = parsed.rawId;
    } else if (isChainId(firstPart) || ['eth', 'base', 'arb', 'poly', 'op'].includes(firstPart)) {
      // EVM ID: chainId:tokenId, prefix:tokenId, or prefix:chainId:tokenId
      const defaultProvider = globalState.chains.getDefault() as EVMChainProvider | null;
      const defaultChainId = defaultProvider ? parseInt(defaultProvider.chainId.split(':')[1] || '1', 10) : undefined;
      const parsed = parseEvmAgentId(agentId, { prefix: chainPrefix as ChainPrefix | undefined, chainId: defaultChainId });
      provider = globalState.chains.getByPrefix(parsed.prefix);
      rawId = parsed.sdkId; // SDK expects "chainId:tokenId" format
    } else if (chainPrefix) {
      // Raw ID with explicit chain: use chain context
      provider = globalState.chains.getByPrefix(chainPrefix as ChainPrefix);
      if (provider?.chainType === 'evm') {
        const evmProvider = provider as EVMChainProvider;
        const chainId = parseInt(evmProvider.chainId.split(':')[1] || '1', 10);
        rawId = `${chainId}:${agentId}`; // Convert raw tokenId to SDK format
      }
    } else {
      // No chain context - use default
      provider = globalState.chains.getDefault();
      if (provider?.chainType === 'evm') {
        const evmProvider = provider as EVMChainProvider;
        const chainId = parseInt(evmProvider.chainId.split(':')[1] || '1', 10);
        rawId = `${chainId}:${agentId}`; // Convert raw tokenId to SDK format
      }
    }

    if (!provider) {
      throw new Error('No chain provider available');
    }

    // For skipSend, we can use a provider that doesn't have a signer
    // Otherwise, we need a writable provider
    if (!skipSend && !isWritableProvider(provider)) {
      throw new Error('Chain provider does not support write operations or signer not configured. Use skipSend=true to get unsigned transaction.');
    }

    // Check if provider has giveFeedback method
    if (typeof provider.giveFeedback !== 'function') {
      throw new Error('Chain provider does not support feedback operations');
    }

    const result = await (provider as IWritableChainProvider).giveFeedback(
      { agentId: rawId, value, valueDecimals, score, comment, tag1, tag2 },
      { skipSend }
    );

    if (result.unsigned) {
      // Return unsigned transaction for external wallet signing
      return successResponse({
        unsigned: true,
        transaction: result.transaction,
        message: result.message,
        agentId: rawId,
        value: value.toString(),
        valueDecimals,
        score,
        tag1,
        tag2,
        comment,
        hint: 'Decode base64, sign with your wallet (Phantom, etc.), and broadcast to the network.',
      });
    }

    // Return signed result
    return successResponse({
      unsigned: false,
      signature: result.signature,
      agentId: rawId,
      value: value.toString(),
      valueDecimals,
      score,
      tag1,
      tag2,
      comment,
    });
  },

  feedback_read: async (args: unknown) => {
    const input = getArgs(args);
    const agentId = readString(input, 'id', true);
    const client = readString(input, 'client', true);
    const index = parseBigIntInput(input.index, 'index');
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

    const feedback = await provider.getFeedback(rawId, client, index);
    if (!feedback) {
      throw new Error(`Feedback not found: agent=${rawId}, client=${client}, index=${index}`);
    }

    return successResponse(feedback);
  },

  feedback_list: async (args: unknown) => {
    const input = getArgs(args);
    const agentId = readString(input, 'id', true);
    const client = readString(input, 'client');
    const minScore = readNumber(input, 'minScore');
    const maxScore = readNumber(input, 'maxScore');
    const { chainPrefix } = parseChainParam(input);
    const { limit, offset } = parsePagination(input);

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
      return successResponse({ feedbacks: [], total: 0, hasMore: false });
    }

    const result = await provider.listFeedbacks({
      agentId: rawId,
      client,
      minScore,
      maxScore,
      limit,
      offset,
    });

    return successResponse(result);
  },
};

// Backward compatibility aliases
export const feedbackAliases: Record<string, string> = {
  sdk_give_feedback: 'feedback_give',
  sdk_read_feedback: 'feedback_read',
  sdk_read_all_feedback: 'feedback_list',
};
