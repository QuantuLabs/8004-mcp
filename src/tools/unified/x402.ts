// x402 Protocol Tools for 8004-reputation Extension
// Spec: https://github.com/coinbase/x402/issues/931

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  getArgs,
  readString,
  readNumber,
  readBoolean,
  readRecord,
  parseChainParam,
} from '../../core/parsers/common.js';
import { successResponse } from '../../core/serializers/common.js';
import { globalState } from '../../state/global-state.js';
import { parseGlobalId, isValidGlobalId } from '../../core/interfaces/agent.js';
import type { IWritableChainProvider } from '../../core/interfaces/chain-provider.js';
import { isWritableProvider } from '../../core/interfaces/chain-provider.js';
import {
  buildRegistryIdentifier,
  buildClientAddress,
  feedbackFileToRecord,
  type X402AgentIdentity,
  type X402ProofOfPayment,
  type X402Settlement,
  type X402FeedbackFile,
} from '../../core/interfaces/x402.js';
import { validateProofFormat, isProofFormatValid } from '../../core/x402/proof-validator.js';
import { CHAIN_CONFIGS, type NetworkMode } from '../../config/defaults.js';
import { createHash } from 'crypto';
import { encodeReputationValue } from '../../core/utils/value-encoding.js';

export const x402Tools: Tool[] = [
  {
    name: 'x402_identity_build',
    description:
      'Build x402 AgentIdentity object for PaymentRequired responses (CAIP-2 format)',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: {
          type: 'string',
          description:
            'Agent ID (global format like sol:xxx or base:8453:123)',
        },
        chain: {
          type: 'string',
          description: 'Chain override (optional if using global ID)',
        },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'x402_proof_parse',
    description:
      'Parse x402 PaymentResponse header and extract proof-of-payment',
    inputSchema: {
      type: 'object',
      properties: {
        paymentResponse: {
          type: 'string',
          description:
            'Base64-encoded PaymentResponse header from x402 settlement',
        },
      },
      required: ['paymentResponse'],
    },
  },
  {
    name: 'x402_feedback_build',
    description:
      'Build x402 feedback file without submitting. Use this to get the file content for manual storage (IPFS, HTTP, etc.) before calling x402_feedback_submit with feedbackUri.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: {
          type: 'string',
          description:
            'Agent ID (global format like sol:xxx or base:8453:123)',
        },
        value: {
          type: ['number', 'string'],
          description: 'Raw metric value (required) - e.g., 9977 for 99.77% when valueDecimals=2',
        },
        valueDecimals: {
          type: 'number',
          description: 'Decimal precision (0-6), default 0',
        },
        score: {
          type: 'number',
          description: 'Quality score (0-100), optional',
        },
        tag1: {
          type: 'string',
          description:
            'x402 feedback tag (x402-resource-delivered, x402-good-payer, etc.). Use oasf_list_tags to see all.',
        },
        tag2: {
          type: 'string',
          description: 'Network tag (exact-svm for Solana, exact-evm for EVM)',
        },
        endpoint: {
          type: 'string',
          description: 'Agent endpoint that was called',
        },
        proofOfPayment: {
          type: 'object',
          description: 'Proof of payment object',
          properties: {
            fromAddress: { type: 'string', description: 'Payer address' },
            toAddress: { type: 'string', description: 'Payee address' },
            chainId: { type: 'string', description: 'Chain ID or genesis hash' },
            txHash: { type: 'string', description: 'Transaction hash/signature' },
          },
          required: ['fromAddress', 'toAddress', 'chainId', 'txHash'],
        },
        x402Settlement: {
          type: 'object',
          description: 'Optional settlement details',
        },
        comment: {
          type: 'string',
          description: 'Optional feedback comment',
        },
        signer: {
          type: 'string',
          description: 'Client address (defaults to proofOfPayment.fromAddress)',
        },
        chain: {
          type: 'string',
          description: 'Chain override (optional if using global ID)',
        },
      },
      required: ['agentId', 'value', 'tag1', 'tag2', 'proofOfPayment'],
    },
  },
  {
    name: 'x402_feedback_submit',
    description:
      'Submit feedback with proof-of-payment (x402 extension). Requires feedbackUri (use x402_feedback_build + ipfs_add_json first) OR storeOnIpfs=true with IPFS configured.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: {
          type: 'string',
          description:
            'Agent ID (global format like sol:xxx or base:8453:123)',
        },
        value: {
          type: ['number', 'string'],
          description: 'Raw metric value (required) - e.g., 9977 for 99.77% when valueDecimals=2',
        },
        valueDecimals: {
          type: 'number',
          description: 'Decimal precision (0-6), default 0',
        },
        score: {
          type: 'number',
          description: 'Quality score (0-100), optional',
        },
        tag1: {
          type: 'string',
          description:
            'x402 feedback tag (x402-resource-delivered, x402-good-payer, etc.). Use oasf_list_tags to see all.',
        },
        tag2: {
          type: 'string',
          description: 'Network tag (exact-svm for Solana, exact-evm for EVM)',
        },
        endpoint: {
          type: 'string',
          description: 'Agent endpoint that was called',
        },
        proofOfPayment: {
          type: 'object',
          description: 'Proof of payment object',
          properties: {
            fromAddress: {
              type: 'string',
              description: 'Payer address',
            },
            toAddress: {
              type: 'string',
              description: 'Payee address',
            },
            chainId: {
              type: 'string',
              description: 'Chain ID or genesis hash',
            },
            txHash: {
              type: 'string',
              description: 'Transaction hash/signature',
            },
          },
          required: ['fromAddress', 'toAddress', 'chainId', 'txHash'],
        },
        x402Settlement: {
          type: 'object',
          description: 'Optional settlement details',
          properties: {
            success: { type: 'boolean' },
            transaction: { type: 'string' },
            network: { type: 'string' },
            settledAt: { type: 'string' },
          },
        },
        comment: {
          type: 'string',
          description: 'Optional feedback comment',
        },
        feedbackUri: {
          type: 'string',
          description:
            'URI where feedback file is stored (ipfs://, https://, ar://). If provided, skips IPFS upload.',
        },
        validateProof: {
          type: 'boolean',
          description: 'Validate proof format (default: false). Note: This only validates the format of addresses and transaction hash, NOT on-chain transaction presence.',
        },
        storeOnIpfs: {
          type: 'boolean',
          description:
            'Store feedback file on IPFS (default: true). Requires IPFS configured if feedbackUri not provided.',
        },
        skipSend: {
          type: 'boolean',
          description:
            'Return unsigned transaction for external wallet (default: false)',
        },
        signer: {
          type: 'string',
          description: 'Signer public key if skipSend=true',
        },
        chain: {
          type: 'string',
          description: 'Chain override (optional if using global ID)',
        },
      },
      required: ['agentId', 'value', 'tag1', 'tag2', 'proofOfPayment'],
    },
  },
];

