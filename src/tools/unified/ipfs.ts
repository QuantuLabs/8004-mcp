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


// File size limits (shared Pinata account)
const MAX_JSON_SIZE_BYTES = 100 * 1024; // 100 KB for arbitrary JSON
const MAX_REGISTRATION_SIZE_BYTES = 20 * 1024; // 20 KB for registration files (metadata only, typically <1KB)
const MAX_IMAGE_SIZE_BYTES = 512 * 1024; // 512 KB for images

// Image magic bytes for validation
const IMAGE_SIGNATURES: Record<string, Buffer> = {
  'image/png': Buffer.from([0x89, 0x50, 0x4E, 0x47]),
  'image/jpeg': Buffer.from([0xFF, 0xD8, 0xFF]),
  'image/webp': Buffer.from([0x52, 0x49, 0x46, 0x46]), // RIFF
  'image/gif': Buffer.from([0x47, 0x49, 0x46, 0x38]),
};

/**
 * Validate image by checking magic bytes
 */
function validateImageMagicBytes(buffer: Buffer, mimeType: string): boolean {
  const signature = IMAGE_SIGNATURES[mimeType];
  if (!signature) {
    // SVG is text-based, check for XML/SVG tags
    if (mimeType === 'image/svg+xml') {
      const text = buffer.slice(0, 500).toString('utf8').toLowerCase();
      return text.includes('<svg') || text.includes('<?xml');
    }
    return false;
  }
  return buffer.slice(0, signature.length).equals(signature);
}

/**
 * Validate JSON size before upload
 */
function validateJsonSize(data: Record<string, unknown>, maxSize: number, label: string): void {
  const jsonString = JSON.stringify(data);
  const sizeBytes = Buffer.byteLength(jsonString, 'utf8');

  if (sizeBytes > maxSize) {
    const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
    const maxMB = (maxSize / (1024 * 1024)).toFixed(2);
    throw new Error(
      `${label} too large: ${sizeMB} MB (max ${maxMB} MB). ` +
      'Consider hosting large files on your own IPFS node or Pinata account.'
    );
  }
}

// ERC-8004 Registration v1 type identifier
const REGISTRATION_V1_TYPE = 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1';

/**
 * Validate and normalize ERC-8004 Registration v1 schema
 * Permissive validation - allows additional fields for extensibility
 */
