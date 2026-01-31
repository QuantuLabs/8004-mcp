// Solana hash-chain integrity verification tools

import { PublicKey } from '@solana/web3.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getArgs, readString, readNumber, readBoolean } from '../../../core/parsers/common.js';
import { successResponse } from '../../../core/serializers/common.js';
import type { SolanaStateManager } from '../state.js';

export function createIntegrityTools(getState: () => SolanaStateManager) {
  const tools: Tool[] = [];
  const handlers: Record<string, (args: unknown) => Promise<unknown>> = {};

  // solana_integrity_verify
  tools.push({
    name: 'solana_integrity_verify',
    description: 'Verify indexer integrity against on-chain hash-chain digests (O(1) verification). Detects sync lag vs data corruption.',
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
  handlers['solana_integrity_verify'] = async (args: unknown) => {
    const input = getArgs(args);
    const assetStr = readString(input, 'asset', true);
    const asset = new PublicKey(assetStr);
    const sdk = getState().getSdk();
    const result = await sdk.verifyIntegrity(asset);
    return successResponse({
      ...result,
      asset: assetStr,
      recommendation: getIntegrityRecommendation(result.status),
    });
  };

  // solana_integrity_verify_deep
  tools.push({
    name: 'solana_integrity_verify_deep',
    description: 'Deep integrity verification with random spot checks. Verifies actual feedback/response data against on-chain hash-chain.',
    inputSchema: {
      type: 'object',
      properties: {
        asset: {
          type: 'string',
          description: 'Agent asset public key (base58)',
        },
        spotChecks: {
          type: 'number',
          description: 'Number of random spot checks per chain (default: 5)',
        },
        checkBoundaries: {
          type: 'boolean',
          description: 'Verify first and last items exist (default: true)',
        },
        verifyContent: {
          type: 'boolean',
          description: 'Verify IPFS content hash matches (slower, default: false)',
        },
      },
      required: ['asset'],
    },
  });
  handlers['solana_integrity_verify_deep'] = async (args: unknown) => {
    const input = getArgs(args);
    const assetStr = readString(input, 'asset', true);
    const asset = new PublicKey(assetStr);
    const spotChecks = readNumber(input, 'spotChecks');
    const checkBoundaries = readBoolean(input, 'checkBoundaries');
    const verifyContent = readBoolean(input, 'verifyContent');

    const sdk = getState().getSdk();
    const result = await sdk.verifyIntegrityDeep(asset, {
      spotChecks,
      checkBoundaries,
      verifyContent,
    });

    return successResponse({
      ...result,
      asset: assetStr,
      recommendation: getDeepIntegrityRecommendation(result),
    });
  };

  return { tools, handlers };
}

// Helper to provide actionable recommendations
function getIntegrityRecommendation(status: string): string {
  switch (status) {
    case 'valid':
      return 'Indexer data matches on-chain state. Safe to use cached data.';
    case 'syncing':
      return 'Indexer is behind on-chain state. Data may be stale but not corrupted. Wait for sync or use forceOnChain=true.';
    case 'corrupted':
      return 'CRITICAL: Digest mismatch detected. Indexer may be serving tampered data. Switch indexers or use forceOnChain=true immediately.';
    case 'error':
      return 'Could not verify integrity. Check network connectivity and try again.';
    default:
      return 'Unknown status. Consider using forceOnChain=true for safety.';
  }
}

function getDeepIntegrityRecommendation(result: {
  valid: boolean;
  status: string;
  spotChecksPassed?: boolean;
  missingItems?: number;
  modifiedItems?: number;
}): string {
  if (result.valid && result.status === 'valid' && result.spotChecksPassed) {
    return 'All spot checks passed. Indexer data integrity verified.';
  }

  if (result.status === 'syncing') {
    return 'Indexer is syncing. Spot checks may be incomplete. Wait for sync to complete.';
  }

  // Check for specific issues
  const issues: string[] = [];
  if (result.missingItems && result.missingItems > 0) {
    issues.push(`${result.missingItems} missing items`);
  }
  if (result.modifiedItems && result.modifiedItems > 0) {
    issues.push(`${result.modifiedItems} modified items`);
  }

  if (issues.length > 0) {
    return `CRITICAL: Spot checks detected ${issues.join(', ')}. Data integrity compromised. Switch indexers or use forceOnChain=true.`;
  }

  if (!result.spotChecksPassed) {
    return 'Some spot checks failed. Consider using forceOnChain=true for critical operations.';
  }

  return getIntegrityRecommendation(result.status);
}
