// Centralized EVM Agent ID normalization
// Handles all formats: "821", "11155111:821", "eth:11155111:821"

import type { ChainPrefix } from '../interfaces/agent.js';

// Chain ID to prefix mapping
export const EVM_CHAIN_ID_MAP: Record<number, ChainPrefix> = {
  // Mainnets
  1: 'eth',
  8453: 'base',
  42161: 'arb',
  137: 'poly',
  10: 'op',
  // Testnets
  11155111: 'eth',
  84532: 'base',
  421614: 'arb',
  80002: 'poly',
  11155420: 'op',
};

// Prefix to default chainId (mainnet)
export const PREFIX_TO_MAINNET_CHAIN_ID: Record<string, number> = {
  eth: 1,
  base: 8453,
  arb: 42161,
  poly: 137,
  op: 10,
};

// Prefix to testnet chainId
export const PREFIX_TO_TESTNET_CHAIN_ID: Record<string, number> = {
  eth: 11155111,
  base: 84532,
  arb: 421614,
  poly: 80002,
  op: 11155420,
};

// Valid EVM chain prefixes (derived from PREFIX_TO_MAINNET_CHAIN_ID)
export const VALID_EVM_PREFIXES = Object.keys(PREFIX_TO_MAINNET_CHAIN_ID) as ChainPrefix[];

// Check if a string is a valid EVM prefix
export function isValidEvmPrefix(str: string): str is ChainPrefix {
  return VALID_EVM_PREFIXES.includes(str as ChainPrefix);
}

export interface ParsedEvmId {
  prefix: ChainPrefix;
  chainId: number;
  tokenId: string;
  globalId: string;
  sdkId: string;
}

/**
 * Parse any EVM agent ID format into normalized components
 *
 * Input formats:
 * - "821" (raw tokenId, requires chainContext)
 * - "11155111:821" (chainId:tokenId)
 * - "eth:821" (prefix:tokenId, uses default chainId)
 * - "eth:11155111:821" (prefix:chainId:tokenId)
 */
export function parseEvmAgentId(
  id: string,
  chainContext?: { prefix?: ChainPrefix; chainId?: number }
): ParsedEvmId {
  const parts = id.split(':');

  // Single part: raw tokenId
  if (parts.length === 1) {
    const tokenId = parts[0]!;
    // Derive chainId from context, falling back to prefix → mainnet chainId
    const prefix = chainContext?.prefix || (chainContext?.chainId ? EVM_CHAIN_ID_MAP[chainContext.chainId] : undefined);
    const chainId = chainContext?.chainId || (prefix ? PREFIX_TO_MAINNET_CHAIN_ID[prefix] : undefined);

    if (!prefix || !chainId) {
      throw new Error(
        `Cannot parse raw tokenId "${id}" without chain context. ` +
        `Provide chainId or use format "chainId:tokenId" or "prefix:chainId:tokenId".`
      );
    }

    return {
      prefix,
      chainId,
      tokenId,
      globalId: `${prefix}:${chainId}:${tokenId}`,
      sdkId: `${chainId}:${tokenId}`,
    };
  }

  // Two parts: could be "chainId:tokenId" or "prefix:tokenId"
  if (parts.length === 2) {
    const first = parts[0]!;
    const second = parts[1]!;

    // Check if first part is numeric (chainId)
    if (/^\d+$/.test(first)) {
      const chainId = parseInt(first, 10);
      const prefix = EVM_CHAIN_ID_MAP[chainId];
      const tokenId = second;

      if (!prefix) {
        throw new Error(`Unknown chainId: ${chainId}`);
      }

      return {
        prefix,
        chainId,
        tokenId,
        globalId: `${prefix}:${chainId}:${tokenId}`,
        sdkId: `${chainId}:${tokenId}`,
      };
    }

    // First part is prefix - validate and prioritize prefix's default chainId over context
    if (!isValidEvmPrefix(first)) {
      throw new Error(`Unknown EVM prefix: "${first}". Valid prefixes: ${VALID_EVM_PREFIXES.join(', ')}`);
    }
    const prefix = first;
    const tokenId = second;
    // Only use context chainId if it matches the prefix, otherwise use prefix default
    const chainId = (chainContext?.prefix === prefix && chainContext?.chainId)
      ? chainContext.chainId
      : PREFIX_TO_MAINNET_CHAIN_ID[prefix];

    if (!chainId) {
      throw new Error(`Cannot determine chainId for prefix "${prefix}"`);
    }

    return {
      prefix,
      chainId,
      tokenId,
      globalId: `${prefix}:${chainId}:${tokenId}`,
      sdkId: `${chainId}:${tokenId}`,
    };
  }

  // Three parts: "prefix:chainId:tokenId"
  if (parts.length === 3) {
    const prefixStr = parts[0]!;
    if (!isValidEvmPrefix(prefixStr)) {
      throw new Error(`Unknown EVM prefix: "${prefixStr}". Valid prefixes: ${VALID_EVM_PREFIXES.join(', ')}`);
    }
    const prefix = prefixStr;
    const chainId = parseInt(parts[1]!, 10);
    const tokenId = parts[2]!;

    if (isNaN(chainId)) {
      throw new Error(`Invalid chainId in ID: ${id}`);
    }

    return {
      prefix,
      chainId,
      tokenId,
      globalId: `${prefix}:${chainId}:${tokenId}`,
      sdkId: `${chainId}:${tokenId}`,
    };
  }

  // More than 3 parts: malformed
  if (parts.length > 3) {
    throw new Error(`Malformed agent ID with ${parts.length} parts: "${id}". Expected format: "prefix:chainId:tokenId"`);
  }

  throw new Error(`Invalid agent ID format: ${id}`);
}

/**
 * Normalize any EVM agent ID to global format (prefix:chainId:tokenId)
 */
export function toGlobalEvmId(
  id: string,
  chainContext?: { prefix?: ChainPrefix; chainId?: number }
): string {
  return parseEvmAgentId(id, chainContext).globalId;
}

/**
 * Normalize any EVM agent ID to SDK format (chainId:tokenId)
 */
export function toSdkEvmId(
  id: string,
  chainContext?: { prefix?: ChainPrefix; chainId?: number }
): string {
  return parseEvmAgentId(id, chainContext).sdkId;
}

/**
 * Extract just the tokenId from any EVM agent ID format
 */
export function extractTokenId(id: string): string {
  const parts = id.split(':');
  return parts[parts.length - 1]!;
}

/**
 * Check if a string looks like a chainId (numeric)
 */
export function isChainId(str: string): boolean {
  return /^\d+$/.test(str);
}

/**
 * Get prefix from chainId
 */
export function getPrefixFromChainId(chainId: number): ChainPrefix | undefined {
  return EVM_CHAIN_ID_MAP[chainId];
}
