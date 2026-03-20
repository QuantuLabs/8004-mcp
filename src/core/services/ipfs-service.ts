// Global IPFS Service - Chain-agnostic decentralized storage
// Default path uses the hosted backend upload endpoint, with optional direct SDK overrides.

import { readFile } from 'fs/promises';
import { basename, extname } from 'path';
import { IPFSClient } from '8004-solana';
import type { IPFSClientConfig, RegistrationFile } from '8004-solana';
import { DEFAULT_IPFS_GATEWAY_URL } from '../../config/defaults.js';

export interface McpIPFSConfig extends IPFSClientConfig {
  uploadUrl?: string;
}

export interface IIPFSService {
  isConfigured(): boolean;
  configure(config: McpIPFSConfig): void;
  clearConfig(): void;
  getConfig(): McpIPFSConfig | undefined;
  hasUploadBackend(): boolean;
  getGatewayUrl(): string;
  addJson(data: Record<string, unknown>, name?: string): Promise<string>;
  addFile(filepath: string): Promise<string>;
  addBuffer(data: Uint8Array, mimeType: string, filename?: string): Promise<string>;
  getJson<T = Record<string, unknown>>(cid: string): Promise<T>;
  addRegistrationFile(
    registrationFile: RegistrationFile,
    chainId?: number,
    identityRegistryAddress?: string
  ): Promise<string>;
  getRegistrationFile(cid: string): Promise<RegistrationFile>;
}

/**
 * Global IPFS service that can be used by all chain providers.
 * This decouples IPFS storage from any specific chain implementation.
 */
const MAX_CID_LENGTH = 128;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_OPS = 10;

export class IPFSService implements IIPFSService {
  private _client?: IPFSClient;
  private _config?: McpIPFSConfig;
  private _opTimestamps: number[] = [];

  /**
   * Check if IPFS is configured with valid credentials
   */
  isConfigured(): boolean {
    if (!this._config) return false;
    return !!(
      this._config.uploadUrl ||
      this._config.pinataJwt ||
      this._config.url ||
      this._config.filecoinPinEnabled
    );
  }

  /**
   * Configure the IPFS service with provider settings
   */
  configure(config: McpIPFSConfig): void {
    this._config = config;
    // Reset client to force re-initialization with new config
    this._client = undefined;
  }

  /**
   * Clear IPFS configuration
   */
  clearConfig(): void {
    this._config = undefined;
    this._client = undefined;
  }

  /**
   * Get current configuration (redacted for safe display)
   */
  getConfig(): McpIPFSConfig | undefined {
    if (!this._config) return undefined;
    return {
      ...this._config,
      pinataJwt: this._config.pinataJwt ? '[REDACTED]' : undefined,
      filecoinPrivateKey: this._config.filecoinPrivateKey ? '[REDACTED]' : undefined,
    };
  }

  hasUploadBackend(): boolean {
    return !!this._config?.uploadUrl;
  }

  getGatewayUrl(): string {
    return DEFAULT_IPFS_GATEWAY_URL;
  }

  /**
   * Check if Pinata JWT is configured (without exposing the value)
   */
  hasPinataJwt(): boolean {
    return !!this._config?.pinataJwt;
  }

  /**
   * Add JSON data to IPFS and return CID
   */
  async addJson(data: Record<string, unknown>, _name?: string): Promise<string> {
    this.checkRateLimit();
    if (this.hasDirectClientConfig()) {
      const client = this.getClient();
      return client.addJson(data);
    }
    if (this._config?.uploadUrl) {
      return this.uploadJson(data);
    }
    throw new Error('IPFS not configured. Call ipfs_configure first.');
  }

  /**
   * Add file to IPFS and return CID
   */
  async addFile(filepath: string): Promise<string> {
    this.checkRateLimit();
    if (this.hasDirectClientConfig()) {
      const client = this.getClient();
      return client.addFile(filepath);
    }
    if (this._config?.uploadUrl) {
      const buffer = await readFile(filepath);
      return this.uploadFile(buffer, this.guessMimeType(filepath), basename(filepath));
    }
    throw new Error('IPFS not configured. Call ipfs_configure first.');
  }

  /**
   * Add binary data to IPFS and return CID
   */
  async addBuffer(data: Uint8Array, mimeType: string, filename = 'upload.bin'): Promise<string> {
    this.checkRateLimit();
    const buffer = Buffer.from(data);
    if (this._config?.uploadUrl) {
      return this.uploadBuffer(buffer, mimeType);
    }
    if (this._config?.pinataJwt) {
      return this.uploadPinataFile(buffer, mimeType, filename);
    }
    throw new Error('IPFS binary upload requires the default upload backend or an explicit Pinata JWT.');
  }

  /**
   * Validate CID format (CIDv0 or CIDv1)
   */
  private checkRateLimit(): void {
    const now = Date.now();
    this._opTimestamps = this._opTimestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
    if (this._opTimestamps.length >= RATE_LIMIT_MAX_OPS) {
      throw new Error(`Rate limit exceeded: max ${RATE_LIMIT_MAX_OPS} IPFS operations per minute`);
    }
    this._opTimestamps.push(now);
  }

  private validateCid(cid: string): void {
    if (!cid || typeof cid !== 'string') {
      throw new Error('CID is required');
    }
    const trimmed = cid.trim();
    if (trimmed.length > MAX_CID_LENGTH) {
      throw new Error(`CID too long: ${trimmed.length} characters (max ${MAX_CID_LENGTH})`);
    }
    const isCidV0 = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(trimmed);
    const isCidV1 = /^[bz][a-z2-7A-Za-z0-9]{10,}$/.test(trimmed);
    if (!isCidV0 && !isCidV1) {
      throw new Error(`Invalid CID format: ${trimmed.substring(0, 20)}...`);
    }
  }