function validateRegistrationSchema(data: Record<string, unknown>): Record<string, unknown> {
  // Required: name (string, max 256 chars)
  if (!data.name || typeof data.name !== 'string') {
    throw new Error('Registration file must have a "name" field (string)');
  }
  if (data.name.length > 256) {
    throw new Error('Agent name too long (max 256 characters)');
  }

  // Required: description (string)
  if (!data.description || typeof data.description !== 'string') {
    throw new Error('Registration file must have a "description" field (string)');
  }

  // Optional: image (valid URI)
  if (data.image !== undefined) {
    if (typeof data.image !== 'string') {
      throw new Error('"image" must be a string (URI)');
    }
    const imageUrl = data.image;
    if (!imageUrl.startsWith('http://') &&
        !imageUrl.startsWith('https://') &&
        !imageUrl.startsWith('ipfs://') &&
        !imageUrl.startsWith('ar://')) {
      throw new Error('"image" must be a valid URI (http://, https://, ipfs://, or ar://)');
    }
  }

  // Optional: services (array of service objects)
  if (data.services !== undefined) {
    if (!Array.isArray(data.services)) {
      throw new Error('"services" must be an array');
    }
    for (const svc of data.services) {
      if (typeof svc !== 'object' || svc === null) {
        throw new Error('Each service must be an object');
      }
      const service = svc as Record<string, unknown>;
      if (!service.name || typeof service.name !== 'string') {
        throw new Error('Each service must have a "name" field');
      }
      // endpoint is optional for some service types (e.g., OASF with just skills)
    }
  }

  // Optional: registrations (array linking to on-chain identity)
  if (data.registrations !== undefined) {
    if (!Array.isArray(data.registrations)) {
      throw new Error('"registrations" must be an array');
    }
  }

  // Optional: supportedTrust (array of trust model strings)
  if (data.supportedTrust !== undefined) {
    if (!Array.isArray(data.supportedTrust)) {
      throw new Error('"supportedTrust" must be an array');
    }
  }

  // Optional: active, x402Support (booleans)
  if (data.active !== undefined && typeof data.active !== 'boolean') {
    throw new Error('"active" must be a boolean');
  }
  if (data.x402Support !== undefined && typeof data.x402Support !== 'boolean') {
    throw new Error('"x402Support" must be a boolean');
  }

  // Auto-add type field if missing (ERC-8004 v1)
  const normalized: Record<string, unknown> = {
    type: REGISTRATION_V1_TYPE,
    ...data,
  };

  // Ensure defaults for optional fields
  if (normalized.services === undefined) {
    normalized.services = [];
  }
  if (normalized.active === undefined) {
    normalized.active = true;
  }
  if (normalized.x402Support === undefined) {
    normalized.x402Support = false;
  }

  return normalized;
}

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
  {
    name: 'ipfs_add_image',
    description: 'Upload an image to IPFS (max 512KB). Returns CID/URI for use in registration files.',
    inputSchema: {
      type: 'object',
      properties: {
        data: {
          type: 'string',
          description: 'Base64-encoded image data',
        },
        mimeType: {
          type: 'string',
          description: 'Image MIME type: image/png, image/jpeg, image/webp, image/gif, image/svg+xml',
        },
      },
      required: ['data', 'mimeType'],
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

    // Validate size limit
    validateJsonSize(data, MAX_JSON_SIZE_BYTES, 'JSON data');

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

    // Validate and normalize to ERC-8004 v1 schema
    const normalized = validateRegistrationSchema(registration);
    validateJsonSize(normalized, MAX_REGISTRATION_SIZE_BYTES, 'Registration file');

    const cid = await globalState.ipfs.addJson(normalized);

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

  ipfs_add_image: async (args: unknown) => {
    const input = getArgs(args);
    const data = readString(input, 'data', true);
    const mimeType = readString(input, 'mimeType', true);

    if (!globalState.ipfs.isConfigured()) {
      throw new Error('IPFS not configured. Call ipfs_configure first.');
    }

    // Validate MIME type
    const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];
    if (!allowedMimeTypes.includes(mimeType)) {
      throw new Error(
        `Invalid MIME type: ${mimeType}. Allowed: ${allowedMimeTypes.join(', ')}`
      );
    }

    // Decode base64
    const buffer = Buffer.from(data, 'base64');

    // Check size
    if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
      const sizeKB = (buffer.length / 1024).toFixed(1);
      const maxKB = (MAX_IMAGE_SIZE_BYTES / 1024).toFixed(0);
      throw new Error(
        `Image too large: ${sizeKB} KB (max ${maxKB} KB). Compress or resize your image.`
      );
    }

    // Validate magic bytes to ensure it's actually an image
    if (!validateImageMagicBytes(buffer, mimeType)) {
      throw new Error(
        `Invalid image data: file does not match ${mimeType} format. Ensure the data is a valid image.`
      );
    }

    // Get extension from MIME type
    const extensions: Record<string, string> = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'image/svg+xml': '.svg',
    };
    const ext = extensions[mimeType] || '.bin';

    // Get Pinata JWT for direct upload
    const pinataJwt = globalState.ipfs.getPinataJwt();
    if (!pinataJwt) {
      throw new Error('Pinata JWT not configured. Images require Pinata.');
    }

    // Use native fetch + FormData with Uint8Array for binary uploads
    // Key: Buffer must be converted to Uint8Array before creating Blob
    const uint8 = new Uint8Array(buffer);
    const blob = new Blob([uint8], { type: mimeType });
    const formData = new FormData();
    formData.append('file', blob, `image${ext}`);

    const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pinataJwt}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Pinata upload failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json() as { IpfsHash?: string };
    const cid = result?.IpfsHash;
    if (!cid) {
      throw new Error(`No CID returned from Pinata`);
    }

    return successResponse({
      cid,
      gateway: `https://gateway.pinata.cloud/ipfs/${cid}`,
      uri: `ipfs://${cid}`,
      size: buffer.length,
      mimeType,
    });
  },
};

// Backward compatibility aliases
export const ipfsAliases: Record<string, string> = {
  ipfs_add_json: 'ipfs_add_json',
  ipfs_add_registration_file: 'ipfs_add_registration',
  ipfs_get_registration_file: 'ipfs_get_registration',
};
