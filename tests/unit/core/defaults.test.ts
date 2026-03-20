// Tests for network mode and chain configuration

import { describe, it, expect } from 'vitest';
import {
  CHAIN_CONFIGS,
  DEFAULT_NETWORK_MODE,
  getChainNetworkConfig,
  isChainDeployed,
  getDeployedChains,
  getNetworkDisplayName,
  type NetworkMode,
} from '../../../src/config/defaults.js';
import type { ChainPrefix } from '../../../src/core/interfaces/agent.js';

describe('Network Mode Configuration', () => {
  describe('DEFAULT_NETWORK_MODE', () => {
    it('should default to testnet', () => {
      expect(DEFAULT_NETWORK_MODE).toBe('testnet');
    });
  });

  describe('CHAIN_CONFIGS', () => {
    it('should have all chain prefixes configured', () => {
      const expectedPrefixes: ChainPrefix[] = ['sol', 'base', 'eth', 'poly', 'bsc', 'monad'];
      for (const prefix of expectedPrefixes) {
        expect(CHAIN_CONFIGS[prefix]).toBeDefined();
      }
    });

    it('should have testnet and mainnet for each chain', () => {
      for (const [prefix, config] of Object.entries(CHAIN_CONFIGS)) {
        expect(config.testnet).toBeDefined();
        expect(config.mainnet).toBeDefined();
        expect(config.testnet.chainId).toBeDefined();
        expect(config.mainnet.chainId).toBeDefined();
        expect(config.testnet.rpcUrl).toBeDefined();
        expect(config.mainnet.rpcUrl).toBeDefined();
      }
    });

    it('should have correct Solana cluster names', () => {
      expect(CHAIN_CONFIGS.sol.testnet.chainId).toBe('devnet');
      expect(CHAIN_CONFIGS.sol.mainnet.chainId).toBe('mainnet-beta');
    });

    it('should have correct EVM chain IDs', () => {
      // Base
      expect(CHAIN_CONFIGS.base.testnet.chainId).toBe(84532); // Sepolia
      expect(CHAIN_CONFIGS.base.mainnet.chainId).toBe(8453);

      // Ethereum
      expect(CHAIN_CONFIGS.eth.testnet.chainId).toBe(11155111); // Sepolia
      expect(CHAIN_CONFIGS.eth.mainnet.chainId).toBe(1);

      // Polygon
      expect(CHAIN_CONFIGS.poly.testnet.chainId).toBe(80002); // Amoy
      expect(CHAIN_CONFIGS.poly.mainnet.chainId).toBe(137);

      // BSC
      expect(CHAIN_CONFIGS.bsc.testnet.chainId).toBe(97);
      expect(CHAIN_CONFIGS.bsc.mainnet.chainId).toBe(56);

      // Monad
      expect(CHAIN_CONFIGS.monad.testnet.chainId).toBe(10143);
      expect(CHAIN_CONFIGS.monad.mainnet.chainId).toBe(143);
    });

    it('should expose subgraph URLs for all deployed EVM chains', () => {
      expect(CHAIN_CONFIGS.eth.testnet.subgraphUrl).toContain('/subgraphs/id/6wQRC7geo9XYAhckfmfo8kbMRLeWU8KQd3XsJqFKmZLT');
      expect(CHAIN_CONFIGS.eth.mainnet.subgraphUrl).toContain('/subgraphs/id/FV6RR6y13rsnCxBAicKuQEwDp8ioEGiNaWaZUmvr1F8k');
      expect(CHAIN_CONFIGS.base.testnet.subgraphUrl).toContain('/subgraphs/id/4yYAvQLFjBhBtdRCY7eUWo181VNoTSLLFd5M7FXQAi6u');
      expect(CHAIN_CONFIGS.base.mainnet.subgraphUrl).toContain('/subgraphs/id/43s9hQRurMGjuYnC1r2ZwS6xSQktbFyXMPMqGKUFJojb');
      expect(CHAIN_CONFIGS.poly.mainnet.subgraphUrl).toContain('/subgraphs/id/9q16PZv1JudvtnCAf44cBoxg82yK9SSsFvrjCY9xnneF');
      expect(CHAIN_CONFIGS.bsc.testnet.subgraphUrl).toContain('/subgraphs/id/BTjind17gmRZ6YhT9peaCM13SvWuqztsmqyfjpntbg3Z');
      expect(CHAIN_CONFIGS.bsc.mainnet.subgraphUrl).toContain('/subgraphs/id/D6aWqowLkWqBgcqmpNKXuNikPkob24ADXCciiP8Hvn1K');
      expect(CHAIN_CONFIGS.monad.testnet.subgraphUrl).toContain('/subgraphs/id/8iiMH9sj471jbp7AwUuuyBXvPJqCEsobuHBeUEKQSxhU');
      expect(CHAIN_CONFIGS.monad.mainnet.subgraphUrl).toContain('/subgraphs/id/4tvLxkczjhSaMiqRrCV1EyheYHyJ7Ad8jub1UUyukBjg');
    });

    it('should leave Polygon Amoy testnet without a subgraph because contracts are not deployed', () => {
      expect(CHAIN_CONFIGS.poly.testnet.subgraphUrl).toBe('');
      expect(CHAIN_CONFIGS.poly.testnet.registries.identity).toBe('');
      expect(CHAIN_CONFIGS.poly.testnet.registries.reputation).toBe('');
    });

    it('should have Solana devnet registries configured', () => {
      expect(CHAIN_CONFIGS.sol.testnet.registries.identity).toBe('8oo4J9tBB3Hna1jRQ3rWvJjojqM5DYTDJo5cejUuJy3C');
    });

    it('should have Solana mainnet registries configured from the SDK mainnet defaults', () => {
      expect(CHAIN_CONFIGS.sol.mainnet.registries.identity).toBe('8oo4dC4JvBLwy5tGgiH3WwK4B9PWxL9Z4XjA2jzkQMbQ');
      expect(CHAIN_CONFIGS.sol.mainnet.indexerUrl).toBe('https://8004-indexer-main.qnt.sh/rest/v1');
    });
  });

  describe('getChainNetworkConfig', () => {
    it('should return testnet config for testnet mode', () => {
      const config = getChainNetworkConfig('sol', 'testnet');
      expect(config).not.toBeNull();
      expect(config?.chainId).toBe('devnet');
    });

    it('should return mainnet config for mainnet mode', () => {
      const config = getChainNetworkConfig('sol', 'mainnet');
      expect(config).not.toBeNull();
      expect(config?.chainId).toBe('mainnet-beta');
    });

    it('should return null for unknown prefix', () => {
      const config = getChainNetworkConfig('unknown' as ChainPrefix, 'testnet');
      expect(config).toBeNull();
    });

    it('should return correct EVM config', () => {
      const baseTestnet = getChainNetworkConfig('base', 'testnet');
      expect(baseTestnet?.chainId).toBe(84532);

      const baseMainnet = getChainNetworkConfig('base', 'mainnet');
      expect(baseMainnet?.chainId).toBe(8453);
    });
  });

  describe('isChainDeployed', () => {
    it('should return true for Solana testnet (has registries)', () => {
      expect(isChainDeployed('sol', 'testnet')).toBe(true);
    });

    it('should return true for Solana mainnet when registries are configured', () => {
      expect(isChainDeployed('sol', 'mainnet')).toBe(true);
    });

    it('should return true for EVM chains with testnet deployments', () => {
      expect(isChainDeployed('eth', 'testnet')).toBe(true);
      expect(isChainDeployed('base', 'testnet')).toBe(true);
      expect(isChainDeployed('bsc', 'testnet')).toBe(true);
      expect(isChainDeployed('monad', 'testnet')).toBe(true);
    });

    it('should return false for Polygon Amoy testnet until contracts are deployed', () => {
      expect(isChainDeployed('poly', 'testnet')).toBe(false);
    });

    it('should return correct deployment status for EVM mainnet chains', () => {
      expect(isChainDeployed('eth', 'mainnet')).toBe(true);
      expect(isChainDeployed('base', 'mainnet')).toBe(true);
      expect(isChainDeployed('poly', 'mainnet')).toBe(true);
    });

    it('should return false for unknown prefix', () => {
      expect(isChainDeployed('unknown' as ChainPrefix, 'testnet')).toBe(false);
    });
  });

  describe('getDeployedChains', () => {
    it('should return deployed chains for testnet', () => {
      const deployed = getDeployedChains('testnet');
      expect(deployed).toContain('sol'); // Solana devnet
      expect(deployed).toContain('eth');
      expect(deployed).toContain('base');
      expect(deployed).toContain('bsc');
      expect(deployed).toContain('monad');
      expect(deployed).not.toContain('poly');
    });

    it('should return Solana and EVM chains for mainnet deployments', () => {
      const deployed = getDeployedChains('mainnet');
      expect(deployed).toContain('sol');
      expect(deployed).toContain('eth'); // ETH mainnet is deployed
    });
  });

  describe('getNetworkDisplayName', () => {
    it('should return correct testnet names', () => {
      expect(getNetworkDisplayName('sol', 'testnet')).toBe('Solana Devnet');
      expect(getNetworkDisplayName('base', 'testnet')).toBe('Base Sepolia');
      expect(getNetworkDisplayName('eth', 'testnet')).toBe('Ethereum Sepolia');
      expect(getNetworkDisplayName('poly', 'testnet')).toBe('Polygon Amoy');
      expect(getNetworkDisplayName('bsc', 'testnet')).toContain('BSC');
      expect(getNetworkDisplayName('monad', 'testnet')).toContain('Monad');
    });

    it('should return correct mainnet names', () => {
      expect(getNetworkDisplayName('sol', 'mainnet')).toBe('Solana Mainnet');
      expect(getNetworkDisplayName('base', 'mainnet')).toBe('Base Mainnet');
      expect(getNetworkDisplayName('eth', 'mainnet')).toBe('Ethereum Mainnet');
      expect(getNetworkDisplayName('poly', 'mainnet')).toBe('Polygon Mainnet');
      expect(getNetworkDisplayName('bsc', 'mainnet')).toContain('BSC');
      expect(getNetworkDisplayName('monad', 'mainnet')).toContain('Monad');
    });

    it('should handle unknown prefix gracefully', () => {
      const name = getNetworkDisplayName('unknown' as ChainPrefix, 'testnet');
      expect(name).toContain('Unknown');
    });
  });
});
