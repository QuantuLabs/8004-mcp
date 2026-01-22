// Solana chain provider implementation

import { PublicKey } from '@solana/web3.js';
import type {
  IChainProvider,
  IChainConfig,
  IWriteOptions,
  ITransactionResult,
} from '../../core/interfaces/chain-provider.js';
import type {
  IAgent,
  IAgentSummary,
  ISearchParams,
  ISearchResult,
  ChainType,
  ChainPrefix,
} from '../../core/interfaces/agent.js';
import { toGlobalId } from '../../core/interfaces/agent.js';
import type {
  IFeedback,
  IFeedbackQuery,
  IFeedbackResult,
  IFeedbackInput,
} from '../../core/interfaces/feedback.js';
import type {
  IReputationSummary,
  ILeaderboardOptions,
  ILeaderboardResult,
} from '../../core/interfaces/reputation.js';
import { TrustTier, getTrustTierName } from '../../core/interfaces/reputation.js';
import { SolanaStateManager } from './state.js';
import type { ISolanaConfig } from './state.js';
import type { AgentAccount, IndexedAgent } from '8004-solana';

export class SolanaChainProvider implements IChainProvider {
  readonly chainType: ChainType = 'solana';
  readonly chainPrefix: ChainPrefix = 'sol';
  readonly chainId: string = 'sol';
  readonly displayName: string;

  private readonly state: SolanaStateManager;
  private _ready = false;

  constructor(config?: Partial<ISolanaConfig>, privateKey?: string) {
    this.state = new SolanaStateManager(config, privateKey);
    this.displayName = `Solana ${this.state.config.cluster}`;
  }

  // Lifecycle
  async initialize(): Promise<void> {
    // Pre-initialize SDK to verify connection
    this.state.getSdk();
    this._ready = true;
  }

  isReady(): boolean {
    return this._ready;
  }

  canWrite(): boolean {
    return this.state.canWrite();
  }

  getConfig(): IChainConfig {
    const config = this.state.config;
    return {
      chainType: this.chainType,
      chainPrefix: this.chainPrefix,
      displayName: this.displayName,
      rpcUrl: config.rpcUrl ?? '',
      indexerUrl: config.indexerUrl,
      isDefault: true,
      priority: 1,
    };
  }

  // State access
  getState(): SolanaStateManager {
    return this.state;
  }

  // Agent Operations
  async getAgent(agentId: string): Promise<IAgent | null> {
    const sdk = this.state.getSdk();
    try {
      const pubkey = new PublicKey(agentId);
      const agent = await sdk.loadAgent(pubkey);
      if (!agent) return null;
      return this.mapAgentAccount(agentId, agent);
    } catch {
      return null;
    }
  }

  async agentExists(agentId: string): Promise<boolean> {
    const agent = await this.getAgent(agentId);
    return agent !== null;
  }

  async searchAgents(params: ISearchParams): Promise<ISearchResult> {
    const sdk = this.state.getSdk();
    const indexer = this.state.getIndexer();

    // Use indexer if available
    if (indexer && !this.state.config.forceOnChain) {
      try {
        let results: IndexedAgent[] = [];

        if (params.owner) {
          results = await indexer.getAgentsByOwner(params.owner);
        } else if (params.collection) {
          results = await indexer.getAgentsByCollection(params.collection);
        } else {
          results = await indexer.getAgents({
            limit: params.limit,
            offset: params.offset,
          });
        }

        // Apply client-side query filtering if needed
        if (params.query) {
          const query = params.query.toLowerCase();
          results = results.filter(a =>
            (a.nft_name ?? '').toLowerCase().includes(query)
          );
        }

        // Apply pagination if not already handled
        const offset = params.offset ?? 0;
        const limit = params.limit ?? 20;
        const paginated = results.slice(offset, offset + limit);

        return {
          results: paginated.map((a: IndexedAgent) => this.mapIndexedAgent(a)),
          total: results.length,
          hasMore: offset + paginated.length < results.length,
          offset,
          limit,
        };
      } catch {
        if (!this.state.config.indexerFallback) {
          throw new Error('Indexer query failed and fallback is disabled');
        }
      }
    }

    // Fallback to on-chain query (limited)
    let agents: { account: AgentAccount }[] = [];
    if (params.owner) {
      const pubkey = new PublicKey(params.owner);
      agents = await sdk.getAgentsByOwner(pubkey);
    }

    // Apply client-side filtering
    let filtered = agents;
    if (params.query) {
      const query = params.query.toLowerCase();
      filtered = agents.filter(a =>
        a.account.nft_name.toLowerCase().includes(query)
      );
    }

    // Apply pagination
    const offset = params.offset ?? 0;
    const limit = params.limit ?? 20;
    const paginated = filtered.slice(offset, offset + limit);

    return {
      results: paginated.map(a => this.mapAgentAccountToSummary(a.account)),
      total: filtered.length,
      hasMore: offset + paginated.length < filtered.length,
      offset,
      limit,
    };
  }

  // Feedback Operations
  async getFeedback(agentId: string, client: string, index: bigint): Promise<IFeedback | null> {
    const sdk = this.state.getSdk();
    try {
      const assetPubkey = new PublicKey(agentId);
      const clientPubkey = new PublicKey(client);
      const feedback = await sdk.readFeedback(assetPubkey, clientPubkey, index);
      if (!feedback) return null;
      return {
        agentId,
        client,
        index,
        score: feedback.score,
        timestamp: Date.now(),
        chainType: 'solana',
      };
    } catch {
      return null;
    }
  }

