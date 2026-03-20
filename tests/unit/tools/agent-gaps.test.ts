import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseResponse } from '../../helpers/response.js';

const mocks = vi.hoisted(() => ({
  mockGetAgent: vi.fn(),
  mockAgentExists: vi.fn(),
  mockSearchAgents: vi.fn(),
  mockGetByPrefix: vi.fn(),
  mockGetDefault: vi.fn(),
  mockGetAll: vi.fn(),
  mockCacheSearchResults: vi.fn(),
}));

vi.mock('../../../src/state/global-state.js', () => ({
  globalState: {
    chains: {
      getByPrefix: mocks.mockGetByPrefix,
      getDefault: mocks.mockGetDefault,
      getAll: mocks.mockGetAll,
    },
    isLazyCache: true,
    lazyCache: {
      cacheSearchResults: mocks.mockCacheSearchResults,
    },
  },
}));

import { agentHandlers } from '../../../src/tools/unified/agent.js';

describe('Agent Gaps - Lines 279-282, 318-319, 345-347, 373-374', () => {
  const mockProvider = {
    chainType: 'solana',
    chainId: 'solana:devnet',
    chainPrefix: 'sol',
    getAgent: mocks.mockGetAgent,
    agentExists: mocks.mockAgentExists,
    searchAgents: mocks.mockSearchAgents,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockGetByPrefix.mockReturnValue(mockProvider);
    mocks.mockGetDefault.mockReturnValue(mockProvider);
    mocks.mockGetAll.mockReturnValue([mockProvider]);
  });

  describe('agent_search with feedback filters (lines 279-282)', () => {
    it('passes minFeedbackCount filter to search', async () => {
      mocks.mockSearchAgents.mockResolvedValue({
        results: [],
        total: 0,
        hasMore: false,
      });

      const result = await agentHandlers.agent_search({
        query: 'test',
        minFeedbackCount: 5,
      });
      const parsed = parseResponse(result as any);

      expect(parsed.success).toBe(true);
      expect(mocks.mockSearchAgents).toHaveBeenCalledWith(
        expect.objectContaining({
          feedback: expect.objectContaining({ minCount: 5 }),
        })
      );
    });

    it('passes minFeedbackValue filter to search', async () => {
      mocks.mockSearchAgents.mockResolvedValue({
        results: [],
        total: 0,
        hasMore: false,
      });

      const result = await agentHandlers.agent_search({
        query: 'test',
        minFeedbackValue: 80,
      });
      const parsed = parseResponse(result as any);

      expect(parsed.success).toBe(true);
      expect(mocks.mockSearchAgents).toHaveBeenCalledWith(
        expect.objectContaining({
          feedback: expect.objectContaining({ minValue: 80 }),
        })
      );
    });

    it('passes both feedback filters', async () => {
      mocks.mockSearchAgents.mockResolvedValue({
        results: [],
        total: 0,
        hasMore: false,
      });

      const result = await agentHandlers.agent_search({
        minFeedbackCount: 10,
        minFeedbackValue: 90,
      });
      const parsed = parseResponse(result as any);

      expect(parsed.success).toBe(true);
      expect(mocks.mockSearchAgents).toHaveBeenCalledWith(
        expect.objectContaining({
          feedback: { minCount: 10, minValue: 90 },
        })
      );
    });
  });

  describe('agent_search caches results for specific chain (lines 318-319)', () => {
    it('caches search results when specific chain is requested', async () => {
      const agents = [
        { globalId: 'sol:abc', name: 'Agent1', qualityScore: 90 },
      ];
      mocks.mockSearchAgents.mockResolvedValue({
        results: agents,
        total: 1,
        hasMore: false,
      });

      const result = await agentHandlers.agent_search({
        query: 'test',
        chain: 'sol',
      });
      const parsed = parseResponse(result as any);

      expect(parsed.success).toBe(true);
      expect(mocks.mockCacheSearchResults).toHaveBeenCalledWith(agents);
    });
  });

  describe('agent_search multi-chain with chain error (lines 345-347)', () => {
    it('continues search when one chain fails', async () => {
      const failingProvider = {
        chainType: 'evm',
        chainId: 'eip155:84532',
        chainPrefix: 'base',
        searchAgents: vi.fn().mockRejectedValue(new Error('RPC error')),
      };
      const workingProvider = {
        chainType: 'solana',
        chainId: 'solana:devnet',
        chainPrefix: 'sol',
        searchAgents: vi.fn().mockResolvedValue({
          results: [{ globalId: 'sol:abc', name: 'Agent1', qualityScore: 80 }],
          total: 1,
          hasMore: false,
        }),
      };

      mocks.mockGetAll.mockReturnValue([failingProvider, workingProvider]);
      mocks.mockGetByPrefix.mockReturnValue(null);

      const result = await agentHandlers.agent_search({
        query: 'test',
        chain: 'all',
      });
      const parsed = parseResponse(result as any);

      expect(parsed.success).toBe(true);
      expect(parsed.data.results).toHaveLength(1);
    });
  });

  describe('agent_search multi-chain caches paginated results (lines 373-374)', () => {
    it('caches paginated results after multi-chain merge', async () => {
      const provider1 = {
        chainType: 'solana',
        chainId: 'solana:devnet',
        chainPrefix: 'sol',
        searchAgents: vi.fn().mockResolvedValue({
          results: [
            { globalId: 'sol:a', name: 'Agent A', qualityScore: 90 },
            { globalId: 'sol:b', name: 'Agent B', qualityScore: 50 },
          ],
          total: 2,
          hasMore: false,
        }),
      };
      const provider2 = {
        chainType: 'evm',
        chainId: 'base:84532',
        chainPrefix: 'base',
        searchAgents: vi.fn().mockResolvedValue({
          results: [
            { globalId: 'base:84532:1', name: 'Agent C', qualityScore: 70 },
          ],
          total: 1,
          hasMore: false,
        }),
      };

      mocks.mockGetAll.mockReturnValue([provider1, provider2]);
      mocks.mockGetByPrefix.mockReturnValue(null);

      const result = await agentHandlers.agent_search({});
      const parsed = parseResponse(result as any);

      expect(parsed.success).toBe(true);
      expect(mocks.mockCacheSearchResults).toHaveBeenCalled();
    });
  });

  describe('agent_search default cross-chain discovery', () => {
    it('queries every provider when chain is omitted and merges their totals', async () => {
      const provider1 = {
        chainType: 'solana',
        chainId: 'sol',
        chainPrefix: 'sol',
        searchAgents: vi.fn().mockResolvedValue({
          results: [{ globalId: 'sol:a', name: 'Sol Agent', qualityScore: 30 }],
          total: 1,
          hasMore: false,
        }),
      };
      const provider2 = {
        chainType: 'evm',
        chainId: 'base:84532',
        chainPrefix: 'base',
        searchAgents: vi.fn().mockResolvedValue({
          results: [{ globalId: 'base:84532:1', name: 'Base Agent', qualityScore: 20 }],
          total: 1,
          hasMore: false,
        }),
      };
      const provider3 = {
        chainType: 'evm',
        chainId: 'eth:11155111',
        chainPrefix: 'eth',
        searchAgents: vi.fn().mockResolvedValue({
          results: [{ globalId: 'eth:11155111:9', name: 'Eth Agent', qualityScore: 10 }],
          total: 1,
          hasMore: false,
        }),
      };

      mocks.mockGetAll.mockReturnValue([provider1, provider2, provider3]);
      mocks.mockGetByPrefix.mockReturnValue(null);

      const result = await agentHandlers.agent_search({ limit: 5 });
      const parsed = parseResponse(result as any);

      expect(parsed.success).toBe(true);
      expect(provider1.searchAgents).toHaveBeenCalledTimes(1);
      expect(provider2.searchAgents).toHaveBeenCalledTimes(1);
      expect(provider3.searchAgents).toHaveBeenCalledTimes(1);
      expect(parsed.data.total).toBe(3);
      expect(parsed.data.results.map((agent: { globalId: string }) => agent.globalId)).toEqual([
        'sol:a',
        'base:84532:1',
        'eth:11155111:9',
      ]);
    });
  });

  describe('agent_search deduplication', () => {
    it('deduplicates agents with same globalId from multiple chains', async () => {
      const provider1 = {
        chainType: 'solana',
        chainId: 'solana:devnet',
        chainPrefix: 'sol',
        searchAgents: vi.fn().mockResolvedValue({
          results: [
            { globalId: 'sol:abc', name: 'Agent1', qualityScore: 90 },
          ],
          total: 1,
          hasMore: false,
        }),
      };
      const provider2 = {
        chainType: 'solana',
        chainId: 'solana:devnet',
        chainPrefix: 'sol',
        searchAgents: vi.fn().mockResolvedValue({
          results: [
            { globalId: 'sol:abc', name: 'Agent1', qualityScore: 90 },
          ],
          total: 1,
          hasMore: false,
        }),
      };

      mocks.mockGetAll.mockReturnValue([provider1, provider2]);
      mocks.mockGetByPrefix.mockReturnValue(null);

      const result = await agentHandlers.agent_search({});
      const parsed = parseResponse(result as any);

      expect(parsed.data.results).toHaveLength(1);
    });
  });
});
