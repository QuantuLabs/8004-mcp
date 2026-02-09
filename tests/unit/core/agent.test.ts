// Unit tests for agent interfaces and global ID utilities

import { describe, it, expect } from 'vitest';
import {
  toGlobalId,
  parseGlobalId,
  isValidGlobalId,
  getChainTypeFromPrefix,
  CHAIN_PREFIX_PRIORITY,
} from '../../../src/core/interfaces/agent.js';
import {
  TrustTier,
  getTrustTierName,
  getTrustTierThreshold,
} from '../../../src/core/interfaces/reputation.js';
import { isWritableProvider } from '../../../src/core/interfaces/chain-provider.js';
import type { IChainProvider } from '../../../src/core/interfaces/chain-provider.js';

describe('Agent Global ID', () => {
  describe('toGlobalId', () => {
    it('creates Solana global ID', () => {
      expect(toGlobalId('sol', 'HHCVWcqsziJMmp43u2UAgAfH2cBjUFxVdW1M3C3NqzvT'))
        .toBe('sol:HHCVWcqsziJMmp43u2UAgAfH2cBjUFxVdW1M3C3NqzvT');
    });

    it('creates EVM global ID with chain ID', () => {
      expect(toGlobalId('base', '1234', '8453')).toBe('base:8453:1234');
      expect(toGlobalId('eth', '42', '1')).toBe('eth:1:42');
    });

    it('creates EVM global ID without chain ID', () => {
      expect(toGlobalId('base', '1234')).toBe('base:1234');
    });
  });

  describe('parseGlobalId', () => {
    it('parses Solana global ID', () => {
      const result = parseGlobalId('sol:HHCVWcqsziJMmp43u2UAgAfH2cBjUFxVdW1M3C3NqzvT');
      expect(result).toEqual({
        prefix: 'sol',
        chainType: 'solana',
        rawId: 'HHCVWcqsziJMmp43u2UAgAfH2cBjUFxVdW1M3C3NqzvT',
      });
    });

    it('parses EVM global ID with chain ID', () => {
      const result = parseGlobalId('base:8453:1234');
      expect(result).toEqual({
        prefix: 'base',
        chainType: 'evm',
        chainId: '8453',
        rawId: '1234',
      });
    });

    it('parses various EVM chains', () => {
      expect(parseGlobalId('eth:1:100')).toEqual({
        prefix: 'eth',
        chainType: 'evm',
        chainId: '1',
        rawId: '100',
      });

      expect(parseGlobalId('arb:42161:500')).toEqual({
        prefix: 'arb',
        chainType: 'evm',
        chainId: '42161',
        rawId: '500',
      });
    });
  });

  describe('isValidGlobalId', () => {
    it('returns true for valid Solana ID', () => {
      expect(isValidGlobalId('sol:HHCVWcqsziJMmp43u2UAgAfH2cBjUFxVdW1M3C3NqzvT')).toBe(true);
    });

    it('returns true for valid EVM ID', () => {
      expect(isValidGlobalId('base:8453:1234')).toBe(true);
      expect(isValidGlobalId('eth:1:42')).toBe(true);
    });

    it('returns false for invalid IDs', () => {
      expect(isValidGlobalId('')).toBe(false);
      expect(isValidGlobalId('invalid')).toBe(false);
      expect(isValidGlobalId('sol:')).toBe(false);
    });

    it('returns false when prefix is empty', () => {
      // Empty prefix after colon is invalid
      expect(isValidGlobalId(':rawid')).toBe(false);
    });
  });

  describe('getChainTypeFromPrefix', () => {
    it('returns solana for sol prefix', () => {
      expect(getChainTypeFromPrefix('sol')).toBe('solana');
    });

    it('returns evm for other prefixes', () => {
      expect(getChainTypeFromPrefix('base')).toBe('evm');
      expect(getChainTypeFromPrefix('eth')).toBe('evm');
      expect(getChainTypeFromPrefix('arb')).toBe('evm');
      expect(getChainTypeFromPrefix('poly')).toBe('evm');
      expect(getChainTypeFromPrefix('op')).toBe('evm');
    });
  });

  describe('CHAIN_PREFIX_PRIORITY', () => {
    it('has Solana as highest priority', () => {
      expect(CHAIN_PREFIX_PRIORITY.sol).toBe(1);
    });

    it('has all expected prefixes', () => {
      expect(CHAIN_PREFIX_PRIORITY).toHaveProperty('sol');
      expect(CHAIN_PREFIX_PRIORITY).toHaveProperty('base');
      expect(CHAIN_PREFIX_PRIORITY).toHaveProperty('eth');
      expect(CHAIN_PREFIX_PRIORITY).toHaveProperty('poly');
      expect(CHAIN_PREFIX_PRIORITY).toHaveProperty('bsc');
      expect(CHAIN_PREFIX_PRIORITY).toHaveProperty('monad');
    });
  });
});

