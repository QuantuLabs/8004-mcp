// Solana-specific parsers

import { PublicKey, Keypair } from '@solana/web3.js';
import { invalidParamsError } from '../../core/errors/mcp-error.js';
import type { JsonRecord } from '../../core/parsers/common.js';

// PublicKey parsing
export function parsePublicKey(value: unknown, fieldName: string): PublicKey {
  if (!value) {
    throw invalidParamsError(`Missing required parameter: ${fieldName}`);
  }
  if (value instanceof PublicKey) {
    return value;
  }
  if (typeof value !== 'string') {
    throw invalidParamsError(`Parameter ${fieldName} must be a string (base58 public key)`);
  }
  try {
    return new PublicKey(value);
  } catch {
    throw invalidParamsError(`Parameter ${fieldName} is not a valid Solana public key: ${value}`);
  }
}

export function parseOptionalPublicKey(value: unknown, fieldName: string): PublicKey | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  return parsePublicKey(value, fieldName);
}

// Keypair parsing (supports JSON array, hex, base58)
export function parseKeypair(value: unknown, fieldName: string): Keypair {
  if (!value) {
    throw invalidParamsError(`Missing required parameter: ${fieldName}`);
  }

  let secretKey: Uint8Array;

  if (typeof value === 'string') {
    const trimmed = value.trim();

    // JSON array format
    if (trimmed.startsWith('[')) {
      try {
        const arr = JSON.parse(trimmed) as number[];
        secretKey = Uint8Array.from(arr);
      } catch {
        throw invalidParamsError(`Parameter ${fieldName} is not a valid JSON array`);
      }
    }
    // Hex format
    else if (trimmed.startsWith('0x') || (trimmed.length === 128 && /^[0-9a-fA-F]+$/.test(trimmed))) {
      const hex = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed;
      secretKey = Uint8Array.from(Buffer.from(hex, 'hex'));
    }
    // Base58 format
    else {
      try {
        const decoded = Buffer.from(value, 'base64');
        if (decoded.length === 64) {
          secretKey = Uint8Array.from(decoded);
        } else {
          // Try importing as base58
          const keypair = Keypair.fromSecretKey(
            Uint8Array.from(Buffer.from(value, 'base64'))
          );
          return keypair;
        }
      } catch {
        throw invalidParamsError(`Parameter ${fieldName} is not a valid keypair format`);
      }
    }
  } else if (Array.isArray(value)) {
    secretKey = Uint8Array.from(value as number[]);
  } else {
    throw invalidParamsError(`Parameter ${fieldName} must be a string or array`);
  }

  if (secretKey.length !== 64) {
    throw invalidParamsError(`Parameter ${fieldName} must be 64 bytes, got ${secretKey.length}`);
  }

  return Keypair.fromSecretKey(secretKey);
}

// Parse write options for SDK
export function parseWriteOptions(obj: JsonRecord): {
  skipSend?: boolean;
  signer?: Keypair;
  feePayer?: PublicKey;
} {
  const options: {
    skipSend?: boolean;
    signer?: Keypair;
    feePayer?: PublicKey;
  } = {};

  if (obj.skipSend !== undefined) {
    options.skipSend = obj.skipSend === true;
  }

  if (obj.signer !== undefined) {
    options.signer = parseKeypair(obj.signer, 'signer');
  }

  if (obj.feePayer !== undefined) {
    options.feePayer = parsePublicKey(obj.feePayer, 'feePayer');
  }

  return options;
}
