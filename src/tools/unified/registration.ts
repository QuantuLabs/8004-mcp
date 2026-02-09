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
import type { ChainPrefix } from '../../core/interfaces/agent.js';
import type { SolanaChainProvider } from '../../chains/solana/provider.js';
import type { EVMChainProvider } from '../../chains/evm/provider.js';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { ACCOUNT_SIZES, calculateRentExempt } from '8004-solana';
import { createPublicClient, http, formatEther } from 'viem';
import { extractTokenId } from '../../core/utils/agent-id.js';

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
        estimateCost: {
          type: 'boolean',
          description: 'If true, returns cost estimation without executing. Includes rent, gas, and total in native token.',
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
    const estimateCost = readBoolean(input, 'estimateCost') ?? false;

    // Determine which chain to use
    const targetChain = chainPrefix || globalState.chains.getDefault()?.chainPrefix || 'sol';

    // Cost estimation mode
    if (estimateCost) {
      if (targetChain === 'sol') {
        return estimateSolanaCost();
      } else {
        return estimateEvmCost(targetChain);
      }
    }

    if (targetChain === 'sol') {
      return registerSolanaAgent({ name, description, image, tokenUri, collection, mcpEndpoint, a2aEndpoint, skipSend });
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

// Build ERC-8004 Registration v1 compliant file
function buildRegistrationV1(params: {
  name: string;
  description: string;
  image?: string;
  mcpEndpoint?: string;
  a2aEndpoint?: string;
}): Record<string, unknown> {
  const { name, description, image, mcpEndpoint, a2aEndpoint } = params;

  // Build services array
  const services: Array<Record<string, unknown>> = [];
  if (mcpEndpoint) {
    services.push({ name: 'MCP', endpoint: mcpEndpoint });
  }
  if (a2aEndpoint) {
    services.push({ name: 'A2A', endpoint: a2aEndpoint });
  }

  const registration: Record<string, unknown> = {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name,
    description,
    services,
    supportedTrust: ['reputation'],
    active: true,
    x402Support: false,
  };

  if (image) {
    registration.image = image;
  }

  return registration;
}

// Solana agent registration
async function registerSolanaAgent(params: {
  name?: string;
  description?: string;
  image?: string;
  tokenUri?: string;
  collection?: string;
  mcpEndpoint?: string;
  a2aEndpoint?: string;
  skipSend: boolean;
}): Promise<unknown> {
  const { name, description, image, tokenUri, collection, mcpEndpoint, a2aEndpoint, skipSend } = params;

  let finalTokenUri = tokenUri;

  // Auto-upload to IPFS if no tokenUri provided
  if (!tokenUri) {
    if (!globalState.ipfs.isConfigured()) {
      throw new Error(
        'No tokenUri provided and IPFS not configured. Either:\n' +
        '1. Provide tokenUri with your hosted metadata (HTTP or IPFS)\n' +
        '2. Configure IPFS with ipfs_configure first for automatic upload'
      );
    }

    // Build ERC-8004 Registration v1 file (same structure for Solana and EVM)
    const registration = buildRegistrationV1({
      name: name || 'Unnamed Agent',
      description: description || '',
      image,
      mcpEndpoint,
      a2aEndpoint,
    });

    // Upload to IPFS
    const cid = await globalState.ipfs.addJson(registration);
    finalTokenUri = `ipfs://${cid}`;
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

  const result = await sdk.registerAgent(finalTokenUri, collectionPubkey, { skipSend });

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

  const provider = globalState.chains.getByPrefix(chainPrefix as ChainPrefix) as EVMChainProvider | null;
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

  // Determine final tokenUri
  let finalTokenUri = tokenUri;

  // Auto-upload to IPFS using global service if no tokenUri provided
  if (!tokenUri) {
    if (!globalState.ipfs.isConfigured()) {
      throw new Error(
        'No tokenUri provided and IPFS not configured. Either:\n' +
        '1. Provide tokenUri with your hosted metadata (HTTP or IPFS)\n' +
        '2. Configure IPFS with ipfs_configure first for automatic upload'
      );
    }

    // Build ERC-8004 Registration v1 file (same structure for Solana and EVM)
    const registration = buildRegistrationV1({
      name: agentName,
      description: agentDescription,
      image,
      mcpEndpoint,
      a2aEndpoint,
    });

    const cid = await globalState.ipfs.addJson(registration);
    finalTokenUri = `ipfs://${cid}`;
  }

  // Register on-chain with the URI (finalTokenUri is guaranteed to be set here)
  const txHandle = await agent.registerHTTP(finalTokenUri!);

  // Wait for transaction to be mined (returns { receipt, result })
  const { receipt, result: registrationFile } = await txHandle.waitMined();

  // SDK may return agentId as "chainId:tokenId" - extract just tokenId
  const rawAgentId = agent.agentId;
  const tokenId = rawAgentId ? extractTokenId(rawAgentId) : undefined;
  const chainId = await sdk.chainId();

  return successResponse({
    unsigned: false,
    txHash: receipt.transactionHash,
    agentId: tokenId,
    globalId: tokenId ? `${chainPrefix}:${chainId}:${tokenId}` : undefined,
    name: agentName,
    tokenUri: agent.agentURI,
    message: `Agent registered successfully on ${chainPrefix}.`,
    registrationFile,
  });
}

// Cost estimation for Solana
async function estimateSolanaCost(): Promise<unknown> {
  const provider = globalState.chains.getByPrefix('sol') as SolanaChainProvider | null;
  if (!provider) {
    throw new Error('Solana provider not available');
  }

  // Account sizes from Anchor programs
  const METAPLEX_CORE_ASSET_SIZE = 268; // Base asset + collection plugin
  const ATOM_STATS_SIZE = 561;          // From atom-engine state.rs

  // Calculate rent for each account created during registration
  const agentAccountRent = calculateRentExempt(ACCOUNT_SIZES.agentAccount);
  const metaplexAssetRent = calculateRentExempt(METAPLEX_CORE_ASSET_SIZE);
  const atomStatsRent = calculateRentExempt(ATOM_STATS_SIZE);

  // Transaction fee (CPI-heavy transaction with Metaplex Core)
  const estimatedTxFee = 5000;
  const priorityFeeBuffer = 5000;

  // Total in lamports (ATOM is enabled by default)
  const totalLamports = agentAccountRent + metaplexAssetRent + atomStatsRent + estimatedTxFee + priorityFeeBuffer;
  const totalSol = totalLamports / LAMPORTS_PER_SOL;

  // Recommended balance (add 20% buffer)
  const recommendedLamports = Math.ceil(totalLamports * 1.2);
  const recommendedSol = recommendedLamports / LAMPORTS_PER_SOL;

  return successResponse({
    estimated: true,
    chain: 'solana',
    network: provider.getConfig().displayName,
    breakdown: {
      agentAccountRent: {
        lamports: agentAccountRent,
        sol: agentAccountRent / LAMPORTS_PER_SOL,
        description: `Rent for AgentAccount PDA (${ACCOUNT_SIZES.agentAccount} bytes)`,
      },
      metaplexAssetRent: {
        lamports: metaplexAssetRent,
        sol: metaplexAssetRent / LAMPORTS_PER_SOL,
        description: `Rent for Metaplex Core NFT (~${METAPLEX_CORE_ASSET_SIZE} bytes)`,
      },
      atomStatsRent: {
        lamports: atomStatsRent,
        sol: atomStatsRent / LAMPORTS_PER_SOL,
        description: `Rent for AtomStats reputation account (${ATOM_STATS_SIZE} bytes)`,
      },
      transactionFees: {
        lamports: estimatedTxFee + priorityFeeBuffer,
        sol: (estimatedTxFee + priorityFeeBuffer) / LAMPORTS_PER_SOL,
        description: 'Transaction fee + priority buffer',
      },
    },
    total: {
      lamports: totalLamports,
      sol: totalSol,
    },
    recommended: {
      lamports: recommendedLamports,
      sol: recommendedSol,
      description: 'Total with 20% safety buffer',
    },
    note: 'Includes AtomStats account (ATOM enabled by default). Use register_with_options(atom_enabled=false) to skip.',
    message: `Estimated cost: ${totalSol.toFixed(6)} SOL (~$${(totalSol * 150).toFixed(2)} USD). Recommended: ${recommendedSol.toFixed(6)} SOL`,
  });
}

// Cost estimation for EVM
async function estimateEvmCost(chainPrefix: string): Promise<unknown> {
  const provider = globalState.chains.getByPrefix(chainPrefix as ChainPrefix) as EVMChainProvider | null;
  if (!provider) {
    throw new Error(`EVM provider not available for chain: ${chainPrefix}`);
  }

  const sdk = provider.getSdk();
  const chainId = await sdk.chainId();

  // Get RPC URL from config
  const config = provider.getConfig();
  const rpcUrl = config.rpcUrl;

  // Create public client to get gas price
  const publicClient = createPublicClient({
    transport: http(rpcUrl),
  });

  // Get current gas price
  const gasPrice = await publicClient.getGasPrice();

  // ERC-8004 IdentityRegistryUpgradeable.register() gas breakdown:
  // Transaction 1 - register(uri, metadata[]):
  // - _lastId++ (SSTORE cold): 20,000 gas
  // - agentWallet metadata (SSTORE cold): 20,000 gas
  // - _balances[to] (SSTORE cold): 20,000 gas
  // - _owners[tokenId] (SSTORE cold): 20,000 gas
  // - _tokenURIs[tokenId] (SSTORE cold): 20,000 gas
  // - Function overhead, events, checks: ~50,000 gas
  // Subtotal: ~150,000 gas
  const gasRegister = BigInt(150000);

  // Transaction 2 - setAgentURI (IPFS flow only):
  // - _tokenURIs[tokenId] (SSTORE warm): 5,000 gas
  // - Function overhead: ~16,000 gas
  // Subtotal: ~50,000 gas
  const gasSetUri = BigInt(50000);

  // Total for each flow
  const gasHttpFlow = gasRegister;        // Single transaction
  const gasIpfsFlow = gasRegister + gasSetUri; // Two transactions

  // Calculate costs
  const costHttpWei = gasPrice * gasHttpFlow;
  const costIpfsWei = gasPrice * gasIpfsFlow;

  const costHttpEth = formatEther(costHttpWei);
  const costIpfsEth = formatEther(costIpfsWei);

  // Get native token name
  const nativeToken = getNativeToken(chainPrefix);
  const tokenKey = nativeToken.toLowerCase();

  // USD estimation (using reasonable ETH price)
  const ethPriceUsd = 3000;
  const costHttpUsd = parseFloat(costHttpEth) * ethPriceUsd;
  const costIpfsUsd = parseFloat(costIpfsEth) * ethPriceUsd;

  // Recommended (add 30% buffer for gas price fluctuation)
  const recommendedHttpWei = (costHttpWei * BigInt(130)) / BigInt(100);
  const recommendedIpfsWei = (costIpfsWei * BigInt(130)) / BigInt(100);

  const gasPriceGwei = Number(gasPrice) / 1e9;

  return successResponse({
    estimated: true,
    chain: chainPrefix,
    chainId,
    gasPrice: {
      wei: gasPrice.toString(),
      gwei: gasPriceGwei,
    },
    flows: {
      http: {
        description: 'Single transaction with HTTP/IPFS URI',
        gas: gasHttpFlow.toString(),
        cost: {
          wei: costHttpWei.toString(),
          [tokenKey]: parseFloat(costHttpEth),
          usd: costHttpUsd,
        },
        recommended: {
          wei: recommendedHttpWei.toString(),
          [tokenKey]: parseFloat(formatEther(recommendedHttpWei)),
        },
      },
      ipfs: {
        description: 'Two transactions: register() + setAgentURI() after IPFS upload',
        gas: gasIpfsFlow.toString(),
        cost: {
          wei: costIpfsWei.toString(),
          [tokenKey]: parseFloat(costIpfsEth),
          usd: costIpfsUsd,
        },
        recommended: {
          wei: recommendedIpfsWei.toString(),
          [tokenKey]: parseFloat(formatEther(recommendedIpfsWei)),
        },
      },
    },
    breakdown: {
      register: {
        gas: gasRegister.toString(),
        description: '5 cold SSTORE (100k) + ERC-721 mint + events (50k)',
      },
      setAgentURI: {
        gas: gasSetUri.toString(),
        description: 'Warm SSTORE + overhead (IPFS flow only)',
      },
    },
    note: chainPrefix === 'eth'
      ? 'Ethereum mainnet gas can spike to 50-100 gwei during congestion, increasing costs 10-50x.'
      : 'L2 chains (Base, Arbitrum, etc.) typically have much lower gas costs than mainnet.',
    message: `HTTP flow: ${parseFloat(costHttpEth).toFixed(6)} ${nativeToken} (~$${costHttpUsd.toFixed(2)}). IPFS flow: ${parseFloat(costIpfsEth).toFixed(6)} ${nativeToken} (~$${costIpfsUsd.toFixed(2)}) at ${gasPriceGwei.toFixed(2)} gwei.`,
  });
}

function getNativeToken(chainPrefix: string): string {
  const tokens: Record<string, string> = {
    eth: 'ETH',
    base: 'ETH',
    arb: 'ETH',
    op: 'ETH',
    poly: 'MATIC',
  };
  return tokens[chainPrefix] ?? 'ETH';
}

// Backward compatibility aliases
export const registrationAliases: Record<string, string> = {
  sdk_register_agent: 'agent_register',
  sdk_create_collection: 'collection_create',
};
