// Solana validation tools

import { PublicKey } from '@solana/web3.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getArgs, readString, readNumber, readBoolean, parseBuffer } from '../../../core/parsers/common.js';
import { successResponse } from '../../../core/serializers/common.js';
import type { SolanaStateManager } from '../state.js';

export function createValidationTools(getState: () => SolanaStateManager) {
  const tools: Tool[] = [];
  const handlers: Record<string, (args: unknown) => Promise<unknown>> = {};

  // solana_validation_request
  tools.push({
    name: 'solana_validation_request',
    description: 'Request third-party validation for a Solana agent',
    inputSchema: {
      type: 'object',
      properties: {
        asset: {
          type: 'string',
          description: 'Agent asset public key (base58)',
        },
        validator: {
          type: 'string',
          description: 'Validator public key (base58)',
        },
        nonce: {
          type: 'number',
          description: 'Validation request nonce',
        },
        requestUri: {
          type: 'string',
          description: 'Request URI (IPFS/Arweave)',
        },
        requestHash: {
          type: 'string',
          description: 'Request hash (base64 or hex, 32 bytes)',
        },
        skipSend: {
          type: 'boolean',
          description: 'If true, returns unsigned transaction',
        },
      },
      required: ['asset', 'validator', 'nonce', 'requestUri', 'requestHash'],
    },
  });
  handlers['solana_validation_request'] = async (args: unknown) => {
    const input = getArgs(args);
    const assetStr = readString(input, 'asset', true);
    const validatorStr = readString(input, 'validator', true);
    const nonce = readNumber(input, 'nonce', true);
    const requestUri = readString(input, 'requestUri', true);
    const requestHashStr = readString(input, 'requestHash', true);
    const requestHash = parseBuffer(requestHashStr, 'requestHash');
    const skipSend = readBoolean(input, 'skipSend') ?? false;
    const asset = new PublicKey(assetStr);
    const validator = new PublicKey(validatorStr);
    const sdk = getState().getSdk();
    const result = await sdk.requestValidation(asset, validator, requestUri, { nonce, requestHash, skipSend });
    return successResponse(result);
  };

  // solana_validation_respond
  tools.push({
    name: 'solana_validation_respond',
    description: 'Respond to a validation request (as validator)',
    inputSchema: {
      type: 'object',
      properties: {
        asset: {
          type: 'string',
          description: 'Agent asset public key (base58)',
        },
        nonce: {
          type: 'number',
          description: 'Validation request nonce',
        },
        response: {
          type: 'number',
          description: 'Response score (0-100)',
        },
        responseUri: {
          type: 'string',
          description: 'Response URI (IPFS/Arweave)',
        },
        responseHash: {
          type: 'string',
          description: 'Response hash (base64 or hex, 32 bytes)',
        },
        tag: {
          type: 'string',
          description: 'Response tag (optional, max 32 bytes)',
        },
        skipSend: {
          type: 'boolean',
          description: 'If true, returns unsigned transaction',
        },
      },
      required: ['asset', 'nonce', 'response', 'responseUri', 'responseHash'],
    },
  });
  handlers['solana_validation_respond'] = async (args: unknown) => {
    const input = getArgs(args);
    const assetStr = readString(input, 'asset', true);
    const nonce = readNumber(input, 'nonce', true);
    const response = readNumber(input, 'response', true);
    const responseUri = readString(input, 'responseUri', true);
    const responseHashStr = readString(input, 'responseHash', true);
    const responseHash = parseBuffer(responseHashStr, 'responseHash');
    const tag = readString(input, 'tag');
    const skipSend = readBoolean(input, 'skipSend') ?? false;
    const asset = new PublicKey(assetStr);
    const sdk = getState().getSdk();
    const result = await sdk.respondToValidation(asset, nonce, response, responseUri, { responseHash, tag, skipSend });
    return successResponse(result);
  };

  // solana_validation_read
  tools.push({
    name: 'solana_validation_read',
    description: 'Read validation request details',
    inputSchema: {
      type: 'object',
      properties: {
        asset: {
          type: 'string',
          description: 'Agent asset public key (base58)',
        },
        validator: {
          type: 'string',
          description: 'Validator public key (base58)',
        },
        nonce: {
          type: 'number',
          description: 'Validation request nonce',
        },
      },
      required: ['asset', 'validator', 'nonce'],
    },
  });
  handlers['solana_validation_read'] = async (args: unknown) => {
    const input = getArgs(args);
    const assetStr = readString(input, 'asset', true);
    const validatorStr = readString(input, 'validator', true);
    const nonce = readNumber(input, 'nonce', true);
    const asset = new PublicKey(assetStr);
    const validator = new PublicKey(validatorStr);
    const sdk = getState().getSdk();
    const validation = await sdk.readValidation(asset, validator, nonce);
    return successResponse(validation);
  };

  // solana_validation_wait
  tools.push({
    name: 'solana_validation_wait',
    description: 'Wait for validation response with retry logic',
    inputSchema: {
      type: 'object',
      properties: {
        asset: {
          type: 'string',
          description: 'Agent asset public key (base58)',
        },
        validator: {
          type: 'string',
          description: 'Validator public key (base58)',
        },
        nonce: {
          type: 'number',
          description: 'Validation request nonce',
        },
        timeoutMs: {
          type: 'number',
          description: 'Timeout in milliseconds (default: 30000)',
        },
      },
      required: ['asset', 'validator', 'nonce'],
    },
  });
  handlers['solana_validation_wait'] = async (args: unknown) => {
    const input = getArgs(args);
    const assetStr = readString(input, 'asset', true);
    const validatorStr = readString(input, 'validator', true);
    const nonce = readNumber(input, 'nonce', true);
    const timeoutMs = readNumber(input, 'timeoutMs') ?? 30000;
    const asset = new PublicKey(assetStr);
    const validator = new PublicKey(validatorStr);
    const sdk = getState().getSdk();
    const result = await sdk.waitForValidation(asset, validator, nonce, { timeout: timeoutMs });
    return successResponse(result);
  };

  // solana_validation_pending_get
  tools.push({
    name: 'solana_validation_pending_get',
    description: 'Get pending validation requests for a validator (requires indexer)',
    inputSchema: {
      type: 'object',
      properties: {
        validator: {
          type: 'string',
          description: 'Validator public key (base58)',
        },
      },
      required: ['validator'],
    },
  });
  handlers['solana_validation_pending_get'] = async (args: unknown) => {
    const input = getArgs(args);
    const validatorStr = readString(input, 'validator', true);
    const indexer = getState().getIndexer();
    if (!indexer) {
      throw new Error('Indexer not available. Configure INDEXER_URL to use this feature.');
    }
    const result = await indexer.getPendingValidations(validatorStr);
    return successResponse(result);
  };

  return { tools, handlers };
}
