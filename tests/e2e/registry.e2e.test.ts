// E2E tests for the global chain registry and multi-chain operations

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ChainRegistry } from '../../src/core/registry/chain-registry.js';
import { GlobalState } from '../../src/state/global-state.js';
import { SolanaChainProvider } from '../../src/chains/solana/provider.js';
import { SolanaStateManager } from '../../src/chains/solana/state.js';
import { EVMChainProvider, type IEVMConfig } from '../../src/chains/evm/provider.js';
import { CHAIN_CONFIGS, getDeployedChains } from '../../src/config/defaults.js';
import type { ChainPrefix } from '../../src/core/interfaces/agent.js';

// Skip E2E tests if not explicitly enabled
const RUN_E2E = process.env.RUN_E2E === 'true';

describe.skipIf(!RUN_E2E)('Global Registry E2E Tests', () => {
  let registry: ChainRegistry;
  let solanaProvider: SolanaChainProvider;
  let baseProvider: EVMChainProvider;

  beforeAll(async () => {
    registry = new ChainRegistry();

    // Setup Solana provider
    const solConfig = CHAIN_CONFIGS.sol.testnet;
    const solanaState = new SolanaStateManager({
      cluster: solConfig.chainId as 'devnet',
      rpcUrl: solConfig.rpcUrl,
      indexerUrl: solConfig.indexerUrl,
    });
    solanaProvider = new SolanaChainProvider(solanaState);

    // Setup Base provider
    const baseConfig = CHAIN_CONFIGS.base.testnet;
    const evmConfig: IEVMConfig = {
      chainId: baseConfig.chainId as number,
      chainPrefix: 'base',
      rpcUrl: baseConfig.rpcUrl,
      subgraphUrl: baseConfig.subgraphUrl,
    };
    baseProvider = new EVMChainProvider(evmConfig);

    // Register providers
    registry.register(solanaProvider);
    registry.register(baseProvider);

    // Initialize all
    await registry.initializeAll();
  });

  describe('Registry Operations', () => {
    it('should have both chains registered', () => {
      expect(registry.size()).toBe(2);
      expect(registry.has('sol')).toBe(true);
      expect(registry.has('base:84532')).toBe(true);
    });

    it('should get provider by chain ID', () => {
      const sol = registry.get('sol');
      expect(sol).not.toBeNull();
      expect(sol?.chainType).toBe('solana');

      const base = registry.get('base:84532');
      expect(base).not.toBeNull();
      expect(base?.chainType).toBe('evm');
    });

    it('should get provider by prefix', () => {
      const sol = registry.getByPrefix('sol');
      expect(sol).not.toBeNull();
      expect(sol?.chainType).toBe('solana');

      const base = registry.getByPrefix('base');
      expect(base).not.toBeNull();
      expect(base?.chainType).toBe('evm');
    });

    it('should set and get default chain', () => {
      // Default should be first registered (Solana)
      const defaultChain = registry.getDefault();
      expect(defaultChain).not.toBeNull();

      // Change default to Base
      registry.setDefault('base:84532');
      expect(registry.getDefault()?.chainPrefix).toBe('base');

      // Reset to Solana
      registry.setDefault('sol');
      expect(registry.getDefault()?.chainPrefix).toBe('sol');
    });

    it('should get all providers', () => {
      const all = registry.getAll();
      expect(all).toHaveLength(2);

      const types = all.map(p => p.chainType);
      expect(types).toContain('solana');
      expect(types).toContain('evm');
    });

    it('should get providers by type', () => {
      const solanaProviders = registry.getAllByType('solana');
      expect(solanaProviders).toHaveLength(1);
      expect(solanaProviders[0].chainType).toBe('solana');

      const evmProviders = registry.getAllByType('evm');
      expect(evmProviders).toHaveLength(1);
      expect(evmProviders[0].chainType).toBe('evm');
    });

    it('should resolve provider from global ID', () => {
      // Solana global ID
      const solProvider = registry.resolveFromGlobalId('sol:HHCVWcqsziJMmp43u2UAgAfH2cBjUFxVdW1M3C3NqzvT');
      expect(solProvider).not.toBeNull();
      expect(solProvider?.chainType).toBe('solana');

      // EVM global ID
      const evmProvider = registry.resolveFromGlobalId('base:84532:123');
      expect(evmProvider).not.toBeNull();
      expect(evmProvider?.chainType).toBe('evm');
    });
  });

  describe('Cross-Chain Operations', () => {
    it('should query agents from multiple chains', async () => {
      const solanaResult = await solanaProvider.searchAgents({ limit: 5 });
      const baseResult = await baseProvider.searchAgents({ limit: 5 });

      // Both should return valid results (even if empty)
      expect(solanaResult.results).toBeDefined();
      expect(baseResult.results).toBeDefined();

      // Solana results should have sol prefix
      for (const agent of solanaResult.results) {
        expect(agent.globalId).toMatch(/^sol:/);
      }

      // Base results should have base prefix
      for (const agent of baseResult.results) {
        expect(agent.globalId).toMatch(/^base:/);
      }
    });

    it('should have different configs per chain', () => {
      const solConfig = solanaProvider.getConfig();
      const baseConfig = baseProvider.getConfig();

      expect(solConfig.chainType).toBe('solana');
      expect(baseConfig.chainType).toBe('evm');
      expect(solConfig.rpcUrl).not.toBe(baseConfig.rpcUrl);
    });
  });
});

