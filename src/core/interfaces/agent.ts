// Agent interfaces for multi-chain support

export type ChainType = 'solana' | 'evm';

export type ChainPrefix = 'sol' | 'eth' | 'base' | 'poly' | 'bsc' | 'monad';

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

export type SearchMode = 'name' | 'description' | 'endpoint' | 'all';

export interface ISearchParams {
  query?: string;
  // Specific field searches (take precedence over query when searchMode matches)
  nameQuery?: string;         // Exact or partial name match
  descriptionQuery?: string;  // Search in description/capabilities
  endpointQuery?: string;     // Search by MCP/A2A endpoint URL
  // Search mode controls which fields to search in
  searchMode?: SearchMode;    // Default: 'all'
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
  // Advanced SDK filters (EVM only)
  /** Filter by specific MCP tools (agent must have ALL listed tools) */
  mcpTools?: string[];
  /** Filter by specific A2A skills (agent must have ALL listed skills) */
  a2aSkills?: string[];
  /** Filter by OASF skills */
  oasfSkills?: string[];
  /** Filter by OASF domains */
  oasfDomains?: string[];
  /** Filter by active status */
  active?: boolean;
  /** Filter by x402 payment support */
  x402support?: boolean;
  /** Filter by has MCP endpoint */
  hasMcp?: boolean;
  /** Filter by has A2A endpoint */
  hasA2a?: boolean;
  /** Semantic keyword search */
  keyword?: string;
  /** Feedback-based filters (minCount, minValue, etc.) */
  feedback?: {
    hasFeedback?: boolean;
    minCount?: number;
    maxCount?: number;
    minValue?: number;
    maxValue?: number;
  };
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
    // Solana: sol:rawId
    return { prefix, chainType, rawId: parts[1] ?? '' };
  } else {
    // EVM formats:
    // - Standard: prefix:chainId:tokenId (3 parts)
    // - Short: prefix:tokenId (2 parts, no chainId)
    // - Malformed: prefix:chainId:chainId:tokenId (4+ parts, duplicated chainId)

    if (parts.length === 2) {
      // Short format: eth:738 (no chainId)
      return { prefix, chainType, chainId: undefined, rawId: parts[1] ?? '' };
    }

    if (parts.length >= 4) {
      // Malformed: take last part as rawId
      return { prefix, chainType, chainId: parts[1], rawId: parts[parts.length - 1] ?? '' };
    }

    // Standard: prefix:chainId:tokenId
    return { prefix, chainType, chainId: parts[1], rawId: parts[2] ?? '' };
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
  poly: 4,
  bsc: 5,
  monad: 6,
};
