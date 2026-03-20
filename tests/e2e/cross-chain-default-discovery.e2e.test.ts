import { afterEach, describe, expect, it } from 'vitest';

import { globalState } from '../../src/state/global-state.js';
import {
  callTool,
  initializeMcpE2EState,
  teardownMcpE2EState,
} from './helpers/mcp-state.js';

const RUN_E2E = process.env.RUN_E2E === 'true';

type SearchArgs = {
  limit: number;
  query?: string;
};

async function assertDefaultDiscoveryFansOut(
  mode: 'testnet' | 'mainnet',
  searchArgs: SearchArgs
): Promise<void> {
  await initializeMcpE2EState(mode);

  const providers = globalState.chains.getAll();
  expect(providers.length).toBeGreaterThan(1);

  const callCounts = new Map<string, number>();
  const restorers: Array<() => void> = [];

  for (const provider of providers) {
    const original = provider.searchAgents.bind(provider);
    restorers.push(() => {
      (provider as { searchAgents: typeof provider.searchAgents }).searchAgents = original;
    });

    (provider as { searchAgents: typeof provider.searchAgents }).searchAgents =
      (async (...args: Parameters<typeof provider.searchAgents>) => {
        callCounts.set(provider.chainId, (callCounts.get(provider.chainId) ?? 0) + 1);
        return original(...args);
      }) as typeof provider.searchAgents;
  }

  try {
    const result = await callTool<{
      results: Array<{ globalId: string }>;
      total: number;
      hasMore: boolean;
    }>('agent_search', searchArgs);

    expect(result.total).toBeGreaterThan(0);
    expect(result.results.length).toBeGreaterThan(0);
    expect(typeof result.hasMore).toBe('boolean');

    for (const provider of providers) {
      expect(callCounts.get(provider.chainId)).toBeGreaterThanOrEqual(1);
    }
  } finally {
    for (const restore of restorers.reverse()) {
      restore();
    }
  }
}

describe.skipIf(!RUN_E2E)('Default Cross-Chain Discovery E2E', () => {
  afterEach(() => {
    teardownMcpE2EState();
  });

  it('fans out browse discovery to every deployed provider on testnet', async () => {
    await assertDefaultDiscoveryFansOut('testnet', { limit: 10 });
  });

  it('fans out filtered discovery to every deployed provider on testnet', async () => {
    await assertDefaultDiscoveryFansOut('testnet', { query: 'agent', limit: 10 });
  });

  it('fans out browse discovery to every deployed provider on mainnet', async () => {
    await assertDefaultDiscoveryFansOut('mainnet', { limit: 10 });
  });

  it('fans out filtered discovery to every deployed provider on mainnet', async () => {
    await assertDefaultDiscoveryFansOut('mainnet', { query: 'agent', limit: 10 });
  });
});
