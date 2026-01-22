// Reputation interfaces for multi-chain support

export enum TrustTier {
  Unrated = 0,
  Bronze = 1,
  Silver = 2,
  Gold = 3,
  Platinum = 4,
}

export interface IReputationSummary {
  agentId: string;
  chainType: 'solana' | 'evm';
  trustTier: TrustTier;
  trustTierName: string;
  qualityScore: number;
  totalFeedbacks: number;
  averageScore: number;
  recentTrend?: 'up' | 'down' | 'stable';
  lastFeedbackAt?: number;
}

export interface ILeaderboardEntry {
  rank: number;
  agentId: string;
  globalId: string;
  name: string;
  chainType: 'solana' | 'evm';
  trustTier: TrustTier;
  qualityScore: number;
  totalFeedbacks: number;
}

export interface ILeaderboardOptions {
  chainType?: 'solana' | 'evm';
  chainPrefix?: string;
  collection?: string;
  minFeedbacks?: number;
  limit?: number;
  offset?: number;
}

export interface ILeaderboardResult {
  entries: ILeaderboardEntry[];
  total: number;
  hasMore: boolean;
}

export function getTrustTierName(tier: TrustTier): string {
  const names: Record<TrustTier, string> = {
    [TrustTier.Unrated]: 'Unrated',
    [TrustTier.Bronze]: 'Bronze',
    [TrustTier.Silver]: 'Silver',
    [TrustTier.Gold]: 'Gold',
    [TrustTier.Platinum]: 'Platinum',
  };
  return names[tier] ?? 'Unknown';
}

export function getTrustTierThreshold(tier: TrustTier): { minScore: number; minFeedbacks: number } {
  const thresholds: Record<TrustTier, { minScore: number; minFeedbacks: number }> = {
    [TrustTier.Unrated]: { minScore: 0, minFeedbacks: 0 },
    [TrustTier.Bronze]: { minScore: 50, minFeedbacks: 5 },
    [TrustTier.Silver]: { minScore: 65, minFeedbacks: 20 },
    [TrustTier.Gold]: { minScore: 80, minFeedbacks: 50 },
    [TrustTier.Platinum]: { minScore: 90, minFeedbacks: 100 },
  };
  return thresholds[tier] ?? { minScore: 0, minFeedbacks: 0 };
}
