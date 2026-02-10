// Common serializers for MCP output

export function serialize(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  // Handle PublicKey-like objects (Solana)
  if (
    typeof value === 'object' &&
    'toBase58' in value &&
    typeof (value as { toBase58: () => string }).toBase58 === 'function'
  ) {
    return (value as { toBase58: () => string }).toBase58();
  }

  // Handle Buffer and Uint8Array
  if (Buffer.isBuffer(value)) {
    return value.toString('base64');
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString('base64');
  }

  // Handle BigInt
  if (typeof value === 'bigint') {
    return value.toString();
  }

  // Handle Date
  if (value instanceof Date) {
    return value.toISOString();
  }

  // Handle Map
  if (value instanceof Map) {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of value) {
      obj[String(k)] = serialize(v);
    }
    return obj;
  }

  // Handle Set
  if (value instanceof Set) {
    return Array.from(value).map(serialize);
  }

  // Handle Array
  if (Array.isArray(value)) {
    return value.map(serialize);
  }

  // Handle plain objects
  if (typeof value === 'object') {
    const obj: Record<string, unknown> = Object.create(null);
    for (const [k, v] of Object.entries(value)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      obj[k] = serialize(v);
    }
    return obj;
  }

  // Primitives pass through
  return value;
}

export function formatOutput(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(serialize(value), null, 2);
  } catch {
    // Fallback for circular references or other serialization errors
    const seen = new WeakSet();
    return JSON.stringify(value, (_key, val) => {
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val)) return '[Circular]';
        seen.add(val);
      }
      if (typeof val === 'bigint') return val.toString();
      return val;
    }, 2);
  }
}

// Format for MCP content response
export function toMcpContent(value: unknown): Array<{ type: 'text'; text: string }> {
  return [{ type: 'text', text: formatOutput(value) }];
}

// Success response helper
export function successResponse(data: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return { content: toMcpContent(data) };
}

// Error response helper
export function errorResponse(error: unknown): { content: Array<{ type: 'text'; text: string }>; isError: true } {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,
  };
}
