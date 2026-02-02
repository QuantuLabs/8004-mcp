// Agent registration tools (create agents on-chain)

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  getArgs,
  readString,
  readBoolean,
  parseChainParam,
} from '../../core/parsers/common.js';
import { successResponse } from '../../core/serializers/common.js';
import { globalState } from '../../state/global-state.js';
import type { SolanaChainProvider } from '../../chains/solana/provider.js';
import type { EVMChainProvider } from '../../chains/evm/provider.js';
import { PublicKey } from '@solana/web3.js';

export const registrationTools: Tool[] = [
  {
    name: 'agent_register',
    description: 'Register a new agent on-chain. For Solana, requires tokenUri (IPFS). For EVM, can use IPFS or HTTP URI.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Agent name (required for EVM, optional for Solana if in tokenUri)',
        },
        description: {
          type: 'string',
          description: 'Agent description (EVM only)',
        },
        image: {
          type: 'string',
          description: 'Agent image URI (EVM only)',
        },
        tokenUri: {
          type: 'string',
          description: 'Token/Agent URI (IPFS or HTTP). Required for Solana, optional for EVM (will upload to IPFS if not provided)',
        },
        collection: {
          type: 'string',
          description: 'Collection address/pubkey (Solana only, uses base registry if not provided)',
        },
        mcpEndpoint: {
          type: 'string',
          description: 'MCP server endpoint URL (EVM only)',
        },
        a2aEndpoint: {
          type: 'string',
          description: 'A2A agent card URL (EVM only)',
        },
        chain: {
          type: 'string',
          description: 'Chain to register on (sol, eth, base, etc.). Default: current chain',
        },
        skipSend: {
          type: 'boolean',
          description: 'If true, returns unsigned transaction instead of sending',
        },
      },
    },
  },
  {
    name: 'collection_create',
    description: 'Create a new agent collection (Solana only). Collections group related agents.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Collection name',
        },
        uri: {
          type: 'string',
          description: 'Collection metadata URI (IPFS or HTTP)',
        },
        skipSend: {
          type: 'boolean',
          description: 'If true, returns unsigned transaction',
        },
      },
      required: ['name', 'uri'],
    },
  },
];

export const registrationHandlers: Record<string, (args: unknown) => Promise<unknown>> = {
  agent_register: async (args: unknown) => {
    const input = getArgs(args);
    const name = readString(input, 'name');
    const description = readString(input, 'description');
    const image = readString(input, 'image');
    const tokenUri = readString(input, 'tokenUri');
    const collection = readString(input, 'collection');
    const mcpEndpoint = readString(input, 'mcpEndpoint');
    const a2aEndpoint = readString(input, 'a2aEndpoint');
    const { chainPrefix } = parseChainParam(input);
    const skipSend = readBoolean(input, 'skipSend') ?? false;

    // Determine which chain to use
    const targetChain = chainPrefix || globalState.chains.getDefault()?.chainPrefix || 'sol';

    if (targetChain === 'sol') {
      return registerSolanaAgent({ tokenUri, collection, skipSend });
    } else {
      if (skipSend) {
        throw new Error('skipSend is not supported for EVM registration. Transactions are always sent.');
      }
      return registerEvmAgent({
        name,
        description,
        image,
        tokenUri,
        mcpEndpoint,
        a2aEndpoint,
        chainPrefix: targetChain,
      });
    }
  },

  collection_create: async (args: unknown) => {
    const input = getArgs(args);
    const name = readString(input, 'name', true);
    const uri = readString(input, 'uri', true);
    const skipSend = readBoolean(input, 'skipSend') ?? false;

    const provider = globalState.chains.getByPrefix('sol') as SolanaChainProvider | null;
    if (!provider) {
      throw new Error('Solana provider not available');
    }

    if (!skipSend && !provider.canWrite()) {
      throw new Error('Write operations require an unlocked wallet. Use wallet_create or wallet_unlock first.');
    }

    const sdk = provider.getState().getSdk();
    const result = await sdk.createCollection(name, uri, { skipSend });

    if (skipSend && 'transaction' in result) {
      return successResponse({
        unsigned: true,
        transaction: String(result.transaction),
        collection: result.collection?.toBase58(),
        message: 'Sign this transaction to create your collection.',
      });
    }

    return successResponse({
      unsigned: false,
      signature: 'signature' in result ? result.signature : undefined,
      collection: result.collection?.toBase58(),
      message: `Collection "${name}" created successfully.`,
    });
  },
};