export const x402Handlers: Record<
  string,
  (args: unknown) => Promise<unknown>
> = {
  x402_identity_build: async (args: unknown) => {
    const input = getArgs(args);
    const agentId = readString(input, 'agentId', true);
    const { chainPrefix } = parseChainParam(input);

    // Resolve chain and agent ID
    let provider;
    let rawId = agentId;

    if (isValidGlobalId(agentId)) {
      const parsed = parseGlobalId(agentId);
      provider = globalState.chains.getByPrefix(parsed.prefix);
      rawId = parsed.rawId;
    } else if (chainPrefix) {
      provider = globalState.chains.getByPrefix(
        chainPrefix as 'sol' | 'base' | 'eth' | 'arb' | 'poly' | 'op'
      );
    } else {
      provider = globalState.chains.getDefault();
    }

    if (!provider) {
      throw new Error('No chain provider available');
    }

    // Get chain config
    const config = provider.getConfig();
    const networkMode = globalState.networkMode as NetworkMode;
    const chainConfig = CHAIN_CONFIGS[config.chainPrefix];

    if (!chainConfig) {
      throw new Error(`Unknown chain: ${config.chainPrefix}`);
    }

    const networkConfig =
      networkMode === 'mainnet' ? chainConfig.mainnet : chainConfig.testnet;
    const registryAddress = networkConfig.registries.identity;

    if (!registryAddress) {
      throw new Error(
        `No registry deployed for ${config.chainPrefix} ${networkMode}`
      );
    }

    // Build CAIP-2 registry identifier
    const agentRegistry = buildRegistryIdentifier(
      config.chainType,
      networkConfig.chainId,
      registryAddress
    );

    const identity: X402AgentIdentity = {
      agentRegistry,
      agentId: rawId,
    };

    return successResponse({
      identity,
      chainType: config.chainType,
      chainPrefix: config.chainPrefix,
      networkMode,
    });
  },

  x402_proof_parse: async (args: unknown) => {
    const input = getArgs(args);
    const paymentResponse = readString(input, 'paymentResponse', true);

    // Decode base64 PaymentResponse
    let decoded: unknown;
    try {
      const jsonStr = Buffer.from(paymentResponse, 'base64').toString('utf-8');
      decoded = JSON.parse(jsonStr);
    } catch {
      throw new Error('Invalid PaymentResponse: not valid base64 JSON');
    }

    if (typeof decoded !== 'object' || decoded === null) {
      throw new Error('Invalid PaymentResponse: must be an object');
    }

    const response = decoded as Record<string, unknown>;

    // Extract proof of payment fields
    // x402 PaymentResponse format varies by implementation
    // Common fields: txHash, from, to, chainId, success, settledAt
    const proofOfPayment: X402ProofOfPayment = {
      fromAddress: String(
        response.from ?? response.fromAddress ?? response.payer ?? ''
      ),
      toAddress: String(
        response.to ?? response.toAddress ?? response.payee ?? ''
      ),
      chainId: String(response.chainId ?? response.chain ?? ''),
      txHash: String(
        response.txHash ??
          response.transactionHash ??
          response.signature ??
          response.transaction ??
          ''
      ),
    };

    // Validate format
    const validation = isProofFormatValid(proofOfPayment);
    if (!validation.valid) {
      throw new Error(
        `Invalid proof format: ${validation.errors.join(', ')}`
      );
    }

    // Build settlement info if available
    let settlement: X402Settlement | undefined;
    if (response.success !== undefined || response.settledAt) {
      // Detect network type
      const isSolana =
        !proofOfPayment.fromAddress.startsWith('0x') &&
        !proofOfPayment.txHash.startsWith('0x');

      settlement = {
        success: response.success === true || response.success === 'true',
        transaction: proofOfPayment.txHash,
        network: isSolana
          ? `solana:${proofOfPayment.chainId}`
          : `eip155:${proofOfPayment.chainId}`,
        settledAt:
          String(response.settledAt ?? '') || new Date().toISOString(),
      };
    }

    return successResponse({
      proofOfPayment,
      settlement,
      raw: response,
    });
  },

  x402_feedback_build: async (args: unknown) => {
    const input = getArgs(args);
    const agentId = readString(input, 'agentId', true);
    const tag1 = readString(input, 'tag1', true);
    const tag2 = readString(input, 'tag2', true);
    const endpoint = readString(input, 'endpoint');
    const comment = readString(input, 'comment');
    const proofInput = readRecord(input, 'proofOfPayment', true);
    const settlementInput = readRecord(input, 'x402Settlement');
    const signer = readString(input, 'signer');
    const { chainPrefix } = parseChainParam(input);

    // Parse value (required) - accepts decimal strings ("99.77") or raw integers
    // Auto-encodes to { value: bigint, valueDecimals: number }
    const rawValue = input.value;
    if (rawValue === undefined || rawValue === null) {
      throw new Error('value is required');
    }
    if (typeof rawValue !== 'string' && typeof rawValue !== 'number' && typeof rawValue !== 'bigint') {
      throw new Error('value must be a number or string');
    }

    // Use encodeReputationValue for auto-encoding decimal strings
    // e.g., "99.77" → { value: 9977n, valueDecimals: 2 }
    const explicitDecimals = readNumber(input, 'valueDecimals');
    const encoded = encodeReputationValue(rawValue, explicitDecimals);
    const value = encoded.value;
    const valueDecimals = encoded.valueDecimals;

    // Parse score (optional)
    const score = readNumber(input, 'score');
    if (score !== undefined && (score < 0 || score > 100)) {
      throw new Error('score must be between 0 and 100');
    }

    // Parse proof of payment
    const proofOfPayment: X402ProofOfPayment = {
      fromAddress: String(proofInput.fromAddress ?? ''),
      toAddress: String(proofInput.toAddress ?? ''),
      chainId: String(proofInput.chainId ?? ''),
      txHash: String(proofInput.txHash ?? ''),
    };

    // Validate proof format
    const formatValidation = isProofFormatValid(proofOfPayment);
    if (!formatValidation.valid) {
      throw new Error(
        `Invalid proof format: ${formatValidation.errors.join(', ')}`
      );
    }

    // Parse settlement if provided
    let x402Settlement: X402Settlement | undefined;
    if (settlementInput) {
      x402Settlement = {
        success: settlementInput.success === true,
        transaction: String(settlementInput.transaction ?? ''),
        network: String(settlementInput.network ?? ''),
        settledAt: String(settlementInput.settledAt ?? ''),
      };
    }

    // Resolve provider for config
    let provider;
    let rawId = agentId;

    if (isValidGlobalId(agentId)) {
      const parsed = parseGlobalId(agentId);
      provider = globalState.chains.getByPrefix(parsed.prefix);
      rawId = parsed.rawId;
    } else if (chainPrefix) {
      provider = globalState.chains.getByPrefix(
        chainPrefix as 'sol' | 'base' | 'eth' | 'arb' | 'poly' | 'op'
      );
    } else {
      provider = globalState.chains.getDefault();
    }

    if (!provider) {
      throw new Error('No chain provider available');
    }

    // Build feedback file
    const config = provider.getConfig();
    const networkMode = globalState.networkMode as NetworkMode;
    const chainConfig = CHAIN_CONFIGS[config.chainPrefix];
    const networkConfig =
      networkMode === 'mainnet' ? chainConfig.mainnet : chainConfig.testnet;
    const registryAddress = networkConfig.registries.identity;

    // Get client address (signer or from proof)
    const clientAddress = signer ?? proofOfPayment.fromAddress;

    const feedbackFile: X402FeedbackFile = {
      agentRegistry: buildRegistryIdentifier(
        config.chainType,
        networkConfig.chainId,
        registryAddress
      ),
      agentId: rawId,
      clientAddress: buildClientAddress(
        config.chainType,
        networkConfig.chainId,
        clientAddress
      ),
      createdAt: new Date().toISOString(),
      value: value.toString(),
      valueDecimals,
      score,
      tag1,
      tag2,
      endpoint,
      proofOfPayment,
      x402Settlement,
      comment,
    };

    // SEAL v1: Calculate feedback FILE hash (SHA-256 of canonical JSON)
    // This is feedbackFileHash - the hash of the external file content
    const feedbackJson = JSON.stringify(feedbackFile, Object.keys(feedbackFile).sort());
    const feedbackFileHash = createHash('sha256')
      .update(feedbackJson)
      .digest('hex');

    return successResponse({
      feedbackFile: feedbackFileToRecord(feedbackFile),
      feedbackFileHash: `0x${feedbackFileHash}`,
      hint: 'Store this file on IPFS (ipfs_add_json) or HTTP, then call x402_feedback_submit with the feedbackUri.',
    });
  },

  x402_feedback_submit: async (args: unknown) => {
    const input = getArgs(args);
    const agentId = readString(input, 'agentId', true);
    const tag1 = readString(input, 'tag1', true);
    const tag2 = readString(input, 'tag2', true);
    const endpoint = readString(input, 'endpoint');
    const comment = readString(input, 'comment');
    const proofInput = readRecord(input, 'proofOfPayment', true);
    const settlementInput = readRecord(input, 'x402Settlement');
    const shouldValidateProof = readBoolean(input, 'validateProof') ?? false;
    const storeOnIpfs = readBoolean(input, 'storeOnIpfs') ?? true;
    const providedFeedbackUri = readString(input, 'feedbackUri');
    const skipSend = readBoolean(input, 'skipSend') ?? false;
    const signer = readString(input, 'signer');
    const { chainPrefix } = parseChainParam(input);

    // Parse value (required) - accepts decimal strings ("99.77") or raw integers
    // Auto-encodes to { value: bigint, valueDecimals: number }
    const rawValue = input.value;
    if (rawValue === undefined || rawValue === null) {
      throw new Error('value is required');
    }
    if (typeof rawValue !== 'string' && typeof rawValue !== 'number' && typeof rawValue !== 'bigint') {
      throw new Error('value must be a number or string');
    }

    // Use encodeReputationValue for auto-encoding decimal strings
    // e.g., "99.77" → { value: 9977n, valueDecimals: 2 }
    const explicitDecimals = readNumber(input, 'valueDecimals');
    const encoded = encodeReputationValue(rawValue, explicitDecimals);
    const value = encoded.value;
    const valueDecimals = encoded.valueDecimals;

    // Parse score (optional)
    const score = readNumber(input, 'score');
    if (score !== undefined && (score < 0 || score > 100)) {
      throw new Error('score must be between 0 and 100');
    }

    // Parse proof of payment
    const proofOfPayment: X402ProofOfPayment = {
      fromAddress: String(proofInput.fromAddress ?? ''),
      toAddress: String(proofInput.toAddress ?? ''),
      chainId: String(proofInput.chainId ?? ''),
      txHash: String(proofInput.txHash ?? ''),
    };

    // Validate proof format
    const formatValidation = isProofFormatValid(proofOfPayment);
    if (!formatValidation.valid) {
      throw new Error(
        `Invalid proof format: ${formatValidation.errors.join(', ')}`
      );
    }

    // Parse settlement if provided
    let x402Settlement: X402Settlement | undefined;
    if (settlementInput) {
      x402Settlement = {
        success: settlementInput.success === true,
        transaction: String(settlementInput.transaction ?? ''),
        network: String(settlementInput.network ?? ''),
        settledAt: String(settlementInput.settledAt ?? ''),
      };
    }

    // Resolve provider
    let provider;
    let rawId = agentId;

    if (isValidGlobalId(agentId)) {
      const parsed = parseGlobalId(agentId);
      provider = globalState.chains.getByPrefix(parsed.prefix);
      rawId = parsed.rawId;
    } else if (chainPrefix) {
      provider = globalState.chains.getByPrefix(
        chainPrefix as 'sol' | 'base' | 'eth' | 'arb' | 'poly' | 'op'
      );
    } else {
      provider = globalState.chains.getDefault();
    }

    if (!provider) {
      throw new Error('No chain provider available');
    }

    // Check write capability
    if (!skipSend && !isWritableProvider(provider)) {
      throw new Error(
        'Chain provider does not support write operations. Use skipSend=true for unsigned transaction.'
      );
    }

    if (typeof provider.giveFeedback !== 'function') {
      throw new Error('Chain provider does not support feedback operations');
    }

    // Optional proof format validation (addresses, tx hash format - NOT on-chain)
    if (shouldValidateProof) {
      const proofValidation = await validateProofFormat(proofOfPayment);
      if (!proofValidation.valid) {
        throw new Error(
          `Proof format validation failed: ${proofValidation.error ?? 'Unknown error'}`
        );
      }
    }

    // Build feedback file
    const config = provider.getConfig();
    const networkMode = globalState.networkMode as NetworkMode;
    const chainConfig = CHAIN_CONFIGS[config.chainPrefix];
    const networkConfig =
      networkMode === 'mainnet' ? chainConfig.mainnet : chainConfig.testnet;
    const registryAddress = networkConfig.registries.identity;

    // Get client address (signer or from proof)
    const clientAddress = signer ?? proofOfPayment.fromAddress;

    const feedbackFile: X402FeedbackFile = {
      agentRegistry: buildRegistryIdentifier(
        config.chainType,
        networkConfig.chainId,
        registryAddress
      ),
      agentId: rawId,
      clientAddress: buildClientAddress(
        config.chainType,
        networkConfig.chainId,
        clientAddress
      ),
      createdAt: new Date().toISOString(),
      value: value.toString(),
      valueDecimals,
      score,
      tag1,
      tag2,
      endpoint,
      proofOfPayment,
      x402Settlement,
      comment,
    };

    // SEAL v1: Calculate feedback FILE hash (SHA-256 of canonical JSON)
    // This is feedbackFileHash - the hash of the external file content
    const feedbackJson = JSON.stringify(feedbackFile, Object.keys(feedbackFile).sort());
    const feedbackFileHash = createHash('sha256')
      .update(feedbackJson)
      .digest('hex');
    const feedbackFileHashBuffer = Buffer.from(feedbackFileHash, 'hex');

    // Determine feedbackUri - user-provided takes priority
    let feedbackUri: string | undefined = providedFeedbackUri;

    // Store on IPFS if no feedbackUri provided and storeOnIpfs is enabled
    if (!feedbackUri && storeOnIpfs) {
      if (!globalState.ipfs.isConfigured()) {
        throw new Error(
          'IPFS not configured. Either: (1) call ipfs_configure first, (2) provide feedbackUri parameter, ' +
          'or (3) use x402_feedback_build to get the file and store it yourself.'
        );
      }
      const cid = await globalState.ipfs.addJson(feedbackFileToRecord(feedbackFile));
      feedbackUri = `ipfs://${cid}`;
    }

    // Validate feedbackUri if provided
    if (feedbackUri) {
      const validPrefixes = ['ipfs://', 'https://', 'http://', 'ar://'];
      if (!validPrefixes.some(p => feedbackUri!.startsWith(p))) {
        throw new Error(
          `Invalid feedbackUri format. Must start with: ${validPrefixes.join(', ')}`
        );
      }
    }

    // Submit feedback on-chain
    // SEAL v1: feedbackFileHash is the hash of the external file content
    const result = await (provider as IWritableChainProvider).giveFeedback(
      {
        agentId: rawId,
        value,
        valueDecimals,
        score,
        comment,
        tag1,
        tag2,
        endpoint,
        feedbackUri,
        feedbackFileHash: feedbackFileHashBuffer,
      },
      { skipSend }
    );

    if (result.unsigned) {
      return successResponse({
        unsigned: true,
        unsignedTx: result.transaction,
        feedbackFileHash: `0x${feedbackFileHash}`,
        feedbackUri,
        feedbackFile,
        message:
          'Sign with your wallet (Phantom/MetaMask) and broadcast to the network.',
        hint: 'For Solana: decode base64, sign, and send. For EVM: sign the transaction object.',
      });
    }

    return successResponse({
      unsigned: false,
      signature: result.signature,
      feedbackFileHash: `0x${feedbackFileHash}`,
      feedbackUri,
      agentId: rawId,
      value: value.toString(),
      valueDecimals,
      score,
      tag1,
      tag2,
    });
  },
};

// Aliases for backward compatibility / convenience
export const x402Aliases: Record<string, string> = {
  // No aliases needed for now
};
