/**
 * Centralized search filtering utilities
 * Shared between Solana and EVM providers to avoid code duplication
 */

import type { SearchMode } from '../interfaces/agent.js';

/**
 * Search filter parameters
 */
export interface SearchFilterParams {
  query?: string;
  nameQuery?: string;
  descriptionQuery?: string;
  endpointQuery?: string;
  searchMode?: SearchMode;
}

/**
 * Agent data structure for filtering (minimal interface)
 */
export interface FilterableAgent {
  name?: string | null;
  description?: string | null;
  mcpEndpoint?: string | null;
  a2aEndpoint?: string | null;
  mcpTools?: string[];
  a2aSkills?: string[];
  mcpPrompts?: string[];
  mcpResources?: string[];
}

/**
 * Applies text search filter to an agent based on search mode
 * Returns true if agent matches the filter, false otherwise
 */
export function matchesSearchFilter(
  agent: FilterableAgent,
  params: SearchFilterParams
): boolean {
  const mode = params.searchMode ?? 'all';
  const nameQ = (params.nameQuery ?? params.query ?? '').toLowerCase();
  const descQ = (params.descriptionQuery ?? '').toLowerCase();
  const endpointQ = (params.endpointQuery ?? '').toLowerCase();
  const generalQ = (params.query ?? '').toLowerCase();

  // No query = match all
  if (!nameQ && !descQ && !endpointQ && !generalQ) {
    return true;
  }

  const name = (agent.name ?? '').toLowerCase();
  const desc = (agent.description ?? '').toLowerCase();

  // Collect all searchable endpoints/capabilities
  const endpoints = [
    agent.mcpEndpoint ?? '',
    agent.a2aEndpoint ?? '',
    ...(agent.mcpTools ?? []),
    ...(agent.a2aSkills ?? []),
    ...(agent.mcpPrompts ?? []),
    ...(agent.mcpResources ?? []),
  ].map(s => s.toLowerCase());

  switch (mode) {
    case 'name':
      return nameQ ? name.includes(nameQ) : true;

    case 'description':
      return descQ ? desc.includes(descQ) : name.includes(descQ);

    case 'endpoint':
      if (!endpointQ) return true;
      // Check for mcp/a2a keywords
      if (endpointQ === 'mcp' && agent.mcpEndpoint) return true;
      if (endpointQ === 'a2a' && agent.a2aEndpoint) return true;
      return endpoints.some(e => e.includes(endpointQ));

    case 'all':
    default:
      // Name match
      if (nameQ && name.includes(nameQ)) return true;
      if (generalQ && name.includes(generalQ)) return true;
      // Description match
      if (descQ && desc.includes(descQ)) return true;
      if (generalQ && desc.includes(generalQ)) return true;
      // Endpoint match
      if (endpointQ && endpoints.some(e => e.includes(endpointQ))) return true;
      // If specific queries provided but no match found
      if (nameQ || descQ || endpointQ) return false;
      return true;
  }
}

/**
 * Applies quality score filter
 */
export function matchesQualityScore(
  qualityScore: number | undefined | null,
  minScore: number | undefined
): boolean {
  if (minScore === undefined) return true;
  return (qualityScore ?? 0) >= minScore;
}

/**
 * Matches trust tier filter
 */
export function matchesTrustTier(
  trustTier: number | undefined | null,
  minTier: number | undefined
): boolean {
  if (minTier === undefined) return true;
  return (trustTier ?? 0) >= minTier;
}

/**
 * Apply pagination to an array (client-side)
 */
export function applyPagination<T>(
  items: T[],
  offset: number,
  limit: number
): { paginated: T[]; hasMore: boolean } {
  const paginated = items.slice(offset, offset + limit);
  return {
    paginated,
    hasMore: offset + paginated.length < items.length,
  };
}

/**
 * Filter agents with all search criteria
 */
export function filterAgents<T extends FilterableAgent & { quality_score?: number | null; trust_tier?: number | null }>(
  agents: T[],
  params: SearchFilterParams & { minQualityScore?: number; minTrustTier?: number }
): T[] {
  return agents.filter(agent => {
    if (!matchesSearchFilter(agent, params)) return false;
    if (!matchesQualityScore(agent.quality_score, params.minQualityScore)) return false;
    if (!matchesTrustTier(agent.trust_tier, params.minTrustTier)) return false;
    return true;
  });
}
