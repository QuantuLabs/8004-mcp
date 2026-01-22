// EVM chain provider implementation with agent0-sdk

import { encodeFunctionData } from 'viem';
import {
  SDK as Agent0SDK,
  REPUTATION_REGISTRY_ABI,
  type SDKConfig,
} from 'agent0-sdk';
import type { AgentSummary, Feedback } from 'agent0-sdk';
import type {
  IChainProvider,
  IChainConfig,
  IWriteOptions,
  ITransactionResult,
} from '../../core/interfaces/chain-provider.js';
import type {
  IAgent,
  ISearchParams,
  ISearchResult,
  ChainType,
  ChainPrefix,
} from '../../core/interfaces/agent.js';
import { toGlobalId } from '../../core/interfaces/agent.js';
import type {
  IFeedback,
  IFeedbackInput,
  IFeedbackQuery,
  IFeedbackResult,
} from '../../core/interfaces/feedback.js';
import type {
  IReputationSummary,
  ILeaderboardOptions,
  ILeaderboardResult,
} from '../../core/interfaces/reputation.js';
import { TrustTier, getTrustTierName } from '../../core/interfaces/reputation.js';
import { getWalletManager } from '../../core/wallet/index.js';

export interface IEVMConfig {
  chainId: number;
  chainPrefix: ChainPrefix;
  rpcUrl: string;
  subgraphUrl?: string;
  privateKey?: string;
}

export class EVMChainProvider implements IChainProvider {
  readonly chainType: ChainType = 'evm';
  readonly chainPrefix: ChainPrefix;
  readonly chainId: string;
  readonly displayName: string;

  private readonly config: IEVMConfig;
  private _ready = false;
  private _sdk?: Agent0SDK;

  constructor(config: IEVMConfig) {
    this.config = config;
    this.chainPrefix = config.chainPrefix;
    this.chainId = `${config.chainPrefix}:${config.chainId}`;
    this.displayName = this.getDisplayName(config.chainPrefix, config.chainId);
  }

  private getDisplayName(prefix: ChainPrefix, chainId: number): string {
    const names: Record<string, Record<number, string>> = {
      base: { 8453: 'Base Mainnet', 84532: 'Base Sepolia' },
      eth: { 1: 'Ethereum Mainnet', 11155111: 'Sepolia' },
      arb: { 42161: 'Arbitrum One', 421614: 'Arbitrum Sepolia' },
      poly: { 137: 'Polygon', 80002: 'Polygon Amoy' },
      op: { 10: 'Optimism', 11155420: 'Optimism Sepolia' },
    };
    return names[prefix]?.[chainId] ?? `EVM ${prefix}:${chainId}`;
  }

  // Get or create SDK instance (public for registration tools)
  getSdk(): Agent0SDK {
    if (!this._sdk) {
      const walletManager = getWalletManager();
      const privateKey = this.config.privateKey ?? walletManager.getAnyUnlockedEvmPrivateKey();

      const sdkConfig: SDKConfig = {
        chainId: this.config.chainId,
        rpcUrl: this.config.rpcUrl,
        privateKey: privateKey as `0x${string}` | undefined,
        subgraphUrl: this.config.subgraphUrl,
      };

      this._sdk = new Agent0SDK(sdkConfig);
    }
    return this._sdk;
  }

  // Invalidate SDK (e.g., after wallet unlock)
  invalidateSdk(): void {
    this._sdk = undefined;
  }

  // Lifecycle
  async initialize(): Promise<void> {
    // Verify we can create SDK
    this.getSdk();
    this._ready = true;
  }

  isReady(): boolean {
    return this._ready;
  }

  canWrite(): boolean {
    return !!(this.config.privateKey || getWalletManager().getAnyUnlockedEvmAccount());
  }

