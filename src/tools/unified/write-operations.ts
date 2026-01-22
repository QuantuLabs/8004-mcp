// Additional write operation tools (transfer, revoke, update, etc.)

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { PublicKey } from '@solana/web3.js';
import {
  getArgs,
  readString,
  readNumber,
  readBoolean,
  parseChainParam,
  parseBuffer,
} from '../../core/parsers/common.js';
import { successResponse } from '../../core/serializers/common.js';
import { globalState } from '../../state/global-state.js';
import type { SolanaChainProvider } from '../../chains/solana/provider.js';
import type { EVMChainProvider } from '../../chains/evm/provider.js';
import { parseGlobalId, isValidGlobalId } from '../../core/interfaces/agent.js';

export const writeOperationTools: Tool[] = [
  // Agent Transfer
  {
    name: 'agent_transfer',
    description: 'Transfer agent ownership to a new address',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Agent ID (global format or chain-specific)',
        },
        newOwner: {
          type: 'string',
          description: 'New owner address (PublicKey for Solana, 0x address for EVM)',
        },
        collection: {
          type: 'string',
          description: 'Collection address (Solana only, required)',
        },
        chain: {
          type: 'string',
          description: 'Chain prefix (sol, eth, base)',
        },
        skipSend: {
          type: 'boolean',
          description: 'If true, returns unsigned transaction (Solana only)',
        },
      },
      required: ['id', 'newOwner'],
    },
  },

  // Agent URI Update
  {
    name: 'agent_uri_update',
    description: 'Update agent metadata URI',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Agent ID',
        },
        newUri: {
          type: 'string',
          description: 'New metadata URI (IPFS or HTTP)',
        },
        collection: {
          type: 'string',
          description: 'Collection address (Solana only)',
        },
        chain: {
          type: 'string',
          description: 'Chain prefix',
        },
        skipSend: {
          type: 'boolean',
          description: 'If true, returns unsigned transaction (Solana only)',
        },
      },
      required: ['id', 'newUri'],
    },
  },

  // Collection URI Update (Solana only)
  {
    name: 'collection_uri_update',
    description: 'Update collection metadata URI (Solana only)',
    inputSchema: {
      type: 'object',
      properties: {
        collection: {
          type: 'string',
          description: 'Collection address (PublicKey)',
        },
        newUri: {
          type: 'string',
          description: 'New metadata URI',
        },
        skipSend: {
          type: 'boolean',
          description: 'If true, returns unsigned transaction',
        },
      },
      required: ['collection', 'newUri'],
    },
  },

  // Agent Metadata Set (Solana only)
  {
    name: 'agent_metadata_set',
    description: 'Set on-chain metadata key-value pair for an agent (Solana only)',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Agent ID (PublicKey)',
        },
        key: {
          type: 'string',
          description: 'Metadata key',
        },
        value: {
          type: 'string',
          description: 'Metadata value',
        },
        immutable: {
          type: 'boolean',
          description: 'If true, this key cannot be changed later',
        },
        skipSend: {
          type: 'boolean',
          description: 'If true, returns unsigned transaction',
        },
      },
      required: ['id', 'key', 'value'],
    },
  },

  // Feedback Revoke
  {
    name: 'feedback_revoke',
    description: 'Revoke a previously given feedback',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Agent ID',
        },
        feedbackIndex: {
          type: 'number',
          description: 'Index of the feedback to revoke',
        },
        chain: {
          type: 'string',
          description: 'Chain prefix',
        },
        skipSend: {
          type: 'boolean',
          description: 'If true, returns unsigned transaction (Solana only)',
        },
      },
      required: ['id', 'feedbackIndex'],
    },
  },

  // Feedback Response Append
  {
    name: 'feedback_response_append',
    description: 'Append a response to an existing feedback (as agent owner)',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Agent ID',
        },
        client: {
          type: 'string',
          description: 'Client address who gave the feedback',
        },
        feedbackIndex: {
          type: 'number',
          description: 'Index of the feedback',
        },
        responseUri: {
          type: 'string',
          description: 'Response URI (IPFS or HTTP)',
        },
        responseHash: {
          type: 'string',
          description: 'Response hash (optional, base64 or hex)',
        },
        chain: {
          type: 'string',
          description: 'Chain prefix',
        },
        skipSend: {
          type: 'boolean',
          description: 'If true, returns unsigned transaction (Solana only)',
        },
      },
      required: ['id', 'client', 'feedbackIndex', 'responseUri'],
    },
  },

  // EVM Agent Wallet Set
  {
    name: 'evm_agent_wallet_set',
    description: 'Set operational wallet for an EVM agent (EIP-712 signature)',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Agent ID (tokenId or chainId:tokenId)',
        },
        newWallet: {
          type: 'string',
          description: 'New wallet address (0x...)',
        },
        chain: {
          type: 'string',
          description: 'Chain prefix (eth, base, etc.)',
        },
      },
      required: ['id', 'newWallet'],
    },
  },

  // EVM Agent Wallet Unset
  {
    name: 'evm_agent_wallet_unset',
    description: 'Remove operational wallet from an EVM agent',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Agent ID',
        },
        chain: {
          type: 'string',
          description: 'Chain prefix',
        },
      },
      required: ['id'],
    },
  },
];

