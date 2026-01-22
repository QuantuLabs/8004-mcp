// Agent interfaces for multi-chain support

export type ChainType = 'solana' | 'evm';

export type ChainPrefix = 'sol' | 'eth' | 'base' | 'arb' | 'poly' | 'op';

export interface IGlobalId {
  prefix: ChainPrefix;
  chainType: ChainType;
  chainId?: string;
  rawId: string;
}

export interface IAgentEndpoint {
  protocol: string;
  url: string;
  metadata?: Record<string, unknown>;
}

export interface IAgentMetadata {
  skills?: string[];
  tags?: string[];
  version?: string;
  [key: string]: unknown;
}

export interface IAgent {
  id: string;
  globalId: string;
  chainType: ChainType;
  chainPrefix: ChainPrefix;
  chainId?: string;
  name: string;
  description?: string;
  image?: string;
  owner: string;
  collection?: string;
  metadata?: IAgentMetadata;
  endpoints?: IAgentEndpoint[];
  trustTier?: number;
  qualityScore?: number;
  totalFeedbacks?: number;
  averageScore?: number;
  createdAt: number;
  updatedAt: number;
}

export interface IAgentSummary {
  id: string;
  globalId: string;
  chainType: ChainType;
  chainPrefix: ChainPrefix;
  name: string;
  description?: string;
  image?: string;
  owner: string;
  collection?: string;
  trustTier?: number;
  qualityScore?: number;
  totalFeedbacks?: number;
}

export interface ISearchParams {
  query?: string;
  owner?: string;
  collection?: string;
  chainType?: ChainType;
  chainPrefix?: ChainPrefix;
  minQualityScore?: number;
  minTrustTier?: number;
  limit?: number;
  offset?: number;
  orderBy?: 'name' | 'qualityScore' | 'totalFeedbacks' | 'createdAt' | 'updatedAt';
  orderDir?: 'asc' | 'desc';
}

export interface ISearchResult {
  results: IAgentSummary[];
  total: number;
  hasMore: boolean;
  offset: number;
  limit: number;
}

// Global ID utilities
export function toGlobalId(chainPrefix: ChainPrefix, rawId: string, chainId?: string): string {
  if (chainId) {
    return `${chainPrefix}:${chainId}:${rawId}`;
  }
  return `${chainPrefix}:${rawId}`;
}

export function parseGlobalId(id: string): IGlobalId {
  const parts = id.split(':');
  const prefix = parts[0] as ChainPrefix;
  const chainType: ChainType = prefix === 'sol' ? 'solana' : 'evm';

  if (chainType === 'solana') {
    return { prefix, chainType, rawId: parts[1] ?? '' };
  } else {
    return {
      prefix,
      chainType,
      chainId: parts[1],
      rawId: parts[2] ?? ''
    };
  }
}

export function isValidGlobalId(id: string): boolean {
  const parsed = parseGlobalId(id);
  return !!parsed.prefix && !!parsed.rawId;
}

export function getChainTypeFromPrefix(prefix: ChainPrefix): ChainType {
  return prefix === 'sol' ? 'solana' : 'evm';
}

export const CHAIN_PREFIX_PRIORITY: Record<ChainPrefix, number> = {
  sol: 1,
  base: 2,
  eth: 3,
  arb: 4,
  poly: 5,
  op: 6,
};
