// x402 Protocol Interfaces for 8004-reputation extension
// Spec: https://github.com/coinbase/x402/issues/931

import type { ChainType } from './agent.js';

// CAIP-2 Network Identifiers
// EVM: eip155:<chainId> (e.g., eip155:8453 for Base)
// Solana Mainnet: solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp
// Solana Devnet:  solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1
export const SOLANA_GENESIS_HASHES = {
  mainnet: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  devnet: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
  testnet: '4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z',
} as const;

/**
 * Agent identity for x402 PaymentRequired responses
 * Format follows CAIP-2 for registry addresses
 */
export interface X402AgentIdentity {
  /**
   * Registry address in CAIP-2 format
   * EVM: "eip155:<chainId>:<address>" (e.g., "eip155:8453:0x1234...")
   * Solana: "solana:<genesisHash>:<programId>" (e.g., "solana:EtWTRA...:HHCVWc...")
   */
  agentRegistry: string;

  /**
   * Agent identifier
   * EVM: Token ID (e.g., "123")
   * Solana: Asset public key (base58)
   */
  agentId: string;
}

/**
 * Proof of payment from x402 settlement
 * Used to link feedback to actual payment transactions
 */
export interface X402ProofOfPayment {
  /**
   * Payer address
   * EVM: Hex address (0x...)
   * Solana: Base58 public key
   */
  fromAddress: string;

  /**
   * Payee address
   * EVM: Hex address (0x...)
   * Solana: Base58 public key
   */
  toAddress: string;

  /**
   * Chain identifier
   * EVM: Chain ID string (e.g., "8453" for Base)
   * Solana: Genesis hash (e.g., "EtWTRABZaYq6iMfeYKouRu166VU2xqa1")
   */
  chainId: string;

  /**
   * Transaction hash/signature
   * EVM: Hex transaction hash (0x...)
   * Solana: Base58 transaction signature
   */
  txHash: string;
}

/**
 * Settlement result from x402 payment flow
 * Enriched information about the completed payment
 */
export interface X402Settlement {
  /** Whether the settlement succeeded */
  success: boolean;

  /** Transaction hash/signature (same as ProofOfPayment.txHash) */
  transaction: string;

  /** Network in CAIP-2 format (e.g., "eip155:8453" or "solana:EtWTRA...") */
  network: string;

  /** Settlement timestamp in ISO 8601 format */
  settledAt: string;
}

/**
 * x402 tag conventions for feedback categorization
 */
export const X402_TAGS = {
  // Client → Server (tag1) - delivery status
  CLIENT_TAGS: {
    RESOURCE_DELIVERED: 'x402-resource-delivered',
    DELIVERY_FAILED: 'x402-delivery-failed',
    DELIVERY_TIMEOUT: 'x402-delivery-timeout',
    QUALITY_ISSUE: 'x402-quality-issue',
  },

  // Server → Client (tag1) - payment status
  SERVER_TAGS: {
    GOOD_PAYER: 'x402-good-payer',
    PAYMENT_FAILED: 'x402-payment-failed',
    INSUFFICIENT_FUNDS: 'x402-insufficient-funds',
  },

  // Network types (tag2)
  NETWORK_TAGS: {
    EVM: 'exact-evm',
    SVM: 'exact-svm',
  },
} as const;

/**
 * Feedback file structure for IPFS storage
 * Conforms to x402 8004-reputation spec
 */
export interface X402FeedbackFile {
  /** Registry in CAIP-2 format */
  agentRegistry: string;

  /** Agent ID (token ID or pubkey) */
  agentId: string;

  /** Client address in CAIP-2 format (e.g., "solana:EtWTRA...:ClientPubkey...") */
  clientAddress: string;

  /** Feedback creation timestamp (ISO 8601) */
  createdAt: string;

  /** Raw metric value (serialized as string for JSON compatibility) */
  value: string;

  /** Decimal precision (0-6), default 0 */
  valueDecimals?: number;

  /** Feedback score (0-100), optional */
  score?: number;

  /** Primary tag - delivery/payment status */
  tag1: string;

  /** Secondary tag - network type */
  tag2: string;

  /** Agent endpoint that was called */
  endpoint?: string;

  /** Proof of payment linking feedback to transaction */
  proofOfPayment: X402ProofOfPayment;

  /** Optional enriched settlement information */
  x402Settlement?: X402Settlement;

  /** Optional comment */
  comment?: string;
}

/**
 * Input for x402_feedback_submit tool
 */
export interface X402FeedbackSubmitInput {
  /** Agent ID (global format like sol:xxx or chain:chainId:tokenId) */
  agentId: string;

  /** Raw metric value (required) */
  value: bigint | number;

  /** Decimal precision (0-6), default 0 */
  valueDecimals?: number;

  /** Feedback score (0-100), optional */
  score?: number;

  /** Primary tag (delivery/payment status) */
  tag1: string;

  /** Secondary tag (network type) */
  tag2: string;