export const writeOperationHandlers: Record<string, (args: unknown) => Promise<unknown>> = {
  // Agent Transfer
  agent_transfer: async (args: unknown) => {
    const input = getArgs(args);
    const id = readString(input, 'id', true);
    const newOwner = readString(input, 'newOwner', true);
    const collection = readString(input, 'collection');
    const { chainPrefix } = parseChainParam(input);
    const skipSend = readBoolean(input, 'skipSend') ?? false;

    // Determine chain
    let targetChain = chainPrefix;
    let rawId = id;
    if (isValidGlobalId(id)) {
      const parsed = parseGlobalId(id);
      targetChain = parsed.prefix;
      rawId = parsed.rawId;
    }
    targetChain = targetChain || globalState.chains.getDefault()?.chainPrefix || 'sol';

    if (targetChain === 'sol') {
      const provider = globalState.chains.getByPrefix('sol') as SolanaChainProvider | null;
      if (!provider) throw new Error('Solana provider not available');
      if (!skipSend && !provider.canWrite()) {
        throw new Error('Write operations require an unlocked wallet');
      }
      if (!collection) {
        throw new Error('collection is required for Solana agent transfer');
      }

      const sdk = provider.getState().getSdk();
      const assetPubkey = new PublicKey(rawId);
      const collectionPubkey = new PublicKey(collection);
      const newOwnerPubkey = new PublicKey(newOwner);

      const result = await sdk.transferAgent(assetPubkey, collectionPubkey, newOwnerPubkey, { skipSend });

      if (skipSend && 'transaction' in result) {
        return successResponse({
          unsigned: true,
          transaction: String(result.transaction),
          message: 'Sign this transaction to transfer the agent.',
        });
      }

      return successResponse({
        unsigned: false,
        signature: 'signature' in result ? result.signature : undefined,
        message: `Agent transferred to ${newOwner}`,
      });
    } else {
      // EVM
      const provider = globalState.chains.getByPrefix(targetChain as 'eth' | 'base') as EVMChainProvider | null;
      if (!provider) throw new Error(`EVM provider not available for chain: ${targetChain}`);
      if (!provider.canWrite()) {
        throw new Error('Write operations require an unlocked wallet');
      }

      const sdk = provider.getSdk();
      const result = await sdk.transferAgent(rawId, newOwner as `0x${string}`);

      return successResponse({
        unsigned: false,
        txHash: result.txHash,
        from: result.from,
        to: result.to,
        message: `Agent transferred to ${newOwner}`,
      });
    }
  },

  // Agent URI Update
  agent_uri_update: async (args: unknown) => {
    const input = getArgs(args);
    const id = readString(input, 'id', true);
    const newUri = readString(input, 'newUri', true);
    const collection = readString(input, 'collection');
    const { chainPrefix } = parseChainParam(input);
    const skipSend = readBoolean(input, 'skipSend') ?? false;

    let targetChain = chainPrefix;
    let rawId = id;
    if (isValidGlobalId(id)) {
      const parsed = parseGlobalId(id);
      targetChain = parsed.prefix;
      rawId = parsed.rawId;
    }
    targetChain = targetChain || globalState.chains.getDefault()?.chainPrefix || 'sol';

    if (targetChain === 'sol') {
      const provider = globalState.chains.getByPrefix('sol') as SolanaChainProvider | null;
      if (!provider) throw new Error('Solana provider not available');
      if (!skipSend && !provider.canWrite()) {
        throw new Error('Write operations require an unlocked wallet');
      }
      if (!collection) {
        throw new Error('collection is required for Solana agent URI update');
      }

      const sdk = provider.getState().getSdk();
      const assetPubkey = new PublicKey(rawId);
      const collectionPubkey = new PublicKey(collection);

      const result = await sdk.setAgentUri(assetPubkey, collectionPubkey, newUri, { skipSend });

      if (skipSend && 'transaction' in result) {
        return successResponse({
          unsigned: true,
          transaction: String(result.transaction),
          message: 'Sign this transaction to update the agent URI.',
        });
      }

      return successResponse({
        unsigned: false,
        signature: 'signature' in result ? result.signature : undefined,
        message: `Agent URI updated to ${newUri}`,
      });
    } else {
      // EVM - need to load agent and call setAgentURI
      const provider = globalState.chains.getByPrefix(targetChain as 'eth' | 'base') as EVMChainProvider | null;
      if (!provider) throw new Error(`EVM provider not available for chain: ${targetChain}`);
      if (!provider.canWrite()) {
        throw new Error('Write operations require an unlocked wallet');
      }

      const sdk = provider.getSdk();
      const agent = await sdk.loadAgent(rawId);
      await agent.setAgentURI(newUri);

      return successResponse({
        unsigned: false,
        message: `Agent URI updated to ${newUri}`,
      });
    }
  },

  // Collection URI Update (Solana only)
  collection_uri_update: async (args: unknown) => {
    const input = getArgs(args);
    const collection = readString(input, 'collection', true);
    const newUri = readString(input, 'newUri', true);
    const skipSend = readBoolean(input, 'skipSend') ?? false;

    const provider = globalState.chains.getByPrefix('sol') as SolanaChainProvider | null;
    if (!provider) throw new Error('Solana provider not available');
    if (!skipSend && !provider.canWrite()) {
      throw new Error('Write operations require an unlocked wallet');
    }

    const sdk = provider.getState().getSdk();
    const collectionPubkey = new PublicKey(collection);

    const result = await sdk.updateCollectionUri(collectionPubkey, newUri, { skipSend });

    if (skipSend && 'transaction' in result) {
      return successResponse({
        unsigned: true,
        transaction: String(result.transaction),
        message: 'Sign this transaction to update the collection URI.',
      });
    }

    return successResponse({
      unsigned: false,
      signature: 'signature' in result ? result.signature : undefined,
      message: `Collection URI updated to ${newUri}`,
    });
  },

  // Agent Metadata Set (Solana only)
  agent_metadata_set: async (args: unknown) => {
    const input = getArgs(args);
    const id = readString(input, 'id', true);
    const key = readString(input, 'key', true);
    const value = readString(input, 'value', true);
    const immutable = readBoolean(input, 'immutable') ?? false;
    const skipSend = readBoolean(input, 'skipSend') ?? false;

    const provider = globalState.chains.getByPrefix('sol') as SolanaChainProvider | null;
    if (!provider) throw new Error('Solana provider not available');
    if (!skipSend && !provider.canWrite()) {
      throw new Error('Write operations require an unlocked wallet');
    }

    const sdk = provider.getState().getSdk();
    const assetPubkey = new PublicKey(id);

    const result = await sdk.setMetadata(assetPubkey, key, value, immutable, { skipSend });

    if (skipSend && 'transaction' in result) {
      return successResponse({
        unsigned: true,
        transaction: String(result.transaction),
        message: 'Sign this transaction to set metadata.',
      });
    }

    return successResponse({
      unsigned: false,
      signature: 'signature' in result ? result.signature : undefined,
      message: `Metadata set: ${key}=${value}${immutable ? ' (immutable)' : ''}`,
    });
  },

  // Feedback Revoke
  feedback_revoke: async (args: unknown) => {
    const input = getArgs(args);
    const id = readString(input, 'id', true);
    const feedbackIndex = readNumber(input, 'feedbackIndex', true);
    const { chainPrefix } = parseChainParam(input);
    const skipSend = readBoolean(input, 'skipSend') ?? false;

    let targetChain = chainPrefix;
    let rawId = id;
    if (isValidGlobalId(id)) {
      const parsed = parseGlobalId(id);
      targetChain = parsed.prefix;
      rawId = parsed.rawId;
    }
    targetChain = targetChain || globalState.chains.getDefault()?.chainPrefix || 'sol';

    if (targetChain === 'sol') {
      const provider = globalState.chains.getByPrefix('sol') as SolanaChainProvider | null;
      if (!provider) throw new Error('Solana provider not available');
      if (!skipSend && !provider.canWrite()) {
        throw new Error('Write operations require an unlocked wallet');
      }

      const sdk = provider.getState().getSdk();
      const assetPubkey = new PublicKey(rawId);

      const result = await sdk.revokeFeedback(assetPubkey, feedbackIndex, { skipSend });

      if (skipSend && 'transaction' in result) {
        return successResponse({
          unsigned: true,
          transaction: String(result.transaction),
          message: 'Sign this transaction to revoke feedback.',
        });
      }

      return successResponse({
        unsigned: false,
        signature: 'signature' in result ? result.signature : undefined,
        message: `Feedback #${feedbackIndex} revoked`,
      });
    } else {
      // EVM
      const provider = globalState.chains.getByPrefix(targetChain as 'eth' | 'base') as EVMChainProvider | null;
      if (!provider) throw new Error(`EVM provider not available for chain: ${targetChain}`);
      if (!provider.canWrite()) {
        throw new Error('Write operations require an unlocked wallet');
      }

      const sdk = provider.getSdk();
      const txHash = await sdk.revokeFeedback(rawId, feedbackIndex);

      return successResponse({
        unsigned: false,
        txHash,
        message: `Feedback #${feedbackIndex} revoked`,
      });
    }
  },

  // Feedback Response Append
  feedback_response_append: async (args: unknown) => {
    const input = getArgs(args);
    const id = readString(input, 'id', true);
    const client = readString(input, 'client', true);
    const feedbackIndex = readNumber(input, 'feedbackIndex', true);
    const responseUri = readString(input, 'responseUri', true);
    const responseHashStr = readString(input, 'responseHash');
    const { chainPrefix } = parseChainParam(input);
    const skipSend = readBoolean(input, 'skipSend') ?? false;

    let targetChain = chainPrefix;
    let rawId = id;
    if (isValidGlobalId(id)) {
      const parsed = parseGlobalId(id);
      targetChain = parsed.prefix;
      rawId = parsed.rawId;
    }
    targetChain = targetChain || globalState.chains.getDefault()?.chainPrefix || 'sol';

    if (targetChain === 'sol') {
      const provider = globalState.chains.getByPrefix('sol') as SolanaChainProvider | null;
      if (!provider) throw new Error('Solana provider not available');
      if (!skipSend && !provider.canWrite()) {
        throw new Error('Write operations require an unlocked wallet');
      }

      const sdk = provider.getState().getSdk();
      const assetPubkey = new PublicKey(rawId);
      const clientPubkey = new PublicKey(client);
      const responseHash = responseHashStr ? parseBuffer(responseHashStr, 'responseHash') : undefined;

      const result = await sdk.appendResponse(
        assetPubkey,
        clientPubkey,
        feedbackIndex,
        responseUri,
        responseHash,
        { skipSend }
      );

      if (skipSend && 'transaction' in result) {
        return successResponse({
          unsigned: true,
          transaction: String(result.transaction),
          message: 'Sign this transaction to append response.',
        });
      }

      return successResponse({
        unsigned: false,
        signature: 'signature' in result ? result.signature : undefined,
        message: `Response appended to feedback #${feedbackIndex}`,
      });
    } else {
      // EVM
      const provider = globalState.chains.getByPrefix(targetChain as 'eth' | 'base') as EVMChainProvider | null;
      if (!provider) throw new Error(`EVM provider not available for chain: ${targetChain}`);
      if (!provider.canWrite()) {
        throw new Error('Write operations require an unlocked wallet');
      }

      const sdk = provider.getSdk();
      const txHash = await sdk.appendResponse(
        rawId,
        client as `0x${string}`,
        feedbackIndex,
        { uri: responseUri, hash: responseHashStr || '' }
      );

      return successResponse({
        unsigned: false,
        txHash,
        message: `Response appended to feedback #${feedbackIndex}`,
      });
    }
  },

  // EVM Agent Wallet Set
  evm_agent_wallet_set: async (args: unknown) => {
    const input = getArgs(args);
    const id = readString(input, 'id', true);
    const newWallet = readString(input, 'newWallet', true);
    const { chainPrefix } = parseChainParam(input);

    const targetChain = chainPrefix || 'eth';
    const provider = globalState.chains.getByPrefix(targetChain as 'eth' | 'base') as EVMChainProvider | null;
    if (!provider) throw new Error(`EVM provider not available for chain: ${targetChain}`);
    if (!provider.canWrite()) {
      throw new Error('Write operations require an unlocked wallet');
    }

    const sdk = provider.getSdk();
    const agent = await sdk.loadAgent(id);
    const txHash = await agent.setWallet(newWallet as `0x${string}`);

    return successResponse({
      unsigned: false,
      txHash,
      message: `Agent wallet set to ${newWallet}`,
    });
  },

  // EVM Agent Wallet Unset
  evm_agent_wallet_unset: async (args: unknown) => {
    const input = getArgs(args);
    const id = readString(input, 'id', true);
    const { chainPrefix } = parseChainParam(input);

    const targetChain = chainPrefix || 'eth';
    const provider = globalState.chains.getByPrefix(targetChain as 'eth' | 'base') as EVMChainProvider | null;
    if (!provider) throw new Error(`EVM provider not available for chain: ${targetChain}`);
    if (!provider.canWrite()) {
      throw new Error('Write operations require an unlocked wallet');
    }

    const sdk = provider.getSdk();
    const agent = await sdk.loadAgent(id);
    const txHash = await agent.unsetWallet();

    return successResponse({
      unsigned: false,
      txHash,
      message: 'Agent wallet unset',
    });
  },
};

// Backward compatibility aliases
export const writeOperationAliases: Record<string, string> = {
  sdk_transfer_agent: 'agent_transfer',
  sdk_set_agent_uri: 'agent_uri_update',
  sdk_update_collection_uri: 'collection_uri_update',
  sdk_set_metadata: 'agent_metadata_set',
  sdk_revoke_feedback: 'feedback_revoke',
  sdk_append_response: 'feedback_response_append',
};