  getConfig(): IChainConfig {
    return {
      chainType: this.chainType,
      chainPrefix: this.chainPrefix,
      chainId: String(this.config.chainId),
      displayName: this.displayName,
      rpcUrl: this.config.rpcUrl,
      indexerUrl: this.config.subgraphUrl,
      isDefault: false,
      priority: 2,
    };
  }

  // Agent Operations
  async getAgent(agentId: string): Promise<IAgent | null> {
    try {
      const sdk = this.getSdk();
      const agent = await sdk.getAgent(agentId);
      if (!agent) return null;

      return {
        id: agentId,
        globalId: toGlobalId(this.chainPrefix, agentId, String(this.config.chainId)),
        chainType: 'evm',
        chainPrefix: this.chainPrefix,
        name: agent.name ?? `Agent #${agentId}`,
        description: agent.description,
        owner: agent.owners?.[0] ?? '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    } catch (err) {
      console.warn(`EVMChainProvider.getAgent error: ${err}`);
      return null;
    }
  }

  async agentExists(agentId: string): Promise<boolean> {
    const agent = await this.getAgent(agentId);
    return agent !== null;
  }

  async searchAgents(params: ISearchParams): Promise<ISearchResult> {
    try {
      const sdk = this.getSdk();
      const results = await sdk.searchAgents(
        {
          owners: params.owner ? [params.owner] : undefined,
          name: params.query,
        },
        {
          pageSize: params.limit ?? 20,
        }
      );

      return {
        results: results.items.map((a: AgentSummary) => ({
          id: a.agentId,
          globalId: toGlobalId(this.chainPrefix, a.agentId, String(this.config.chainId)),
          chainType: 'evm' as const,
          chainPrefix: this.chainPrefix,
          name: a.name ?? `Agent #${a.agentId}`,
          owner: a.owners?.[0] ?? '',
        })),
        total: results.items.length,
        hasMore: !!results.nextCursor,
        offset: params.offset ?? 0,
        limit: params.limit ?? 20,
      };
    } catch (err) {
      console.warn(`EVMChainProvider.searchAgents error: ${err}`);
      return {
        results: [],
        total: 0,
        hasMore: false,
        offset: params.offset ?? 0,
        limit: params.limit ?? 20,
      };
    }
  }

  // Feedback Operations
  async getFeedback(agentId: string, client: string, index: bigint): Promise<IFeedback | null> {
    try {
      const sdk = this.getSdk();
      const feedback = await sdk.getFeedback(agentId, client as `0x${string}`, Number(index));
      if (!feedback) return null;

      return {
        agentId,
        client,
        index,
        score: feedback.value ?? 0,
        comment: feedback.text,
        timestamp: feedback.createdAt ?? Date.now(),
        chainType: 'evm',
      };
    } catch (err) {
      console.warn(`EVMChainProvider.getFeedback error: ${err}`);
      return null;
    }
  }

  async listFeedbacks(query: IFeedbackQuery): Promise<IFeedbackResult> {
    try {
      const sdk = this.getSdk();
      const feedbacks = await sdk.searchFeedback({
        agentId: query.agentId,
        reviewers: query.client ? [query.client as `0x${string}`] : undefined,
        includeRevoked: query.includeRevoked,
      });

      return {
        feedbacks: feedbacks.map((f: Feedback) => ({
          agentId: f.agentId,
          client: f.reviewer,
          index: BigInt(f.id[2]),
          score: f.value ?? 0,
          comment: f.text,
          timestamp: f.createdAt ?? Date.now(),
          chainType: 'evm' as const,
        })),
        total: feedbacks.length,
        hasMore: false, // searchFeedback doesn't support pagination yet
      };
    } catch (err) {
      console.warn(`EVMChainProvider.listFeedbacks error: ${err}`);
      return { feedbacks: [], total: 0, hasMore: false };
    }
  }

  // Write operations with skipSend support
  async giveFeedback(input: IFeedbackInput, options?: IWriteOptions): Promise<ITransactionResult> {
    const skipSend = options?.skipSend ?? false;
    const sdk = this.getSdk();

    // Get reputation registry address from SDK
    const reputationRegistry = sdk.reputationRegistryAddress();
    if (!reputationRegistry) {
      throw new Error('Reputation registry address not configured for this chain');
    }

    // Prepare feedback parameters
    // agentId can be "tokenId" or "chainId:tokenId" format - extract just the token ID
    const rawAgentId = input.agentId.includes(':') ? input.agentId.split(':').pop()! : input.agentId;
    const agentId = BigInt(rawAgentId);
    const value = BigInt(Math.round(input.score * 100)); // Convert to basis points
    const valueDecimals = 2;
    const tag1 = input.tag1 ?? '';
    const tag2 = input.tag2 ?? '';
    const endpoint = input.endpoint ?? '';
    const feedbackUri = input.feedbackUri ?? '';
    const feedbackHash = input.feedbackHash
      ? (typeof input.feedbackHash === 'string' ? input.feedbackHash : `0x${Buffer.from(input.feedbackHash).toString('hex')}`)
      : '0x0000000000000000000000000000000000000000000000000000000000000000';

    if (skipSend) {
      // Build unsigned transaction using viem
      const data = encodeFunctionData({
        abi: REPUTATION_REGISTRY_ABI,
        functionName: 'giveFeedback',
        args: [agentId, value, valueDecimals, tag1, tag2, endpoint, feedbackUri, feedbackHash as `0x${string}`],
      });

      const unsignedTx = {
        to: reputationRegistry,
        data,
        chainId: this.config.chainId,
        value: '0',
      };

      return {
        unsigned: true,
        transaction: JSON.stringify(unsignedTx),
        message: 'Sign this transaction with MetaMask/WalletConnect and broadcast to the network.',
      };
    }

    // Send transaction via SDK
    if (!this.canWrite()) {
      throw new Error('Write operations require a configured signer. Use skipSend=true to get unsigned transaction.');
    }

    const result = await sdk.giveFeedback(
      input.agentId,
      input.score,
      input.tag1,
      input.tag2,
      input.endpoint,
      input.feedbackUri ? { text: input.comment } : undefined
    );

    // Feedback result contains the feedback object with ID
    return {
      unsigned: false,
      signature: `${result.id[0]}:${result.id[1]}:${result.id[2]}`,
    };
  }

  // Reputation Operations
  async getReputationSummary(agentId: string): Promise<IReputationSummary | null> {
    try {
      const sdk = this.getSdk();
      const summary = await sdk.getReputationSummary(agentId);

      // Compute trust tier based on count and average
      const trustTier = this.computeTrustTier(summary.count, summary.averageValue);

      return {
        agentId,
        chainType: 'evm',
        trustTier,
        trustTierName: getTrustTierName(trustTier),
        qualityScore: summary.averageValue,
        totalFeedbacks: summary.count,
        averageScore: summary.averageValue,
      };
    } catch (err) {
      console.warn(`EVMChainProvider.getReputationSummary error: ${err}`);
      return null;
    }
  }

  private computeTrustTier(count: number, averageValue: number): TrustTier {
    if (count >= 100 && averageValue >= 90) return TrustTier.Platinum;
    if (count >= 50 && averageValue >= 80) return TrustTier.Gold;
    if (count >= 20 && averageValue >= 65) return TrustTier.Silver;
    if (count >= 5 && averageValue >= 50) return TrustTier.Bronze;
    return TrustTier.Unrated;
  }

  // Optional: Indexer operations
  async isIndexerAvailable(): Promise<boolean> {
    return !!this.config.subgraphUrl;
  }

  async getLeaderboard(_options?: ILeaderboardOptions): Promise<ILeaderboardResult> {
    // Leaderboard requires subgraph - not yet implemented
    console.warn('EVMChainProvider.getLeaderboard not yet implemented');
    return {
      entries: [],
      total: 0,
      hasMore: false,
    };
  }
}
