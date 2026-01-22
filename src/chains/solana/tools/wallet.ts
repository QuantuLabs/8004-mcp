// Solana agent wallet and signing tools

import { PublicKey } from '@solana/web3.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getArgs, readString } from '../../../core/parsers/common.js';
import { successResponse } from '../../../core/serializers/common.js';
import type { SolanaStateManager } from '../state.js';

export function createWalletTools(getState: () => SolanaStateManager) {
  const tools: Tool[] = [];
  const handlers: Record<string, (args: unknown) => Promise<unknown>> = {};

  // solana_agent_wallet_get
  tools.push({
    name: 'solana_agent_wallet_get',
    description: 'Get the operational wallet public key for a Solana agent',
    inputSchema: {
      type: 'object',
      properties: {
        asset: {
          type: 'string',
          description: 'Agent asset public key (base58)',
        },
      },
      required: ['asset'],
    },
  });
  handlers['solana_agent_wallet_get'] = async (args: unknown) => {
    const input = getArgs(args);
    const assetStr = readString(input, 'asset', true);
    const asset = new PublicKey(assetStr);
    const sdk = getState().getSdk();
    const agent = await sdk.loadAgent(asset);
    const agentWallet = agent?.getAgentWalletPublicKey();
    return successResponse({
      asset: asset.toBase58(),
      agentWallet: agentWallet?.toBase58() ?? null,
      owner: agent?.getOwnerPublicKey().toBase58() ?? null,
    });
  };

  // solana_sign
  tools.push({
    name: 'solana_sign',
    description: 'Sign arbitrary data with the agent operational wallet (returns signed payload URI)',
    inputSchema: {
      type: 'object',
      properties: {
        asset: {
          type: 'string',
          description: 'Agent asset public key (base58)',
        },
        data: {
          type: 'object',
          description: 'Data to sign (JSON object)',
        },
      },
      required: ['asset', 'data'],
    },
  });
  handlers['solana_sign'] = async (args: unknown) => {
    const input = getArgs(args);
    const assetStr = readString(input, 'asset', true);
    const asset = new PublicKey(assetStr);
    const data = input.data;
    const sdk = getState().getSdk();
    // sign() returns a signed payload URI string
    const signedPayloadUri = sdk.sign(asset, data);
    return successResponse({
      signedPayloadUri,
    });
  };

  // solana_verify
  tools.push({
    name: 'solana_verify',
    description: 'Verify a signed payload against agent operational wallet',
    inputSchema: {
      type: 'object',
      properties: {
        asset: {
          type: 'string',
          description: 'Agent asset public key (base58)',
        },
        payloadOrUri: {
          type: 'string',
          description: 'Signed payload URI or JSON string',
        },
        publicKey: {
          type: 'string',
          description: 'Optional: specific public key to verify against (base58)',
        },
      },
      required: ['asset', 'payloadOrUri'],
    },
  });
  handlers['solana_verify'] = async (args: unknown) => {
    const input = getArgs(args);
    const assetStr = readString(input, 'asset', true);
    const payloadOrUri = readString(input, 'payloadOrUri', true);
    const publicKeyStr = readString(input, 'publicKey');
    const asset = new PublicKey(assetStr);
    const publicKey = publicKeyStr ? new PublicKey(publicKeyStr) : undefined;
    const sdk = getState().getSdk();
    const isValid = await sdk.verify(payloadOrUri, asset, publicKey);
    return successResponse({ valid: isValid });
  };

  return { tools, handlers };
}
