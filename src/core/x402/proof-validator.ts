// x402 Proof of Payment Validator
// Optional on-chain validation of payment proofs

import type { X402ProofOfPayment } from '../interfaces/x402.js';

/**
 * Result of proof validation
 */
export interface ProofValidationResult {
  /** Whether the proof is valid */
  valid: boolean;
  /** Validation method used */
  method: 'rpc' | 'indexer' | 'skip';
  /** Error message if validation failed */
  error?: string;
  /** Transaction details if found */
  details?: {
    blockTime?: number;
    slot?: number;
    fee?: number;
    status: 'confirmed' | 'finalized' | 'processed' | 'unknown';
  };
}

/**
 * Validation options
 */
export interface ValidationOptions {
  /** Require specific confirmation level (Solana) */
  commitment?: 'processed' | 'confirmed' | 'finalized';
  /** Timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Validate a proof of payment (FORMAT ONLY)
 *
 * IMPORTANT: This function only validates the proof format (address formats,
 * transaction hash format, etc.). It does NOT verify the transaction on-chain.
 * On-chain verification would require RPC access and is not currently implemented.
 *
 * For production use, consider verifying proofs on-chain via the respective
 * chain's RPC (e.g., getTransaction on Solana, eth_getTransactionReceipt on EVM).
 */
export async function validateProofFormat(
  proof: X402ProofOfPayment,
  _options: ValidationOptions = {}
): Promise<ProofValidationResult> {
  // Validate format first
  const formatResult = isProofFormatValid(proof);
  if (!formatResult.valid) {
    return {
      valid: false,
      method: 'skip',
      error: `Invalid format: ${formatResult.errors.join(', ')}`,
    };
  }

  // Format is valid, but we haven't verified on-chain
  return {
    valid: true,
    method: 'skip',
    details: {
      status: 'unknown',
    },
  };
}

/**
 * @deprecated Use validateProofFormat instead. This function only validates format,
 * not on-chain presence of the transaction.
 */
export const validateProof = validateProofFormat;

/**
 * Check if a proof looks valid without on-chain validation
 * Fast sanity check for format correctness
 */
export function isProofFormatValid(proof: X402ProofOfPayment): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check fromAddress
  if (!proof.fromAddress) {
    errors.push('Missing fromAddress');
  } else {
    const isEvmAddress =
      proof.fromAddress.startsWith('0x') && proof.fromAddress.length === 42;
    const isSolanaAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(
      proof.fromAddress
    );
    if (!isEvmAddress && !isSolanaAddress) {
      errors.push('Invalid fromAddress format');
    }
  }

  // Check toAddress
  if (!proof.toAddress) {
    errors.push('Missing toAddress');
  } else {
    const isEvmAddress =
      proof.toAddress.startsWith('0x') && proof.toAddress.length === 42;
    const isSolanaAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(
      proof.toAddress
    );
    if (!isEvmAddress && !isSolanaAddress) {
      errors.push('Invalid toAddress format');
    }
  }

  // Check chainId
  if (!proof.chainId) {
    errors.push('Missing chainId');
  }

  // Check txHash
  if (!proof.txHash) {
    errors.push('Missing txHash');
  } else {
    const isEvmTxHash =
      proof.txHash.startsWith('0x') && proof.txHash.length === 66;
    const isSolanaSig = /^[1-9A-HJ-NP-Za-km-z]{87,88}$/.test(proof.txHash);
    if (!isEvmTxHash && !isSolanaSig) {
      errors.push('Invalid txHash format');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Detect chain type from proof format
 */
export function getChainTypeFromProof(
  proof: X402ProofOfPayment
): 'solana' | 'evm' | 'unknown' {
  // Check address format
  const hasEvmAddresses =
    proof.fromAddress.startsWith('0x') || proof.toAddress.startsWith('0x');
  const hasEvmTxHash = proof.txHash.startsWith('0x');

  if (hasEvmAddresses || hasEvmTxHash) {
    return 'evm';
  }

  // Check if looks like Solana (base58)
  const isSolanaLike =
    /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(proof.fromAddress) &&
    /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(proof.toAddress);

  if (isSolanaLike) {
    return 'solana';
  }

  return 'unknown';
}
