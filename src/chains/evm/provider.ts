// EVM chain provider implementation with agent0-sdk

import { encodeFunctionData, formatUnits } from 'viem';
import {
  SDK as Agent0SDK,
  SubgraphClient,
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
  private _subgraph?: SubgraphClient;

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

  // Get subgraph client for direct GraphQL queries (faster reads, no RPC)
  private getSubgraph(): SubgraphClient | undefined {
    if (!this.config.subgraphUrl) return undefined;
    if (!this._subgraph) {
      this._subgraph = new SubgraphClient(this.config.subgraphUrl);
    }
    return this._subgraph;
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
      console.warn('EVMChainProvider.getAgent error:', err);
      return null;
    }
  }

  async agentExists(agentId: string): Promise<boolean> {
    const agent = await this.getAgent(agentId);
    return agent !== null;
  }

  async searchAgents(params: ISearchParams): Promise<ISearchResult> {
    const limit = params.limit ?? 20;
    const offset = params.offset ?? 0;

    // Determine the name query to use based on search mode
    const mode = params.searchMode ?? 'all';
    let nameFilter = params.nameQuery ?? params.query;

    // For description mode, use descriptionQuery if provided
    if (mode === 'description' && params.descriptionQuery) {
      nameFilter = params.descriptionQuery;
    }

    // Endpoint search: filter by mcp/a2a capabilities (AgentSummary doesn't have endpoint URLs)
    // endpointQuery can match against mcpTools, a2aSkills, or require mcp/a2a support
    const endpointFilter = (mode === 'endpoint' || mode === 'all') ? params.endpointQuery : undefined;

    try {
      // Prefer subgraph for reads (faster, no RPC calls)
      const subgraph = this.getSubgraph();
      if (subgraph) {
        // Fetch more if we need to filter client-side
        const fetchLimit = endpointFilter ? Math.min(limit * 3, 100) : limit;
        const agents = await subgraph.searchAgents(
          {
            owners: params.owner ? [params.owner as `0x${string}`] : undefined,
            name: nameFilter,
            // Advanced SDK filters
            mcpTools: params.mcpTools,
            a2aSkills: params.a2aSkills,
            active: params.active,
            x402support: params.x402support,
            mcp: params.hasMcp,
            a2a: params.hasA2a,
          },
          fetchLimit,
          offset
        );

        // Apply client-side filtering if needed
        let filteredAgents = agents;
        if (endpointFilter) {
          const lowerEndpoint = endpointFilter.toLowerCase();
          filteredAgents = agents.filter((a: AgentSummary) => {
            // Search in mcpTools, a2aSkills, mcpPrompts, mcpResources
            const allCapabilities = [
              ...(a.mcpTools ?? []),
              ...(a.a2aSkills ?? []),
              ...(a.mcpPrompts ?? []),
              ...(a.mcpResources ?? []),
            ];
            // Also match if looking for mcp/a2a support
            if (lowerEndpoint === 'mcp' && a.mcp) return true;
            if (lowerEndpoint === 'a2a' && a.a2a) return true;
            return allCapabilities.some(cap =>
              cap.toLowerCase().includes(lowerEndpoint)
            );
          });
        }

        // Apply limit after filtering
        const paginatedAgents = filteredAgents.slice(0, limit);

        return {
          results: paginatedAgents.map((a: AgentSummary) => ({
            id: a.agentId,
            globalId: toGlobalId(this.chainPrefix, a.agentId, String(this.config.chainId)),
            chainType: 'evm' as const,
            chainPrefix: this.chainPrefix,
            name: a.name ?? `Agent #${a.agentId}`,
            owner: a.owners?.[0] ?? '',
            // Include capability flags for better search results
            mcp: a.mcp,
            a2a: a.a2a,
          })),
          total: filteredAgents.length,
          hasMore: filteredAgents.length > limit,
          offset,
          limit,
        };
      }

      // Fallback to SDK (may use RPC)
      const sdk = this.getSdk();

      // SDK uses cursor-based pagination. When cursor is provided, use it directly
      // for efficient O(1) pagination. Without cursor, offset requires O(N) iteration.
      if (params.cursor) {
        // Efficient path: use provided cursor directly
        const results = await sdk.searchAgents(
          {
            owners: params.owner ? [params.owner] : undefined,
            name: nameFilter,
            // Advanced SDK filters
            mcpTools: params.mcpTools,
            a2aSkills: params.a2aSkills,
            active: params.active,
            x402support: params.x402support,
            mcp: params.hasMcp,
            a2a: params.hasA2a,
          },
          {
            pageSize: limit,
            cursor: params.cursor,
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
          offset,
          limit,
          cursor: results.nextCursor, // Return cursor for next page
        };
      }

      // Legacy path: offset-based pagination (O(N) for large offsets)
      // Warning logged for deep offsets to encourage cursor usage
      if (offset > 100) {
        console.warn(
          `[EVMChainProvider] Large offset (${offset}) with SDK pagination is O(N). ` +
          `Use cursor-based pagination for better performance.`
        );
      }

      let cursor: string | undefined;
      let allItems: AgentSummary[] = [];

      // Fetch pages until we have enough items to satisfy offset + limit
      do {
        const results = await sdk.searchAgents(
          {
            owners: params.owner ? [params.owner] : undefined,
            name: nameFilter,
            // Advanced SDK filters
            mcpTools: params.mcpTools,
            a2aSkills: params.a2aSkills,
            active: params.active,
            x402support: params.x402support,
            mcp: params.hasMcp,
            a2a: params.hasA2a,
          },
          {
            pageSize: Math.min(100, limit + offset), // Fetch more to handle offset
            cursor,
          }
        );

        allItems = allItems.concat(results.items);
        cursor = results.nextCursor;

        // If we have enough items or no more pages, stop
        if (allItems.length >= offset + limit || !cursor) {
          break;
        }
      } while (cursor);

      // Apply offset by slicing
      const paginatedItems = allItems.slice(offset, offset + limit);

      return {
        results: paginatedItems.map((a: AgentSummary) => ({
          id: a.agentId,
          globalId: toGlobalId(this.chainPrefix, a.agentId, String(this.config.chainId)),
          chainType: 'evm' as const,
          chainPrefix: this.chainPrefix,
          name: a.name ?? `Agent #${a.agentId}`,
          owner: a.owners?.[0] ?? '',
        })),
        total: allItems.length,
        hasMore: allItems.length > offset + limit || !!cursor,
        offset,
        limit,
        cursor, // Return cursor for efficient next-page fetching
      };
    } catch (err) {
      console.warn('EVMChainProvider.searchAgents error:', err);
      return {
        results: [],
        total: 0,
        hasMore: false,
        offset,
        limit,
      };
    }
  }

  // Feedback Operations
  async getFeedback(agentId: string, client: string, index: bigint): Promise<IFeedback | null> {
    try {
      const sdk = this.getSdk();
      const feedback = await sdk.getFeedback(agentId, client as `0x${string}`, Number(index));
      if (!feedback) return null;

      // ERC-8004 EVM: SDK returns decoded value (no raw value/decimals exposed separately)
      // Score field does not exist on EVM per spec - only value/valueDecimals on-chain
      return {
        agentId,
        client,
        index,
        // SDK returns decoded value as number - raw encoding not available from SDK
        value: undefined,
        valueDecimals: undefined,
        // No score field on EVM per ERC-8004 spec
        score: null,
        tag1: feedback.tags?.[0],
        tag2: feedback.tags?.[1],
        endpoint: feedback.endpoint,
        comment: feedback.text,
        timestamp: feedback.createdAt ?? Date.now(),
        chainType: 'evm',
      };
    } catch (err) {
      console.warn('EVMChainProvider.getFeedback error:', err);
      return null;
    }
  }

  async listFeedbacks(query: IFeedbackQuery): Promise<IFeedbackResult> {
    try {
      // Prefer subgraph for reads (faster, no RPC calls)
      const subgraph = this.getSubgraph();
      if (subgraph) {
        const feedbacks = await subgraph.searchFeedback(
          {
            agents: [query.agentId],
            reviewers: query.client ? [query.client as `0x${string}`] : undefined,
            includeRevoked: query.includeRevoked,
          },
          query.limit ?? 20,
          query.offset ?? 0
        );

        return {
          feedbacks: feedbacks.map((f: Record<string, unknown>) => ({
            agentId: String(f.agentId ?? query.agentId),
            client: String(f.reviewer ?? ''),
            index: BigInt(typeof f.index === 'number' || typeof f.index === 'string' ? f.index : 0),
            value: undefined,
            valueDecimals: undefined,
            score: null,
            tag1: (f.tags as string[])?.[0],
            tag2: (f.tags as string[])?.[1],
            endpoint: f.endpoint as string | undefined,
            comment: f.text as string | undefined,
            timestamp: Number(f.createdAt ?? Date.now()),
            chainType: 'evm' as const,
          })),
          total: feedbacks.length,
          hasMore: feedbacks.length === (query.limit ?? 20),
        };
      }

      // Fallback to SDK (may use RPC)
      const sdk = this.getSdk();
      const feedbacks = await sdk.searchFeedback({
        agentId: query.agentId,
        reviewers: query.client ? [query.client as `0x${string}`] : undefined,
        includeRevoked: query.includeRevoked,
      });

      return {
        feedbacks: feedbacks.map((f: Feedback) => {
          // ERC-8004 EVM: SDK returns decoded value (no raw value/decimals exposed separately)
          // Score field does not exist on EVM per spec - only value/valueDecimals on-chain
          return {
            agentId: f.agentId,
            client: f.reviewer,
            index: BigInt(f.id[2]),
            // SDK returns decoded value as number - raw encoding not available from SDK
            value: undefined,
            valueDecimals: undefined,
            // No score field on EVM per ERC-8004 spec
            score: null,
            tag1: f.tags?.[0],
            tag2: f.tags?.[1],
            endpoint: f.endpoint,
            comment: f.text,
            timestamp: f.createdAt ?? Date.now(),
            chainType: 'evm' as const,
          };
        }),
        total: feedbacks.length,
        hasMore: false, // searchFeedback doesn't support pagination yet
      };
    } catch (err) {
      console.warn('EVMChainProvider.listFeedbacks error:', err);
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
    const value = typeof input.value === 'bigint' ? input.value : BigInt(input.value);
    const valueDecimals = input.valueDecimals ?? 0;
    const tag1 = input.tag1 ?? '';
    const tag2 = input.tag2 ?? '';
    const endpoint = input.endpoint ?? '';
    const feedbackUri = input.feedbackUri ?? '';
    // EVM contract ABI uses feedbackHash, but interface now uses feedbackFileHash
    const feedbackHash = input.feedbackFileHash
      ? (typeof input.feedbackFileHash === 'string' ? input.feedbackFileHash : `0x${Buffer.from(input.feedbackFileHash).toString('hex')}`)
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

    // agent0-sdk uses encodeReputationValue() internally which expects a decimal string
    // Convert our raw value/valueDecimals back to decimal format for SDK encoding
    // Example: value=9977n, valueDecimals=2 → "99.77"
    const decimalValue = this.rawToDecimalString(value, valueDecimals);

    const result = await sdk.giveFeedback(
      input.agentId,
      decimalValue,
      input.tag1,
      input.tag2,
      input.endpoint,
      input.feedbackUri ? { text: input.comment } : undefined
    );

    return {
      unsigned: false,
      signature: result.hash,
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
      console.warn('EVMChainProvider.getReputationSummary error:', err);
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

  /**
   * Convert raw value with decimals back to decimal string for SDK encoding
   * Example: value=9977n, valueDecimals=2 → "99.77"
   * The SDK's encodeReputationValue() expects decimal strings and will re-encode correctly
   */
  private rawToDecimalString(value: bigint, valueDecimals: number): string {
    return formatUnits(value, valueDecimals);
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
