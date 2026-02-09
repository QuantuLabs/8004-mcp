// Tests for GlobalState and network mode management

import { describe, it, expect, beforeEach } from 'vitest';
import { GlobalState } from '../../../src/state/global-state.js';

describe('GlobalState', () => {
  let state: GlobalState;

  beforeEach(() => {
    // Create fresh instance for each test
    state = new GlobalState();
  });

  describe('networkMode', () => {
    it('should default to testnet', () => {
      expect(state.networkMode).toBe('testnet');
    });

    it('should allow setting network mode to mainnet', () => {
      const result = state.setNetworkMode('mainnet');

      expect(result.previous).toBe('testnet');
      expect(result.current).toBe('mainnet');
      expect(state.networkMode).toBe('mainnet');
    });

    it('should allow setting network mode back to testnet', () => {
      state.setNetworkMode('mainnet');
      const result = state.setNetworkMode('testnet');

      expect(result.previous).toBe('mainnet');
      expect(result.current).toBe('testnet');
    });

    it('should return deployed chains for the mode', () => {
      const result = state.setNetworkMode('testnet');

      // Only Solana is deployed on testnet currently
      expect(result.deployedChains).toContain('sol');
    });

    it('should return ETH for deployed chains on mainnet', () => {
      const result = state.setNetworkMode('mainnet');

      // ETH mainnet is deployed
      expect(result.deployedChains).toContain('eth');
      expect(result.deployedChains).toContain('base');
    });
  });

  describe('getNetworkStatus', () => {
    it('should return network status for testnet', () => {
      const status = state.getNetworkStatus();

      expect(status.mode).toBe('testnet');
      expect(status.deployedChains).toContain('sol');
      expect(status.chainStatus.sol).toBeDefined();
      expect(status.chainStatus.sol.deployed).toBe(true);
      expect(status.chainStatus.sol.displayName).toBe('Solana Devnet');
    });

    it('should return correct chain status for each chain', () => {
      const status = state.getNetworkStatus();

      // Check all chains are present
      expect(status.chainStatus.sol).toBeDefined();
      expect(status.chainStatus.base).toBeDefined();
      expect(status.chainStatus.eth).toBeDefined();
      expect(status.chainStatus.poly).toBeDefined();
      expect(status.chainStatus.bsc).toBeDefined();
      expect(status.chainStatus.monad).toBeDefined();

      // Check chain IDs
      expect(status.chainStatus.sol.chainId).toBe('devnet');
      expect(status.chainStatus.base.chainId).toBe(84532);
      expect(status.chainStatus.eth.chainId).toBe(11155111);
    });

    it('should update status after network mode change', () => {
      state.setNetworkMode('mainnet');
      const status = state.getNetworkStatus();

      expect(status.mode).toBe('mainnet');
      expect(status.chainStatus.sol.chainId).toBe('mainnet-beta');
      expect(status.chainStatus.base.chainId).toBe(8453);
      expect(status.chainStatus.eth.chainId).toBe(1);
    });
  });

  describe('config', () => {
    it('should have default config loaded', () => {
      expect(state.config).toBeDefined();
      expect(state.config.solana).toBeDefined();
      expect(state.config.indexer).toBeDefined();
    });

    it('should allow updating config', () => {
      state.setConfig({
        solana: { cluster: 'devnet', rpcUrl: 'https://custom-rpc.com' },
      });

      expect(state.config.solana.rpcUrl).toBe('https://custom-rpc.com');
    });

    it('should reset config to defaults', () => {
      state.setConfig({
        solana: { cluster: 'devnet', rpcUrl: 'https://custom-rpc.com' },
      });
      state.setNetworkMode('mainnet');

      state.resetConfig();

      expect(state.networkMode).toBe('testnet');
    });
  });

  describe('crawlerTimeoutMs', () => {
    it('should have default timeout', () => {
      expect(state.crawlerTimeoutMs).toBeGreaterThan(0);
    });

    it('should allow setting timeout', () => {
      state.crawlerTimeoutMs = 10000;
      expect(state.crawlerTimeoutMs).toBe(10000);
    });

    it('should enforce minimum timeout', () => {
      state.crawlerTimeoutMs = 100; // Too low
      expect(state.crawlerTimeoutMs).toBe(1000); // Minimum
    });

    it('should enforce maximum timeout', () => {
      state.crawlerTimeoutMs = 100000; // Too high
      expect(state.crawlerTimeoutMs).toBe(60000); // Maximum
    });
  });

  describe('chains', () => {
    it('should have chain registry', () => {
      expect(state.chains).toBeDefined();
      expect(state.chains.size()).toBe(0); // Empty initially
    });
  });

  describe('tools', () => {
    it('should have tool registry', () => {
      expect(state.tools).toBeDefined();
      expect(state.tools.size()).toBe(0); // Empty initially
    });
  });

  describe('getSnapshot', () => {
    it('should return complete snapshot', () => {
      const snapshot = state.getSnapshot();

      expect(snapshot.config).toBeDefined();
      expect(snapshot.networkMode).toBe('testnet');
      expect(snapshot.chains).toBeDefined();
      expect(snapshot.chains.registered).toEqual([]);
      expect(snapshot.network).toBeDefined();
      expect(snapshot.network.mode).toBe('testnet');
      expect(snapshot.tools).toBeDefined();
      expect(snapshot.crawlerTimeoutMs).toBeGreaterThan(0);
    });

    it('should reflect network mode changes', () => {
      state.setNetworkMode('mainnet');
      const snapshot = state.getSnapshot();

      expect(snapshot.networkMode).toBe('mainnet');
      expect(snapshot.network.mode).toBe('mainnet');
    });
  });

  describe('hasCache', () => {
    it('should return false before initialization', () => {
      expect(state.hasCache).toBe(false);
    });
  });

  describe('cache', () => {
    it('should throw if accessed before initialization', () => {
      expect(() => state.cache).toThrow('Cache not initialized');
    });
  });

  describe('getChain', () => {
    it('should return null for non-existent chain', () => {
      expect(state.getChain('non-existent')).toBeNull();
    });

    it('should return default chain when no chainId provided', () => {
      // No chains registered yet, so should return null
      expect(state.getChain()).toBeNull();
    });
  });

  describe('requireChain', () => {
    it('should throw when no default chain and no chainId', () => {
      expect(() => state.requireChain()).toThrow('Chain not found');
    });

    it('should throw when chainId not found', () => {
      expect(() => state.requireChain('unknown')).toThrow('Chain not found');
    });
  });

  describe('getDefaultChain', () => {
    it('should return null when no chains registered', () => {
      expect(state.getDefaultChain()).toBeNull();
    });
  });

  describe('requireDefaultChain', () => {
    it('should throw when no chains registered', () => {
      expect(() => state.requireDefaultChain()).toThrow('Chain not found');
    });
  });

  describe('initialize', () => {
    it('should initialize cache', async () => {
      await state.initialize({ autoSync: false });

      expect(state.hasCache).toBe(true);
      state.stop();
    });

    it('should set network mode if provided', async () => {
      await state.initialize({ networkMode: 'mainnet', autoSync: false });

      expect(state.networkMode).toBe('mainnet');
      state.stop();
    });

    it('should not reinitialize if already initialized', async () => {
      await state.initialize({ autoSync: false });
      const firstCache = state.hasCache;

      await state.initialize({ autoSync: false });

      expect(state.hasCache).toBe(firstCache);
      state.stop();
    });
  });

  describe('start/stop', () => {
    it('should not throw when cache not initialized', () => {
      expect(() => state.start()).not.toThrow();
      expect(() => state.stop()).not.toThrow();
    });
  });
});
