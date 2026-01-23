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
import type { SolanaChainProvider } from '../../chains/solana/provider.js';
import {
  buildRegistryIdentifier,
  buildClientAddress,
  feedbackFileToRecord,
  type X402AgentIdentity,
  type X402ProofOfPayment,
  type X402Settlement,
  type X402FeedbackFile,
} from '../../core/interfaces/x402.js';
import { validateProof, isProofFormatValid } from '../../core/x402/proof-validator.js';
import { CHAIN_CONFIGS, type NetworkMode } from '../../config/defaults.js';
import { createHash } from 'crypto';

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
    name: 'x402_feedback_submit',
    description:
      'Submit feedback with proof-of-payment (x402 extension). Stores on IPFS and records on-chain.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: {
          type: 'string',
          description:
            'Agent ID (global format like sol:xxx or base:8453:123)',
        },
        score: {
          type: 'number',
          description: 'Feedback score (0-100)',
        },
        tag1: {
          type: 'string',
          description:
            'Primary tag (e.g., x402-resource-delivered, x402-good-payer)',
        },
        tag2: {
          type: 'string',
          description: 'Secondary tag (e.g., exact-svm, exact-evm)',
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
        validateProof: {
          type: 'boolean',
          description: 'Validate proof on-chain (default: false)',
        },
        storeOnIpfs: {
          type: 'boolean',
          description: 'Store feedback file on IPFS (default: true)',
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
      required: ['agentId', 'score', 'tag1', 'tag2', 'proofOfPayment'],
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

  x402_feedback_submit: async (args: unknown) => {
    const input = getArgs(args);
    const agentId = readString(input, 'agentId', true);
    const score = readNumber(input, 'score', true);
    const tag1 = readString(input, 'tag1', true);
    const tag2 = readString(input, 'tag2', true);
    const endpoint = readString(input, 'endpoint');
    const comment = readString(input, 'comment');
    const proofInput = readRecord(input, 'proofOfPayment', true);
    const settlementInput = readRecord(input, 'x402Settlement');
    const shouldValidateProof = readBoolean(input, 'validateProof') ?? false;
    const storeOnIpfs = readBoolean(input, 'storeOnIpfs') ?? true;
    const skipSend = readBoolean(input, 'skipSend') ?? false;
    const signer = readString(input, 'signer');
    const { chainPrefix } = parseChainParam(input);

    // Validate score
    if (score < 0 || score > 100) {
      throw new Error('Score must be between 0 and 100');
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

    // Optional on-chain proof validation
    if (shouldValidateProof) {
      const proofValidation = await validateProof(proofOfPayment);
      if (!proofValidation.valid) {
        throw new Error(
          `Proof validation failed: ${proofValidation.error ?? 'Unknown error'}`
        );
      }
    }

    // Build feedback file for IPFS
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
      score,
      tag1,
      tag2,
      endpoint,
      proofOfPayment,
      x402Settlement,
      comment,
    };

    // Calculate feedback hash (SHA-256 of canonical JSON)
    const feedbackJson = JSON.stringify(feedbackFile, Object.keys(feedbackFile).sort());
    const feedbackHash = createHash('sha256')
      .update(feedbackJson)
      .digest('hex');
    const feedbackHashBuffer = Buffer.from(feedbackHash, 'hex');

    // Store on IPFS if enabled
    let feedbackUri: string | undefined;
    if (storeOnIpfs) {
      const solanaProvider = globalState.chains.getByPrefix(
        'sol'
      ) as SolanaChainProvider | null;
      if (solanaProvider && solanaProvider.getState().hasIpfs()) {
        const ipfs = solanaProvider.getState().getIpfs();
        const cid = await ipfs.addJson(feedbackFileToRecord(feedbackFile));
        feedbackUri = `ipfs://${cid}`;
      }
    }

    // Submit feedback on-chain
    const result = await (provider as IWritableChainProvider).giveFeedback(
      {
        agentId: rawId,
        score,
        comment,
        tag1,
        tag2,
        endpoint,
        feedbackUri,
        feedbackHash: feedbackHashBuffer,
      },
      { skipSend }
    );

    if (result.unsigned) {
      return successResponse({
        unsigned: true,
        unsignedTx: result.transaction,
        feedbackHash: `0x${feedbackHash}`,
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
      feedbackHash: `0x${feedbackHash}`,
      feedbackUri,
      agentId: rawId,
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
