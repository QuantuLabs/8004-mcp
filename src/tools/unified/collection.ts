// Unified collection tools

import { PublicKey } from '@solana/web3.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  getArgs,
  readString,
  parseChainParam,
  parsePagination,
} from '../../core/parsers/common.js';
import { successResponse } from '../../core/serializers/common.js';
import { globalState } from '../../state/global-state.js';
import type { SolanaChainProvider } from '../../chains/solana/provider.js';

export const collectionTools: Tool[] = [
  {
    name: 'collection_get',
    description: 'Get collection details by ID',
    inputSchema: {
      type: 'object',
      properties: {
        collection: {
          type: 'string',
          description: 'Collection ID/address',
        },
        chain: {
          type: 'string',
          description: 'Chain to query',
        },
      },
      required: ['collection'],
    },
  },
  {
    name: 'collection_list',
    description: 'List all collections',
    inputSchema: {
      type: 'object',
      properties: {
        chain: {
          type: 'string',
          description: 'Chain to query',
        },
        limit: {
          type: 'number',
          description: 'Max results',
        },
        offset: {
          type: 'number',
          description: 'Pagination offset',
        },
      },
    },
  },
  {
    name: 'collection_agents',
    description: 'List agents in a collection',
    inputSchema: {
      type: 'object',
      properties: {
        collection: {
          type: 'string',
          description: 'Collection ID/address',
        },
        chain: {
          type: 'string',
          description: 'Chain to query',
        },
        limit: {
          type: 'number',
          description: 'Max results',
        },
        offset: {
          type: 'number',
          description: 'Pagination offset',
        },
      },
      required: ['collection'],
    },
  },
  {
    name: 'collection_base_get',
    description: 'Get the base/default collection for the registry',
    inputSchema: {
      type: 'object',
      properties: {
        chain: {
          type: 'string',
          description: 'Chain to query',
        },
      },
    },
  },
];

export const collectionHandlers: Record<string, (args: unknown) => Promise<unknown>> = {
  collection_get: async (args: unknown) => {
    const input = getArgs(args);
    const collection = readString(input, 'collection', true);
    const { chainPrefix } = parseChainParam(input);

    // Currently Solana-only
    const provider = chainPrefix
      ? globalState.chains.getByPrefix(chainPrefix as 'sol')
      : globalState.chains.getDefault();

    if (!provider || provider.chainType !== 'solana') {
      throw new Error('Collection queries are currently only supported on Solana');
    }

    const sdk = (provider as SolanaChainProvider).getState().getSdk();
    const pubkey = new PublicKey(collection);
    const result = await sdk.getCollection(pubkey);

    return successResponse(result);
  },

  collection_list: async (args: unknown) => {
    const input = getArgs(args);
    const { chainPrefix } = parseChainParam(input);
    const { limit, offset } = parsePagination(input);

    const provider = chainPrefix
      ? globalState.chains.getByPrefix(chainPrefix as 'sol')
      : globalState.chains.getDefault();

    if (!provider || provider.chainType !== 'solana') {
      throw new Error('Collection queries are currently only supported on Solana');
    }

    const sdk = (provider as SolanaChainProvider).getState().getSdk();
    const collections = await sdk.getCollections();

    // Apply pagination
    const paginated = collections.slice(offset, offset + limit);

    return successResponse({
      collections: paginated,
      total: collections.length,
      hasMore: offset + paginated.length < collections.length,
      offset,
      limit,
    });
  },

  collection_agents: async (args: unknown) => {
    const input = getArgs(args);
    const collection = readString(input, 'collection', true);
    const { chainPrefix } = parseChainParam(input);
    const { limit, offset } = parsePagination(input);

    const provider = chainPrefix
      ? globalState.chains.getByPrefix(chainPrefix as 'sol')
      : globalState.chains.getDefault();

    if (!provider) {
      return successResponse({ results: [], total: 0, hasMore: false, offset, limit });
    }

    const result = await provider.searchAgents({ collection, limit, offset });

    return successResponse(result);
  },

  collection_base_get: async (args: unknown) => {
    const input = getArgs(args);
    const { chainPrefix } = parseChainParam(input);

    const provider = chainPrefix
      ? globalState.chains.getByPrefix(chainPrefix as 'sol')
      : globalState.chains.getDefault();

    if (!provider || provider.chainType !== 'solana') {
      throw new Error('Base collection query is currently only supported on Solana');
    }

    const sdk = (provider as SolanaChainProvider).getState().getSdk();
    const baseCollection = await sdk.getBaseCollection();

    return successResponse({
      collection: baseCollection?.toBase58() ?? null,
    });
  },
};

// Backward compatibility aliases
export const collectionAliases: Record<string, string> = {
  sdk_get_collection: 'collection_get',
  sdk_get_collections: 'collection_list',
  sdk_get_collection_agents: 'collection_agents',
  sdk_get_base_collection: 'collection_base_get',
};
