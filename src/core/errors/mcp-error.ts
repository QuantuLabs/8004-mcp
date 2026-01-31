// MCP error hierarchy

export enum McpErrorCode {
  // General errors (1xxx)
  UNKNOWN = 1000,
  INTERNAL = 1001,
  INVALID_PARAMS = 1002,
  NOT_FOUND = 1003,
  TIMEOUT = 1004,

  // Chain errors (2xxx)
  CHAIN_NOT_INITIALIZED = 2000,
  CHAIN_NOT_FOUND = 2001,
  CHAIN_NOT_READY = 2002,
  CHAIN_WRITE_DISABLED = 2003,
  CHAIN_CONNECTION_FAILED = 2004,

  // Agent errors (3xxx)
  AGENT_NOT_FOUND = 3000,
  AGENT_INVALID_ID = 3001,
  AGENT_PARSE_ERROR = 3002,

  // Feedback errors (4xxx)
  FEEDBACK_NOT_FOUND = 4000,
  FEEDBACK_INVALID_SCORE = 4001,
  FEEDBACK_SUBMIT_FAILED = 4002,

  // Cache errors (5xxx)
  CACHE_INIT_FAILED = 5000,
  CACHE_QUERY_FAILED = 5001,
  CACHE_SYNC_FAILED = 5002,

  // Indexer errors (6xxx)
  INDEXER_NOT_AVAILABLE = 6000,
  INDEXER_QUERY_FAILED = 6001,

  // Config errors (7xxx)
  CONFIG_INVALID = 7000,
  CONFIG_MISSING_REQUIRED = 7001,

  // Wallet errors (8xxx)
  WALLET_ERROR = 8000,
  WALLET_NOT_FOUND = 8001,
  WALLET_LOCKED = 8002,
  WALLET_INVALID_PASSWORD = 8003,
}

export class McpError extends Error {
  public readonly code: McpErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(code: McpErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'McpError';
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, McpError.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }

  static isNotFound(error: unknown): boolean {
    return error instanceof McpError && (
      error.code === McpErrorCode.NOT_FOUND ||
      error.code === McpErrorCode.AGENT_NOT_FOUND ||
      error.code === McpErrorCode.FEEDBACK_NOT_FOUND ||
      error.code === McpErrorCode.CHAIN_NOT_FOUND
    );
  }
}

// Convenience error factories
export function notFoundError(resource: string, id: string): McpError {
  return new McpError(
    McpErrorCode.NOT_FOUND,
    `${resource} not found: ${id}`,
    { resource, id }
  );
}

export function invalidParamsError(message: string, params?: Record<string, unknown>): McpError {
  return new McpError(
    McpErrorCode.INVALID_PARAMS,
    message,
    params
  );
}

export function chainNotReadyError(chainId: string): McpError {
  return new McpError(
    McpErrorCode.CHAIN_NOT_READY,
    `Chain not ready: ${chainId}`,
    { chainId }
  );
}

export function chainNotFoundError(chainId: string): McpError {
  return new McpError(
    McpErrorCode.CHAIN_NOT_FOUND,
    `Chain not found: ${chainId}`,
    { chainId }
  );
}

export function agentNotFoundError(agentId: string): McpError {
  return new McpError(
    McpErrorCode.AGENT_NOT_FOUND,
    `Agent not found: ${agentId}`,
    { agentId }
  );
}

export function indexerNotAvailableError(chainId: string): McpError {
  return new McpError(
    McpErrorCode.INDEXER_NOT_AVAILABLE,
    `Indexer not available for chain: ${chainId}`,
    { chainId }
  );
}

export function walletError(message: string, details?: Record<string, unknown>): McpError {
  return new McpError(
    McpErrorCode.WALLET_ERROR,
    message,
    details
  );
}

/**
 * Wrap a handler function with error handling
 * Converts unexpected errors to McpError with sanitized message
 */
export function wrapHandler<T>(
  handler: (args: unknown) => Promise<T>,
  context: string
): (args: unknown) => Promise<T> {
  return async (args: unknown): Promise<T> => {
    try {
      return await handler(args);
    } catch (error) {
      // Re-throw McpError as-is
      if (error instanceof McpError) {
        throw error;
      }

      // Convert known error types
      if (error instanceof Error) {
        // Check for common wallet-related errors
        const msg = error.message.toLowerCase();
        if (msg.includes('wallet') && msg.includes('not found')) {
          throw new McpError(McpErrorCode.WALLET_NOT_FOUND, error.message);
        }
        if (msg.includes('invalid password') || msg.includes('wrong password')) {
          throw new McpError(McpErrorCode.WALLET_INVALID_PASSWORD, error.message);
        }
        if (msg.includes('wallet') && msg.includes('locked')) {
          throw new McpError(McpErrorCode.WALLET_LOCKED, error.message);
        }

        // Generic error with context
        throw new McpError(
          McpErrorCode.UNKNOWN,
          `${context}: ${error.message}`,
          { originalError: error.name }
        );
      }

      // Unknown error type
      throw new McpError(
        McpErrorCode.UNKNOWN,
        `${context}: An unexpected error occurred`,
        { errorType: typeof error }
      );
    }
  };
}
