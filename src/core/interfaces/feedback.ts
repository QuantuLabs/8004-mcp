// Feedback interfaces for multi-chain support

export interface IFeedback {
  agentId: string;
  client: string;
  index: bigint;
  /** Raw value (may not be available when reading from chain) */
  value?: bigint;
  /** Value decimals (may not be available when reading from chain) */
  valueDecimals?: number;
  /** Calculated score (0-100) */
  score: number | null;
  tag1?: string;
  tag2?: string;
  endpoint?: string;
  comment?: string;
  timestamp: number;
  chainType: 'solana' | 'evm';
}

export interface IFeedbackInput {
  agentId: string;
  value: bigint | number;
  valueDecimals?: number;
  score?: number;
  comment?: string;
  tag1?: string;
  tag2?: string;
  endpoint?: string;
  feedbackUri?: string;
  feedbackHash?: Buffer;
}

export interface IFeedbackQuery {
  agentId: string;
  client?: string;
  minScore?: number;
  maxScore?: number;
  includeRevoked?: boolean;
  limit?: number;
  offset?: number;
  orderBy?: 'timestamp' | 'score';
  orderDir?: 'asc' | 'desc';
}

export interface IFeedbackResult {
  feedbacks: IFeedback[];
  total: number;
  hasMore: boolean;
}
