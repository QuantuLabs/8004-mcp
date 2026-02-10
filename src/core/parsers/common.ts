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
    if (!Number.isInteger(value)) {
      throw invalidParamsError(`Parameter ${fieldName} must be an integer (got ${value})`);
    }
    return BigInt(value);
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
    if (value.startsWith('0x')) {
      return Buffer.from(value.slice(2), 'hex');
    }
    if (value.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(value)) {
      const decoded = Buffer.from(value, 'hex');
      if (decoded.length > 0) {
        return decoded;
      }
    }
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
    let resolved: { chainType: 'solana' | 'evm'; chainPrefix: string; chainId?: string };
    if (chain === 'sol' || chain === 'solana') {
      resolved = { chainType: 'solana', chainPrefix: 'sol' };
    } else if (chain.includes(':')) {
      const [prefix, id] = chain.split(':');
      resolved = {
        chainType: prefix === 'sol' ? 'solana' : 'evm',
        chainPrefix: prefix!,
        chainId: id,
      };
    } else {
      resolved = {
        chainType: 'evm',
        chainPrefix: chain,
      };
    }

    if (chainType && chainType !== resolved.chainType) {
      throw invalidParamsError(
        `Conflicting chain parameters: chain="${chain}" implies ${resolved.chainType}, but chainType="${chainType}"`
      );
    }

    return resolved;
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
    offset: Math.min(Math.max(0, offset), 100000),
  };
}

// Input size limits
const MAX_QUERY_LENGTH = 1000;
const MAX_ARRAY_SIZE = 10000;

export function readStringBounded(
  obj: JsonRecord,
  key: string,
  required: true,
  maxLength?: number
): string;
export function readStringBounded(
  obj: JsonRecord,
  key: string,
  required?: false,
  maxLength?: number
): string | undefined;
export function readStringBounded(
  obj: JsonRecord,
  key: string,
  required = false,
  maxLength = MAX_QUERY_LENGTH
): string | undefined {
  const value = readString(obj, key, required as true);
  if (value !== undefined && value.length > maxLength) {
    throw invalidParamsError(`Parameter ${key} exceeds maximum length of ${maxLength}`);
  }
  return value;
}

export function readArrayBounded(
  obj: JsonRecord,
  key: string,
  required = false,
  maxSize = MAX_ARRAY_SIZE
): unknown[] | undefined {
  const value = readArray(obj, key, required as true);
  if (value !== undefined && value.length > maxSize) {
    throw invalidParamsError(`Parameter ${key} exceeds maximum size of ${maxSize}`);
  }
  return value;
}
