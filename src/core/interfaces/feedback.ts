// Feedback interfaces for multi-chain support

export interface IFeedback {
  agentId: string;
  client: string;
  index: bigint;
  score: number;
  comment?: string;
  timestamp: number;
  chainType: 'solana' | 'evm';
}

export interface IFeedbackInput {
  agentId: string;
  score: number;
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