  /** Agent endpoint that was called */
  endpoint?: string;

  /** Proof of payment */
  proofOfPayment: X402ProofOfPayment;

  /** Optional settlement info */
  x402Settlement?: X402Settlement;

  /** Optional comment */
  comment?: string;

  /** Validate proof on-chain (default: false) */
  validateProof?: boolean;

  /** Store feedback on IPFS (default: true) */
  storeOnIpfs?: boolean;

  /** Return unsigned transaction (default: false) */
  skipSend?: boolean;

  /** Signer public key if skipSend=true */
  signer?: string;

  /** Chain override (optional if using global ID) */
  chain?: string;
}

/**
 * Result from x402_feedback_submit when transaction is signed and sent
 */
export interface X402FeedbackSubmitSignedResult {
  unsigned: false;
  signature: string;
  feedbackFileHash: string;
  feedbackUri?: string;
  agentId: string;
  value: string;
  valueDecimals: number;
  score?: number;
  tag1: string;
  tag2: string;
}

/**
 * Result from x402_feedback_submit when skipSend=true (unsigned)
 */
export interface X402FeedbackSubmitUnsignedResult {
  unsigned: true;
  /** Base64 serialized transaction (Solana) or transaction object (EVM) */
  unsignedTx: string | X402EvmUnsignedTx;
  feedbackFileHash: string;
  feedbackUri?: string;
  feedbackFile: X402FeedbackFile;
  message: string;
  hint: string;
}

/**
 * EVM unsigned transaction object for external wallet signing
 */
export interface X402EvmUnsignedTx {
  to: string;
  data: string;
  chainId: number;
  value: string;
}

export type X402FeedbackSubmitResult =
  | X402FeedbackSubmitSignedResult
  | X402FeedbackSubmitUnsignedResult;

/**
 * Helper to build CAIP-2 network identifier
 */
export function buildCaip2Network(
  chainType: ChainType,
  chainId: string | number
): string {
  if (chainType === 'solana') {
    // chainId is cluster name, map to genesis hash
    const cluster = String(chainId).toLowerCase();
    const genesisHash =
      SOLANA_GENESIS_HASHES[cluster as keyof typeof SOLANA_GENESIS_HASHES] ??
      SOLANA_GENESIS_HASHES.devnet;
    return `solana:${genesisHash}`;
  }
  // EVM
  return `eip155:${chainId}`;
}

/**
 * Helper to build agent registry CAIP-2 identifier
 * @throws Error if registryAddress is undefined/empty (chain not deployed)
 */
export function buildRegistryIdentifier(
  chainType: ChainType,
  chainId: string | number,
  registryAddress: string | undefined
): string {
  if (!registryAddress) {
    throw new Error(`Registry not deployed for chain ${chainType}:${chainId}`);
  }
  const network = buildCaip2Network(chainType, chainId);
  return `${network}:${registryAddress}`;
}

/**
 * Helper to build client address CAIP-2 identifier
 */
export function buildClientAddress(
  chainType: ChainType,
  chainIdOrCluster: string | number,
  address: string
): string {
  const network = buildCaip2Network(chainType, chainIdOrCluster);
  return `${network}:${address}`;
}

/**
 * Convert X402FeedbackFile to a plain JSON-serializable object
 */
export function feedbackFileToRecord(file: X402FeedbackFile): Record<string, unknown> {
  return {
    agentRegistry: file.agentRegistry,
    agentId: file.agentId,
    clientAddress: file.clientAddress,
    createdAt: file.createdAt,
    value: file.value,
    valueDecimals: file.valueDecimals,
    score: file.score,
    tag1: file.tag1,
    tag2: file.tag2,
    endpoint: file.endpoint,
    proofOfPayment: file.proofOfPayment,
    x402Settlement: file.x402Settlement,
    comment: file.comment,
  };
}

/**
 * Parse CAIP-2 network identifier
 */
export function parseCaip2Network(network: string): {
  namespace: 'eip155' | 'solana';
  reference: string;
} | null {
  const parts = network.split(':');
  if (parts.length !== 2) return null;
  const namespace = parts[0];
  const reference = parts[1];
  if (namespace !== 'eip155' && namespace !== 'solana') return null;
  if (!reference) return null;
  return { namespace: namespace as 'eip155' | 'solana', reference };
}

/**
 * Get chain type from network tag
 */
export function getChainTypeFromNetworkTag(
  tag: string
): ChainType | undefined {
  if (tag === X402_TAGS.NETWORK_TAGS.SVM) return 'solana';
  if (tag === X402_TAGS.NETWORK_TAGS.EVM) return 'evm';
  return undefined;
}

/**
 * Get network tag for chain type
 */
export function getNetworkTagForChainType(chainType: ChainType): string {
  return chainType === 'solana'
    ? X402_TAGS.NETWORK_TAGS.SVM
    : X402_TAGS.NETWORK_TAGS.EVM;
}