  /**
   * Get JSON data from IPFS by CID
   */
  async getJson<T = Record<string, unknown>>(cid: string): Promise<T> {
    this.validateCid(cid);
    this.checkRateLimit();
    if (this.hasDirectClientConfig()) {
      const client = this.getClient();
      return client.getJson<T>(cid);
    }
    if (this._config?.uploadUrl) {
      return this.fetchGatewayJson<T>(cid);
    }
    throw new Error('IPFS not configured. Call ipfs_configure first.');
  }

  /**
   * Add registration file to IPFS
   */
  async addRegistrationFile(
    registrationFile: RegistrationFile,
    chainId?: number,
    identityRegistryAddress?: string
  ): Promise<string> {
    if (this.hasDirectClientConfig()) {
      const client = this.getClient();
      return client.addRegistrationFile(registrationFile, chainId, identityRegistryAddress);
    }
    return this.addJson(registrationFile as unknown as Record<string, unknown>);
  }

  /**
   * Get registration file from IPFS by CID
   */
  async getRegistrationFile(cid: string): Promise<RegistrationFile> {
    this.validateCid(cid);
    if (this.hasDirectClientConfig()) {
      const client = this.getClient();
      return client.getRegistrationFile(cid);
    }
    return this.getJson<RegistrationFile>(cid);
  }

  /**
   * Get raw Pinata JWT for internal use (e.g., direct API calls).
   * Do NOT expose this value in tool responses.
   */
  getPinataJwt(): string | undefined {
    return this._config?.pinataJwt;
  }

  private hasDirectClientConfig(): boolean {
    return !!(
      this._config?.pinataJwt ||
      this._config?.url ||
      this._config?.filecoinPinEnabled
    );
  }

  private async uploadJson(data: Record<string, unknown>): Promise<string> {
    const uploadUrl = this.requireUploadUrl();
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-MCP-Client': '8004-mcp',
      },
      body: JSON.stringify({ json: data }),
    });
    return this.extractCidFromUploadResponse(response, 'IPFS JSON upload');
  }

  private async uploadFile(buffer: Buffer, mimeType: string, filename: string): Promise<string> {
    const uploadUrl = this.requireUploadUrl();
    const blob = new Blob([buffer], { type: mimeType });
    const formData = new FormData();
    formData.append('file', blob, filename);

    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'X-MCP-Client': '8004-mcp',
      },
      body: formData,
    });
    return this.extractCidFromUploadResponse(response, 'IPFS file upload');
  }

  private async uploadBuffer(buffer: Buffer, mimeType: string): Promise<string> {
    const uploadUrl = this.requireUploadUrl();
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-MCP-Client': '8004-mcp',
      },
      body: JSON.stringify({
        base64: buffer.toString('base64'),
        mimeType,
      }),
    });
    return this.extractCidFromUploadResponse(response, 'IPFS image upload');
  }

  private async uploadPinataFile(buffer: Buffer, mimeType: string, filename: string): Promise<string> {
    const pinataJwt = this._config?.pinataJwt;
    if (!pinataJwt) {
      throw new Error('Pinata JWT not configured.');
    }

    const blob = new Blob([buffer], { type: mimeType });
    const formData = new FormData();
    formData.append('file', blob, filename);

    const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pinataJwt}`,
      },
      body: formData,
    });
    return this.extractCidFromUploadResponse(response, 'Pinata upload');
  }

  private async fetchGatewayJson<T>(cid: string): Promise<T> {
    const response = await fetch(`${this.getGatewayUrl()}/${cid}`);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`IPFS gateway fetch failed: ${response.status} - ${errorText}`);
    }

    const payload = await response.text();
    try {
      return JSON.parse(payload) as T;
    } catch {
      throw new Error('IPFS gateway returned non-JSON content');
    }
  }

  private async extractCidFromUploadResponse(response: Response, label: string): Promise<string> {
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${label} failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json() as { cid?: string; uri?: string; IpfsHash?: string };
    const cid = result?.cid ?? result?.IpfsHash ?? this.extractCidFromUri(result?.uri);
    if (!cid) {
      throw new Error(`No CID returned from ${label}`);
    }
    return cid;
  }

  private extractCidFromUri(uri: string | undefined): string | undefined {
    if (!uri?.startsWith('ipfs://')) {
      return undefined;
    }
    return uri.slice('ipfs://'.length);
  }

  private requireUploadUrl(): string {
    const uploadUrl = this._config?.uploadUrl;
    if (!uploadUrl) {
      throw new Error('IPFS upload backend not configured.');
    }
    return uploadUrl;
  }

  private guessMimeType(filepath: string): string {
    const ext = extname(filepath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
    };
    return mimeTypes[ext] ?? 'application/octet-stream';
  }

  /**
   * Get the underlying IPFSClient (for advanced usage)
   * @throws Error if not configured
   */
  getClient(): IPFSClient {
    if (!this._client) {
      if (!this._config) {
        throw new Error('IPFS not configured. Call ipfs_configure first.');
      }
      if (!this.hasDirectClientConfig()) {
        throw new Error('IPFS client not available for backend-only configuration. Use the MCP IPFS tools instead.');
      }
      this._client = new IPFSClient(this._config);
    }
    return this._client;
  }
}

// Re-export types for convenience
export type { IPFSClientConfig, RegistrationFile };
