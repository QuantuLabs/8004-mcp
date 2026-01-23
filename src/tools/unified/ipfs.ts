// Unified IPFS tools - Uses global IPFS service (chain-agnostic)

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  getArgs,
  readString,
  readRecord,
  readBoolean,
} from '../../core/parsers/common.js';
import { successResponse } from '../../core/serializers/common.js';
import { globalState } from '../../state/global-state.js';
import type { IPFSClientConfig } from '8004-solana';

export const ipfsTools: Tool[] = [
  {
    name: 'ipfs_configure',
    description: 'Configure IPFS client (Pinata, Filecoin, or node-based)',
    inputSchema: {
      type: 'object',
      properties: {
        pinataJwt: {
          type: 'string',
          description: 'Pinata API JWT token',
        },
        ipfsUrl: {
          type: 'string',
          description: 'IPFS node URL (e.g., http://localhost:5001)',
        },
        filecoinEnabled: {
          type: 'boolean',
          description: 'Enable Filecoin pinning',
        },
        filecoinPrivateKey: {
          type: 'string',
          description: 'Filecoin private key for pinning',
        },
      },
    },
  },
  {
    name: 'ipfs_add_json',
    description: 'Store JSON data to IPFS and return CID',
    inputSchema: {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          description: 'JSON data to store',
        },
        name: {
          type: 'string',
          description: 'Optional name for the pin',
        },
      },
      required: ['data'],
    },
  },
  {
    name: 'ipfs_add_registration',
    description: 'Store agent registration file to IPFS',
    inputSchema: {
      type: 'object',
      properties: {
        registration: {
          type: 'object',
          description: 'Registration file JSON (ERC-8004 format)',
        },
        name: {
          type: 'string',
          description: 'Optional name for the pin',
        },
      },
      required: ['registration'],
    },
  },
  {
    name: 'ipfs_get_registration',
    description: 'Retrieve registration file from IPFS by CID',
    inputSchema: {
      type: 'object',
      properties: {
        cid: {
          type: 'string',
          description: 'IPFS CID of the registration file',
        },
      },
      required: ['cid'],
    },
  },
];

export const ipfsHandlers: Record<string, (args: unknown) => Promise<unknown>> = {
  ipfs_configure: async (args: unknown) => {
    const input = getArgs(args);
    const pinataJwt = readString(input, 'pinataJwt');
    const ipfsUrl = readString(input, 'ipfsUrl');
    const filecoinEnabled = readBoolean(input, 'filecoinEnabled') ?? false;
    const filecoinPrivateKey = readString(input, 'filecoinPrivateKey');

    // Build IPFS config
    const config: IPFSClientConfig = {
      pinataJwt,
      pinataEnabled: !!pinataJwt,
      url: ipfsUrl,
      filecoinPinEnabled: filecoinEnabled,
      filecoinPrivateKey,
    };

    // Configure global IPFS service (chain-agnostic)
    globalState.ipfs.configure(config);

    // Also store in global config for persistence
    globalState.setConfig({
      ipfs: {
        pinataJwt,
        ipfsUrl,
        filecoinEnabled,
        filecoinPrivateKey,
      },
    });

    return successResponse({
      message: 'IPFS configured',
      hasPinata: !!pinataJwt,
      hasIpfsNode: !!ipfsUrl,
      hasFilecoin: filecoinEnabled,
    });
  },

  ipfs_add_json: async (args: unknown) => {
    const input = getArgs(args);
    const data = readRecord(input, 'data', true);

    if (!globalState.ipfs.isConfigured()) {
      throw new Error('IPFS not configured. Call ipfs_configure first.');
    }

    const cid = await globalState.ipfs.addJson(data);

    return successResponse({
      cid,
      gateway: `https://gateway.pinata.cloud/ipfs/${cid}`,
    });
  },

  ipfs_add_registration: async (args: unknown) => {
    const input = getArgs(args);
    const registration = readRecord(input, 'registration', true);

    if (!globalState.ipfs.isConfigured()) {
      throw new Error('IPFS not configured. Call ipfs_configure first.');
    }

    const cid = await globalState.ipfs.addJson(registration);

    return successResponse({
      cid,
      gateway: `https://gateway.pinata.cloud/ipfs/${cid}`,
      uri: `ipfs://${cid}`,
    });
  },

  ipfs_get_registration: async (args: unknown) => {
    const input = getArgs(args);
    const cid = readString(input, 'cid', true);

    if (!globalState.ipfs.isConfigured()) {
      throw new Error('IPFS not configured. Call ipfs_configure first.');
    }

    const registration = await globalState.ipfs.getJson(cid);

    return successResponse(registration);
  },
};

// Backward compatibility aliases
export const ipfsAliases: Record<string, string> = {
  ipfs_add_json: 'ipfs_add_json',
  ipfs_add_registration_file: 'ipfs_add_registration',
  ipfs_get_registration_file: 'ipfs_get_registration',
};
