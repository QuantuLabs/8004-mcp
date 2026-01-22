// Common parsers for tool arguments

import { invalidParamsError } from '../errors/mcp-error.js';

export type JsonRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getArgs(args: unknown): JsonRecord {
  if (!isRecord(args)) {
    throw invalidParamsError('Arguments must be an object');
  }
  return args;
}

// Primitive readers
export function readString(
  obj: JsonRecord,
  key: string,
  required: true
): string;
export function readString(
  obj: JsonRecord,
  key: string,
  required?: false
): string | undefined;
export function readString(
  obj: JsonRecord,
  key: string,
  required = false
): string | undefined {
  const value = obj[key];
  if (value === undefined || value === null) {
    if (required) {
      throw invalidParamsError(`Missing required parameter: ${key}`);
    }
    return undefined;
  }
  if (typeof value !== 'string') {
    throw invalidParamsError(`Parameter ${key} must be a string`);
  }
  return value;
}

// Alias for optional string (more readable)
export function readStringOptional(obj: JsonRecord, key: string): string | undefined {
  return readString(obj, key, false);
}

export function readNumber(
  obj: JsonRecord,
  key: string,
  required: true
): number;
export function readNumber(
  obj: JsonRecord,
  key: string,
  required?: false
): number | undefined;
export function readNumber(
  obj: JsonRecord,
  key: string,
  required = false
): number | undefined {
  const value = obj[key];
  if (value === undefined || value === null) {
    if (required) {
      throw invalidParamsError(`Missing required parameter: ${key}`);
    }
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw invalidParamsError(`Parameter ${key} must be a finite number`);
  }
  return value;
}

export function readBoolean(
  obj: JsonRecord,
  key: string,
  required: true
): boolean;
export function readBoolean(
  obj: JsonRecord,
  key: string,
  required?: false
): boolean | undefined;
export function readBoolean(
  obj: JsonRecord,
  key: string,
  required = false
): boolean | undefined {
  const value = obj[key];
  if (value === undefined || value === null) {
    if (required) {
      throw invalidParamsError(`Missing required parameter: ${key}`);
    }
    return undefined;
  }
  if (typeof value !== 'boolean') {
    throw invalidParamsError(`Parameter ${key} must be a boolean`);
  }
  return value;
}

export function readRecord(
  obj: JsonRecord,
  key: string,
  required: true
): JsonRecord;
export function readRecord(
  obj: JsonRecord,
  key: string,
  required?: false
): JsonRecord | undefined;
export function readRecord(
  obj: JsonRecord,
  key: string,
  required = false
): JsonRecord | undefined {
  const value = obj[key];
  if (value === undefined || value === null) {
    if (required) {
      throw invalidParamsError(`Missing required parameter: ${key}`);
    }
    return undefined;
  }
  if (!isRecord(value)) {
    throw invalidParamsError(`Parameter ${key} must be an object`);
  }
  return value;
}

export function readStringArray(
  obj: JsonRecord,
  key: string,
  required: true
): string[];
export function readStringArray(
  obj: JsonRecord,
  key: string,
  required?: false
): string[] | undefined;
export function readStringArray(
  obj: JsonRecord,
  key: string,
  required = false
): string[] | undefined {
  const value = obj[key];
  if (value === undefined || value === null) {
    if (required) {
      throw invalidParamsError(`Missing required parameter: ${key}`);
    }
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw invalidParamsError(`Parameter ${key} must be an array`);
  }
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== 'string') {
      throw invalidParamsError(`Parameter ${key}[${i}] must be a string`);
    }
  }
  return value as string[];
}

export function readArray(
  obj: JsonRecord,
  key: string,
  required: true
): unknown[];
export function readArray(
  obj: JsonRecord,
  key: string,
  required?: false
): unknown[] | undefined;
export function readArray(
  obj: JsonRecord,
  key: string,
  required = false
): unknown[] | undefined {
  const value = obj[key];
  if (value === undefined || value === null) {
    if (required) {
      throw invalidParamsError(`Missing required parameter: ${key}`);
    }
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw invalidParamsError(`Parameter ${key} must be an array`);
  }
  return value;
}

// BigInt parser
export function parseBigIntInput(
  value: unknown,
  fieldName: string
): bigint {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw invalidParamsError(`Parameter ${fieldName} must be a finite number`);
    }
    return BigInt(Math.floor(value));
  }
  if (typeof value === 'string') {
    try {
      return BigInt(value);
    } catch {
      throw invalidParamsError(`Parameter ${fieldName} is not a valid BigInt string`);
    }
  }
  throw invalidParamsError(`Parameter ${fieldName} must be a number, string, or bigint`);
}

// Buffer parser
export function parseBuffer(
  value: unknown,
  fieldName: string
): Buffer {
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }
  if (typeof value === 'string') {
    // Try hex first
    if (value.startsWith('0x')) {
      return Buffer.from(value.slice(2), 'hex');
    }
    // Check if it looks like hex (even length, all hex chars)
    if (value.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(value)) {
      return Buffer.from(value, 'hex');
    }
    // Otherwise, assume base64
    return Buffer.from(value, 'base64');
  }
  if (Array.isArray(value)) {
    return Buffer.from(value as number[]);
  }
  if (isRecord(value) && 'data' in value) {
    const encoding = (value.encoding as string) ?? 'base64';
    return Buffer.from(value.data as string, encoding as BufferEncoding);
  }
  throw invalidParamsError(`Parameter ${fieldName} must be a Buffer, string, or array`);
}

// Chain parameter parsing
export function parseChainParam(
  obj: JsonRecord
): { chainType?: 'solana' | 'evm'; chainPrefix?: string; chainId?: string } {
  const chain = readString(obj, 'chain');
  const chainType = readString(obj, 'chainType') as 'solana' | 'evm' | undefined;

  if (!chain && !chainType) {
    return {};
  }

  // Parse chain parameter (can be prefix or full chain ID)
  if (chain) {
    if (chain === 'sol' || chain === 'solana') {
      return { chainType: 'solana', chainPrefix: 'sol' };
    }
    if (chain.includes(':')) {
      const [prefix, id] = chain.split(':');
      return {
        chainType: prefix === 'sol' ? 'solana' : 'evm',
        chainPrefix: prefix,
        chainId: id,
      };
    }
    return {
      chainType: 'evm',
      chainPrefix: chain,
    };
  }

  return { chainType };
}

// Pagination parsing
export function parsePagination(
  obj: JsonRecord,
  defaults?: { limit?: number; offset?: number }
): { limit: number; offset: number } {
  const limit = readNumber(obj, 'limit') ?? defaults?.limit ?? 20;
  const offset = readNumber(obj, 'offset') ?? defaults?.offset ?? 0;
  return {
    limit: Math.min(Math.max(1, limit), 100),
    offset: Math.max(0, offset),
  };
}
