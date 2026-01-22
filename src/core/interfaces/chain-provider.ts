// Chain provider interface for multi-chain support

import type { ChainType, ChainPrefix, IAgent, ISearchParams, ISearchResult } from './agent.js';
import type { IFeedback, IFeedbackInput, IFeedbackQuery, IFeedbackResult } from './feedback.js';
import type { IReputationSummary, ILeaderboardOptions, ILeaderboardResult } from './reputation.js';

export interface IChainConfig {
  chainType: ChainType;
  chainPrefix: ChainPrefix;
  chainId?: string;
  displayName: string;
  rpcUrl: string;
  indexerUrl?: string;
  isDefault?: boolean;
  priority?: number;
}

// Options for write operations
export interface IWriteOptions {
  skipSend?: boolean; // Return unsigned transaction instead of sending
}

// Result when skipSend=true
export interface IUnsignedTransactionResult {
  unsigned: true;
  transaction: string; // Base64-encoded serialized transaction
  message: string; // Human-readable message
}

// Result when transaction is sent
export interface ISignedTransactionResult {
  unsigned: false;
  signature: string; // Transaction signature
}

export type ITransactionResult = IUnsignedTransactionResult | ISignedTransactionResult;

export interface IChainProvider {
  readonly chainType: ChainType;
  readonly chainPrefix: ChainPrefix;
  readonly chainId: string;
  readonly displayName: string;

  // Lifecycle
  initialize(): Promise<void>;
  isReady(): boolean;
  canWrite(): boolean;
  getConfig(): IChainConfig;

  // Agent Operations (Read)
  getAgent(agentId: string): Promise<IAgent | null>;
  agentExists(agentId: string): Promise<boolean>;
  searchAgents(params: ISearchParams): Promise<ISearchResult>;

  // Feedback Operations
  getFeedback(agentId: string, client: string, index: bigint): Promise<IFeedback | null>;
  listFeedbacks(query: IFeedbackQuery): Promise<IFeedbackResult>;

  // Reputation Operations
  getReputationSummary(agentId: string): Promise<IReputationSummary | null>;

  // Optional: Indexer-based operations
  isIndexerAvailable?(): Promise<boolean>;
  getLeaderboard?(options?: ILeaderboardOptions): Promise<ILeaderboardResult>;

  // Optional: Write operations (if canWrite() returns true)
  // Returns transaction result - signature if sent, or unsigned tx if skipSend=true
  giveFeedback?(input: IFeedbackInput, options?: IWriteOptions): Promise<ITransactionResult>;
}

export interface IWritableChainProvider extends IChainProvider {
  giveFeedback(input: IFeedbackInput, options?: IWriteOptions): Promise<ITransactionResult>;
}

export function isWritableProvider(provider: IChainProvider): provider is IWritableChainProvider {
  return provider.canWrite() && typeof provider.giveFeedback === 'function';
}