// Solana agent registration
async function registerSolanaAgent(params: {
  tokenUri?: string;
  collection?: string;
  skipSend: boolean;
}): Promise<unknown> {
  const { tokenUri, collection, skipSend } = params;

  if (!tokenUri) {
    throw new Error('tokenUri is required for Solana agent registration. Upload metadata to IPFS first using ipfs_add_registration.');
  }

  const provider = globalState.chains.getByPrefix('sol') as SolanaChainProvider | null;
  if (!provider) {
    throw new Error('Solana provider not available');
  }

  if (!skipSend && !provider.canWrite()) {
    throw new Error('Write operations require an unlocked wallet. Use wallet_create or wallet_unlock first.');
  }

  const sdk = provider.getState().getSdk();

  // Parse collection if provided
  const collectionPubkey = collection ? new PublicKey(collection) : undefined;

  const result = await sdk.registerAgent(tokenUri, collectionPubkey, { skipSend });

  if (skipSend && 'transaction' in result) {
    return successResponse({
      unsigned: true,
      transaction: String(result.transaction),
      agentId: result.asset?.toBase58(),
      message: 'Sign this transaction to register your agent.',
    });
  }

  return successResponse({
    unsigned: false,
    signature: 'signature' in result ? result.signature : undefined,
    agentId: result.asset?.toBase58(),
    globalId: result.asset ? `sol:${result.asset.toBase58()}` : undefined,
    message: 'Agent registered successfully on Solana.',
    explorer: result.asset
      ? `https://explorer.solana.com/address/${result.asset.toBase58()}?cluster=devnet`
      : undefined,
  });
}

// EVM agent registration
// Note: EVM registration doesn't support skipSend - transactions are always sent
async function registerEvmAgent(params: {
  name?: string;
  description?: string;
  image?: string;
  tokenUri?: string;
  mcpEndpoint?: string;
  a2aEndpoint?: string;
  chainPrefix: string;
}): Promise<unknown> {
  const { name, description, image, tokenUri, mcpEndpoint, a2aEndpoint, chainPrefix } = params;

  const provider = globalState.chains.getByPrefix(chainPrefix as 'eth' | 'base' | 'arb' | 'poly' | 'op') as EVMChainProvider | null;
  if (!provider) {
    throw new Error(`EVM provider not available for chain: ${chainPrefix}`);
  }

  if (!provider.canWrite()) {
    throw new Error('Write operations require an unlocked wallet. Use wallet_create or wallet_unlock first.');
  }

  const sdk = provider.getSdk();

  // Create agent object
  const agentName = name || 'Unnamed Agent';
  const agentDescription = description || '';
  const agent = sdk.createAgent(agentName, agentDescription, image);

  // Set endpoints if provided
  if (mcpEndpoint) {
    await agent.setMCP(mcpEndpoint);
  }
  if (a2aEndpoint) {
    await agent.setA2A(a2aEndpoint);
  }

  // Register on-chain and wait for confirmation
  let txHandle;
  if (tokenUri) {
    // Use provided URI (HTTP or IPFS)
    txHandle = await agent.registerHTTP(tokenUri);
  } else {
    // Upload to IPFS and register
    txHandle = await agent.registerIPFS();
  }

  // Wait for transaction to be mined (returns { receipt, result })
  const { receipt, result: registrationFile } = await txHandle.waitMined();

  // agentId is now set on the agent object after confirmation
  const agentId = agent.agentId;
  const chainId = await sdk.chainId();

  return successResponse({
    unsigned: false,
    txHash: receipt.transactionHash,
    agentId,
    globalId: agentId ? `${chainPrefix}:${chainId}:${agentId}` : undefined,
    name: agentName,
    tokenUri: agent.agentURI,
    message: `Agent registered successfully on ${chainPrefix}.`,
    registrationFile,
  });
}

// Backward compatibility aliases
export const registrationAliases: Record<string, string> = {
  sdk_register_agent: 'agent_register',
  sdk_create_collection: 'collection_create',
};
