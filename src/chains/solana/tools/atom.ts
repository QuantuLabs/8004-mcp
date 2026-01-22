// Solana ATOM engine tools

import { PublicKey } from '@solana/web3.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getArgs, readString, readBoolean } from '../../../core/parsers/common.js';
import { successResponse } from '../../../core/serializers/common.js';
import type { SolanaStateManager } from '../state.js';
import { getTrustTierName } from '../../../core/interfaces/reputation.js';

export function createAtomTools(getState: () => SolanaStateManager) {
  const tools: Tool[] = [];
  const handlers: Record<string, (args: unknown) => Promise<unknown>> = {};

  // solana_atom_stats_get
  tools.push({
    name: 'solana_atom_stats_get',
    description: 'Get ATOM reputation engine statistics for a Solana agent including quality score, HyperLogLog cardinality, EMA scores, and historical data',
    inputSchema: {
      type: 'object',
      properties: {
        asset: {
          type: 'string',
          description: 'Agent asset public key (base58)',
        },
      },
      required: ['asset'],
    },
  });
  handlers['solana_atom_stats_get'] = async (args: unknown) => {
    const input = getArgs(args);
    const assetStr = readString(input, 'asset', true);
    const asset = new PublicKey(assetStr);
    const sdk = getState().getSdk();
    const stats = await sdk.getAtomStats(asset);
    return successResponse(stats);
  };

  // solana_atom_stats_initialize
  tools.push({
    name: 'solana_atom_stats_initialize',
    description: 'Initialize ATOM stats account for a Solana agent (required before receiving feedback)',
    inputSchema: {
      type: 'object',
      properties: {
        asset: {
          type: 'string',
          description: 'Agent asset public key (base58)',
        },
        skipSend: {
          type: 'boolean',
          description: 'If true, returns unsigned transaction instead of sending',
        },
      },
      required: ['asset'],
    },
  });
  handlers['solana_atom_stats_initialize'] = async (args: unknown) => {
    const input = getArgs(args);
    const assetStr = readString(input, 'asset', true);
    const asset = new PublicKey(assetStr);
    const skipSend = readBoolean(input, 'skipSend') ?? false;
    const sdk = getState().getSdk();
    const result = await sdk.initializeAtomStats(asset, { skipSend });
    return successResponse(result);
  };

  // solana_trust_tier_get
  tools.push({
    name: 'solana_trust_tier_get',
    description: 'Get trust tier (0-4: Unrated, Bronze, Silver, Gold, Platinum) for a Solana agent',
    inputSchema: {
      type: 'object',
      properties: {
        asset: {
          type: 'string',
          description: 'Agent asset public key (base58)',
        },
      },
      required: ['asset'],
    },
  });
  handlers['solana_trust_tier_get'] = async (args: unknown) => {
    const input = getArgs(args);
    const assetStr = readString(input, 'asset', true);
    const asset = new PublicKey(assetStr);
    const sdk = getState().getSdk();
    const stats = await sdk.getAtomStats(asset);
    if (!stats) {
      return successResponse({ trustTier: 0, trustTierName: 'Unrated', qualityScore: 0 });
    }
    return successResponse({
      trustTier: stats.trust_tier,
      trustTierName: getTrustTierName(stats.trust_tier),
      qualityScore: stats.quality_score,
    });
  };

  // solana_enriched_summary_get
  tools.push({
    name: 'solana_enriched_summary_get',
    description: 'Get enriched reputation summary combining ATOM metrics with feedback statistics',
    inputSchema: {
      type: 'object',
      properties: {
        asset: {
          type: 'string',
          description: 'Agent asset public key (base58)',
        },
      },
      required: ['asset'],
    },
  });
  handlers['solana_enriched_summary_get'] = async (args: unknown) => {
    const input = getArgs(args);
    const assetStr = readString(input, 'asset', true);
    const asset = new PublicKey(assetStr);
    const sdk = getState().getSdk();
    const summary = await sdk.getEnrichedSummary(asset);
    return successResponse(summary);
  };

  return { tools, handlers };
}