describe.skipIf(!RUN_E2E)('Global State E2E Tests', () => {
  let state: GlobalState;

  beforeAll(async () => {
    state = new GlobalState();

    // Register Solana
    const solConfig = CHAIN_CONFIGS.sol.testnet;
    const solanaState = new SolanaStateManager({
      cluster: solConfig.chainId as 'devnet',
      rpcUrl: solConfig.rpcUrl,
      indexerUrl: solConfig.indexerUrl,
    });
    const solanaProvider = new SolanaChainProvider(solanaState);
    state.chains.register(solanaProvider);

    // Register Base
    const baseConfig = CHAIN_CONFIGS.base.testnet;
    const baseProvider = new EVMChainProvider({
      chainId: baseConfig.chainId as number,
      chainPrefix: 'base',
      rpcUrl: baseConfig.rpcUrl,
    });
    state.chains.register(baseProvider);

    // Initialize
    await state.chains.initializeAll();
  });

  describe('Network Mode Switching', () => {
    it('should start in testnet mode', () => {
      expect(state.networkMode).toBe('testnet');
    });

    it('should switch to mainnet mode', () => {
      const result = state.setNetworkMode('mainnet');

      expect(result.previous).toBe('testnet');
      expect(result.current).toBe('mainnet');
      expect(state.networkMode).toBe('mainnet');
    });

    it('should switch back to testnet mode', () => {
      const result = state.setNetworkMode('testnet');

      expect(result.current).toBe('testnet');
    });

    it('should report correct deployed chains per mode', () => {
      // Testnet should have Solana
      state.setNetworkMode('testnet');
      let status = state.getNetworkStatus();
      expect(status.deployedChains).toContain('sol');

      // Mainnet should have ETH (deployed with 22k+ agents)
      state.setNetworkMode('mainnet');
      status = state.getNetworkStatus();
      expect(status.deployedChains).toContain('eth');

      // Reset
      state.setNetworkMode('testnet');
    });
  });

  describe('Snapshot Operations', () => {
    it('should return complete snapshot', () => {
      const snapshot = state.getSnapshot();

      expect(snapshot.networkMode).toBe('testnet');
      expect(snapshot.chains.registered).toContain('sol');
      expect(snapshot.network.mode).toBe('testnet');
      expect(snapshot.network.chainStatus.sol).toBeDefined();
      expect(snapshot.network.chainStatus.base).toBeDefined();
    });
  });
});

describe.skipIf(!RUN_E2E)('Multi-Chain Registration E2E', () => {
  it('should register all EVM testnets', async () => {
    const registry = new ChainRegistry();
    const evmChains: ChainPrefix[] = ['base', 'eth', 'poly', 'bsc', 'monad'];

    for (const chain of evmChains) {
      const config = CHAIN_CONFIGS[chain].testnet;
      const provider = new EVMChainProvider({
        chainId: config.chainId as number,
        chainPrefix: chain,
        rpcUrl: config.rpcUrl,
        subgraphUrl: config.subgraphUrl,
      });
      registry.register(provider);
    }

    expect(registry.size()).toBe(5);

    // Initialize all
    await registry.initializeAll();

    // All should be ready
    const all = registry.getAll();
    for (const provider of all) {
      expect(provider.isReady()).toBe(true);
    }
  });

  it('should handle mixed Solana and EVM chains', async () => {
    const registry = new ChainRegistry();

    // Add Solana
    const solConfig = CHAIN_CONFIGS.sol.testnet;
    const solanaState = new SolanaStateManager({
      cluster: solConfig.chainId as 'devnet',
      rpcUrl: solConfig.rpcUrl,
    });
    registry.register(new SolanaChainProvider(solanaState));

    // Add multiple EVM chains
    for (const chain of ['base', 'eth'] as ChainPrefix[]) {
      const config = CHAIN_CONFIGS[chain].testnet;
      registry.register(new EVMChainProvider({
        chainId: config.chainId as number,
        chainPrefix: chain,
        rpcUrl: config.rpcUrl,
      }));
    }

    await registry.initializeAll();

    // Should have 3 providers
    expect(registry.size()).toBe(3);

    // Should separate by type
    expect(registry.getAllByType('solana')).toHaveLength(1);
    expect(registry.getAllByType('evm')).toHaveLength(2);
  });
});

describe.skipIf(!RUN_E2E)('Deployed Chains Discovery', () => {
  it('should discover deployed chains for testnet', () => {
    const deployed = getDeployedChains('testnet');

    // Only Solana is deployed on testnet
    expect(deployed).toContain('sol');
    expect(deployed.length).toBeGreaterThanOrEqual(1);
  });

  it('should discover deployed chains for mainnet', () => {
    const deployed = getDeployedChains('mainnet');

    // ETH mainnet is deployed (22k+ agents)
    expect(deployed).toContain('eth');
  });
});
