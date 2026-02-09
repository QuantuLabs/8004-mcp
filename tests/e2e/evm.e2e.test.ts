// E2E tests for EVM chain integration
// These tests run against various EVM testnets

import { describe, it, expect, beforeAll } from 'vitest';
import { EVMChainProvider, type IEVMConfig } from '../../src/chains/evm/provider.js';
import { CHAIN_CONFIGS } from '../../src/config/defaults.js';
import type { ChainPrefix } from '../../src/core/interfaces/agent.js';

// Skip E2E tests if not explicitly enabled
const RUN_E2E = process.env.RUN_E2E === 'true';

// Get private key from environment for write operations
const EVM_PRIVATE_KEY = process.env.EVM_PRIVATE_KEY;

// Helper to create EVM provider for a chain
function createEVMProvider(prefix: ChainPrefix, network: 'testnet' | 'mainnet' = 'testnet'): EVMChainProvider {
  const chainConfig = CHAIN_CONFIGS[prefix];
  const networkConfig = network === 'mainnet' ? chainConfig.mainnet : chainConfig.testnet;

  const config: IEVMConfig = {
    chainId: networkConfig.chainId as number,
    chainPrefix: prefix,
    rpcUrl: networkConfig.rpcUrl,
    subgraphUrl: networkConfig.subgraphUrl,
    privateKey: EVM_PRIVATE_KEY,
  };

  return new EVMChainProvider(config);
}

describe.skipIf(!RUN_E2E)('EVM E2E Tests - Base Sepolia', () => {
  let provider: EVMChainProvider;

  beforeAll(async () => {
    provider = createEVMProvider('base', 'testnet');
    await provider.initialize();
  });

  describe('Provider Lifecycle', () => {
    it('should initialize successfully', () => {
      expect(provider.isReady()).toBe(true);
    });

    it('should have correct chain type', () => {
      expect(provider.chainType).toBe('evm');
      expect(provider.chainPrefix).toBe('base');
    });

    it('should report correct chain ID', () => {
      expect(provider.chainId).toBe('base:84532');
    });

    it('should have correct display name', () => {
      expect(provider.displayName).toBe('Base Sepolia');
    });
  });

  describe('Config Operations', () => {
    it('should return chain config', () => {
      const config = provider.getConfig();

      expect(config.chainType).toBe('evm');
      expect(config.chainPrefix).toBe('base');
      expect(config.chainId).toBe('84532');
      expect(config.displayName).toBe('Base Sepolia');
      expect(config.rpcUrl).toContain('base.org');
    });
  });

  describe('Read Operations (when contracts deployed)', () => {
    // Note: These tests will need actual deployed contracts to pass
    it('should handle agent search gracefully', async () => {
      const result = await provider.searchAgents({
        limit: 10,
      });

      // Should return empty results if no subgraph
      expect(result.results).toBeDefined();
      expect(Array.isArray(result.results)).toBe(true);
    });
  });
});

describe.skipIf(!RUN_E2E)('EVM E2E Tests - Ethereum Sepolia', () => {
  let provider: EVMChainProvider;

  beforeAll(async () => {
    provider = createEVMProvider('eth', 'testnet');
    await provider.initialize();
  });

  it('should initialize with Sepolia config', () => {
    expect(provider.isReady()).toBe(true);
    expect(provider.chainId).toBe('eth:11155111');
    expect(provider.displayName).toBe('Sepolia');
  });

  it('should return correct config', () => {
    const config = provider.getConfig();
    expect(config.chainId).toBe('11155111');
  });
});

describe.skipIf(!RUN_E2E)('EVM E2E Tests - BSC Testnet', () => {
  let provider: EVMChainProvider;

  beforeAll(async () => {
    provider = createEVMProvider('bsc', 'testnet');
    await provider.initialize();
  });

  it('should initialize with BSC Testnet config', () => {
    expect(provider.isReady()).toBe(true);
    expect(provider.chainId).toBe('bsc:97');
  });
});

describe.skipIf(!RUN_E2E)('EVM E2E Tests - Polygon Amoy', () => {
  let provider: EVMChainProvider;

  beforeAll(async () => {
    provider = createEVMProvider('poly', 'testnet');
    await provider.initialize();
  });

  it('should initialize with Polygon Amoy config', () => {
    expect(provider.isReady()).toBe(true);
    expect(provider.chainId).toBe('poly:80002');
    expect(provider.displayName).toBe('Polygon Amoy');
  });
});

describe.skipIf(!RUN_E2E)('EVM E2E Tests - Monad Testnet', () => {
  let provider: EVMChainProvider;

  beforeAll(async () => {
    provider = createEVMProvider('monad', 'testnet');
    await provider.initialize();
  });

  it('should initialize with Monad Testnet config', () => {
    expect(provider.isReady()).toBe(true);
    expect(provider.chainId).toBe('monad:10143');
  });
});

describe.skipIf(!RUN_E2E)('EVM Write Capability', () => {
  it('should have write capability when EVM_PRIVATE_KEY is set', async () => {
    const provider = createEVMProvider('base', 'testnet');
    await provider.initialize();

    if (EVM_PRIVATE_KEY) {
      expect(provider.canWrite()).toBe(true);
    } else {
      expect(provider.canWrite()).toBe(false);
    }
  });
});

describe.skipIf(!RUN_E2E)('EVM skipSend Tests', () => {
  it('should generate unsigned transaction for feedback', async () => {
    const provider = createEVMProvider('base', 'testnet');
    await provider.initialize();

    // This will fail without deployed contracts, but tests the encoding logic
    try {
      const result = await provider.giveFeedback(
        {
          agentId: '1', // Token ID
          score: 85,
          comment: 'E2E test',
          tag1: 'quality',
        },
        { skipSend: true }
      );

      expect(result.unsigned).toBe(true);
      expect(result.transaction).toBeDefined();

      // Parse the transaction JSON
      const tx = JSON.parse(result.transaction);
      expect(tx.chainId).toBe(84532);
      expect(tx.data).toMatch(/^0x/);
      expect(tx.value).toBe('0');
    } catch (error) {
      // Expected if no registry address configured
      expect(String(error)).toMatch(/not configured|No reputation registry/);
    }
  });
});

describe.skipIf(!RUN_E2E)('EVM Multi-Chain Comparison', () => {
  it('should have different chain IDs for each network', async () => {
    const chains: ChainPrefix[] = ['base', 'eth', 'poly', 'bsc', 'monad'];
    const providers: EVMChainProvider[] = [];

    for (const chain of chains) {
      const provider = createEVMProvider(chain, 'testnet');
      await provider.initialize();
      providers.push(provider);
    }

    // All should have unique chain IDs
    const chainIds = providers.map(p => p.chainId);
    const uniqueIds = new Set(chainIds);
    expect(uniqueIds.size).toBe(chains.length);

    // Verify specific IDs
    expect(chainIds).toContain('base:84532');
    expect(chainIds).toContain('eth:11155111');
    expect(chainIds).toContain('poly:80002');
    expect(chainIds).toContain('bsc:97');
    expect(chainIds).toContain('monad:10143');
  });

  it('should have different RPC URLs for each chain', async () => {
    const chains: ChainPrefix[] = ['base', 'eth', 'poly', 'bsc', 'monad'];
    const rpcUrls: string[] = [];

    for (const chain of chains) {
      const provider = createEVMProvider(chain, 'testnet');
      const config = provider.getConfig();
      rpcUrls.push(config.rpcUrl);
    }

    // All should have unique RPC URLs
    const uniqueUrls = new Set(rpcUrls);
    expect(uniqueUrls.size).toBe(chains.length);
  });
});