describe('Reputation Interface', () => {
  describe('TrustTier enum', () => {
    it('should have correct values', () => {
      expect(TrustTier.Unrated).toBe(0);
      expect(TrustTier.Bronze).toBe(1);
      expect(TrustTier.Silver).toBe(2);
      expect(TrustTier.Gold).toBe(3);
      expect(TrustTier.Platinum).toBe(4);
    });
  });

  describe('getTrustTierName', () => {
    it('returns correct name for each tier', () => {
      expect(getTrustTierName(TrustTier.Unrated)).toBe('Unrated');
      expect(getTrustTierName(TrustTier.Bronze)).toBe('Bronze');
      expect(getTrustTierName(TrustTier.Silver)).toBe('Silver');
      expect(getTrustTierName(TrustTier.Gold)).toBe('Gold');
      expect(getTrustTierName(TrustTier.Platinum)).toBe('Platinum');
    });

    it('returns Unknown for invalid tier', () => {
      expect(getTrustTierName(99 as TrustTier)).toBe('Unknown');
    });
  });

  describe('getTrustTierThreshold', () => {
    it('returns correct thresholds for Unrated', () => {
      const threshold = getTrustTierThreshold(TrustTier.Unrated);
      expect(threshold.minScore).toBe(0);
      expect(threshold.minFeedbacks).toBe(0);
    });

    it('returns correct thresholds for Bronze', () => {
      const threshold = getTrustTierThreshold(TrustTier.Bronze);
      expect(threshold.minScore).toBe(50);
      expect(threshold.minFeedbacks).toBe(5);
    });

    it('returns correct thresholds for Silver', () => {
      const threshold = getTrustTierThreshold(TrustTier.Silver);
      expect(threshold.minScore).toBe(65);
      expect(threshold.minFeedbacks).toBe(20);
    });

    it('returns correct thresholds for Gold', () => {
      const threshold = getTrustTierThreshold(TrustTier.Gold);
      expect(threshold.minScore).toBe(80);
      expect(threshold.minFeedbacks).toBe(50);
    });

    it('returns correct thresholds for Platinum', () => {
      const threshold = getTrustTierThreshold(TrustTier.Platinum);
      expect(threshold.minScore).toBe(90);
      expect(threshold.minFeedbacks).toBe(100);
    });

    it('returns default thresholds for invalid tier', () => {
      const threshold = getTrustTierThreshold(99 as TrustTier);
      expect(threshold.minScore).toBe(0);
      expect(threshold.minFeedbacks).toBe(0);
    });
  });
});

describe('Chain Provider Interface', () => {
  describe('isWritableProvider', () => {
    it('returns true when canWrite() and giveFeedback function exist', () => {
      const provider = {
        canWrite: () => true,
        giveFeedback: () => Promise.resolve({ unsigned: false, signature: 'sig' }),
      } as unknown as IChainProvider;

      expect(isWritableProvider(provider)).toBe(true);
    });

    it('returns false when canWrite() returns false', () => {
      const provider = {
        canWrite: () => false,
        giveFeedback: () => Promise.resolve({ unsigned: false, signature: 'sig' }),
      } as unknown as IChainProvider;

      expect(isWritableProvider(provider)).toBe(false);
    });

    it('returns false when giveFeedback function does not exist', () => {
      const provider = {
        canWrite: () => true,
      } as unknown as IChainProvider;

      expect(isWritableProvider(provider)).toBe(false);
    });

    it('returns false when both conditions fail', () => {
      const provider = {
        canWrite: () => false,
      } as unknown as IChainProvider;

      expect(isWritableProvider(provider)).toBe(false);
    });
  });
});