  async listFeedbacks(query: IFeedbackQuery): Promise<IFeedbackResult> {
    const sdk = this.state.getSdk();
    const assetPubkey = new PublicKey(query.agentId);
    const includeRevoked = query.includeRevoked ?? false;
    const feedbacks = await sdk.readAllFeedback(assetPubkey, includeRevoked);

    const mapped: IFeedback[] = feedbacks.map((f, i) => ({
      agentId: query.agentId,
      client: query.client ?? '',
      index: BigInt(i),
      score: f.score,
      timestamp: Date.now(),
      chainType: 'solana' as const,
    }));

    // Apply filtering
    let filtered = mapped;
    if (query.minScore !== undefined) {
      filtered = filtered.filter(f => f.score >= query.minScore!);
    }
    if (query.maxScore !== undefined) {
      filtered = filtered.filter(f => f.score <= query.maxScore!);
    }

    // Apply pagination
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 20;
    const paginated = filtered.slice(offset, offset + limit);

    return {
      feedbacks: paginated,
      total: filtered.length,
      hasMore: offset + paginated.length < filtered.length,
    };
  }

  // Reputation Operations
  async getReputationSummary(agentId: string): Promise<IReputationSummary | null> {
    const sdk = this.state.getSdk();

    try {
      const assetPubkey = new PublicKey(agentId);
      const summary = await sdk.getReputationSummary(assetPubkey);
      const atomStats = await sdk.getAtomStats(assetPubkey).catch(() => null);
      const trustTier = atomStats?.trust_tier ?? TrustTier.Unrated;

      return {
        agentId,
        chainType: 'solana',
        trustTier,
        trustTierName: getTrustTierName(trustTier),
        qualityScore: atomStats?.quality_score ?? summary.averageScore,
        totalFeedbacks: summary.count,
        averageScore: summary.averageScore,
      };
    } catch {
      return null;
    }
  }

  // Optional: Indexer operations
  async isIndexerAvailable(): Promise<boolean> {
    return this.state.isIndexerAvailable();
  }

  async getLeaderboard(options?: ILeaderboardOptions): Promise<ILeaderboardResult> {
    const indexer = this.state.getIndexer();
    if (!indexer) {
      return { entries: [], total: 0, hasMore: false };
    }

    const result = await indexer.getLeaderboard({
      collection: options?.collection,
      minTier: options?.minFeedbacks ? 1 : undefined,
      limit: options?.limit,
    });

    return {
      entries: result.map((a: IndexedAgent, i: number) => ({
        rank: (options?.offset ?? 0) + i + 1,
        agentId: a.asset,
        globalId: toGlobalId('sol', a.asset),
        name: a.nft_name ?? 'Unknown',
        chainType: 'solana' as const,
        trustTier: a.trust_tier ?? TrustTier.Unrated,
        qualityScore: a.quality_score ?? 0,
        totalFeedbacks: a.feedback_count ?? 0,
      })),
      total: result.length,
      hasMore: false,
    };
  }

  // Write operations
  async giveFeedback(input: IFeedbackInput, options?: IWriteOptions): Promise<ITransactionResult> {
    const skipSend = options?.skipSend ?? false;

    // For skipSend, we don't need a signer - we'll return unsigned tx
    if (!skipSend && !this.canWrite()) {
      throw new Error('Write operations require a configured signer. Use skipSend=true to get unsigned transaction.');
    }

    const sdk = this.state.getSdk();
    const assetPubkey = new PublicKey(input.agentId);

    // Build feedback file object
    const feedbackFile = {
      score: input.score,
      tag1: input.tag1,
      tag2: input.tag2,
      endpoint: input.endpoint,
      feedbackUri: input.feedbackUri ?? '',
      feedbackHash: input.feedbackHash ?? Buffer.alloc(32),
    };

    const result = await sdk.giveFeedback(assetPubkey, feedbackFile, { skipSend });

    if (skipSend) {
      // Return unsigned transaction in base64 format
      if ('transaction' in result && result.transaction) {
        // SDK returns transaction as base64 string when skipSend=true
        const txBase64 = String(result.transaction);
        return {
          unsigned: true,
          transaction: txBase64,
          message: 'Sign this transaction with your wallet and broadcast it to the network.',
        };
      }
      throw new Error('SDK did not return a transaction for skipSend=true');
    }

    // Transaction was sent, return signature
    if ('signature' in result) {
      return {
        unsigned: false,
        signature: result.signature,
      };
    }

    throw new Error('Unexpected SDK response');
  }

  // Mapping helpers
  private mapAgentAccount(id: string, agent: AgentAccount): IAgent {
    const globalId = toGlobalId('sol', id);
    return {
      id,
      globalId,
      chainType: 'solana',
      chainPrefix: 'sol',
      name: agent.nft_name,
      owner: agent.getOwnerPublicKey().toBase58(),
      collection: agent.getCollectionPublicKey().toBase58(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  private mapAgentAccountToSummary(agent: AgentAccount): IAgentSummary {
    const id = agent.getAssetPublicKey().toBase58();
    return {
      id,
      globalId: toGlobalId('sol', id),
      chainType: 'solana',
      chainPrefix: 'sol',
      name: agent.nft_name,
      owner: agent.getOwnerPublicKey().toBase58(),
      collection: agent.getCollectionPublicKey().toBase58(),
    };
  }

  private mapIndexedAgent(agent: IndexedAgent): IAgentSummary {
    return {
      id: agent.asset,
      globalId: toGlobalId('sol', agent.asset),
      chainType: 'solana',
      chainPrefix: 'sol',
      name: agent.nft_name ?? 'Unknown',
      description: undefined,
      image: undefined,
      owner: agent.owner,
      collection: agent.collection ?? undefined,
      trustTier: agent.trust_tier ?? undefined,
      qualityScore: agent.quality_score ?? undefined,
      totalFeedbacks: agent.feedback_count ?? undefined,
    };
  }
}
