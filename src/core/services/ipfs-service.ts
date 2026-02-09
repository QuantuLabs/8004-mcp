// Global IPFS Service - Chain-agnostic decentralized storage
// Supports Pinata, Filecoin, and local IPFS nodes

import { IPFSClient } from '8004-solana';
import type { IPFSClientConfig, RegistrationFile } from '8004-solana';

export interface IIPFSService {
  isConfigured(): boolean;
  configure(config: IPFSClientConfig): void;
  clearConfig(): void;
  getConfig(): IPFSClientConfig | undefined;
  addJson(data: Record<string, unknown>, name?: string): Promise<string>;
  addFile(filepath: string): Promise<string>;
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
export class IPFSService implements IIPFSService {
  private _client?: IPFSClient;
  private _config?: IPFSClientConfig;

  /**
   * Check if IPFS is configured with valid credentials
   */
  isConfigured(): boolean {
    if (!this._config) return false;
    return !!(
      this._config.pinataJwt ||
      this._config.url ||
      this._config.filecoinPinEnabled
    );
  }

  /**
   * Configure the IPFS service with provider settings
   */
  configure(config: IPFSClientConfig): void {
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
  getConfig(): IPFSClientConfig | undefined {
    if (!this._config) return undefined;
    return {
      ...this._config,
      pinataJwt: this._config.pinataJwt ? '[REDACTED]' : undefined,
      filecoinPrivateKey: this._config.filecoinPrivateKey ? '[REDACTED]' : undefined,
    };
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
    const client = this.getClient();
    return client.addJson(data);
  }

  /**
   * Add file to IPFS and return CID
   */
  async addFile(filepath: string): Promise<string> {
    const client = this.getClient();
    return client.addFile(filepath);
  }

  /**
   * Get JSON data from IPFS by CID
   */
  async getJson<T = Record<string, unknown>>(cid: string): Promise<T> {
    const client = this.getClient();
    return client.getJson<T>(cid);
  }

  /**
   * Add registration file to IPFS
   */
  async addRegistrationFile(
    registrationFile: RegistrationFile,
    chainId?: number,
    identityRegistryAddress?: string
  ): Promise<string> {
    const client = this.getClient();
    return client.addRegistrationFile(registrationFile, chainId, identityRegistryAddress);
  }

  /**
   * Get registration file from IPFS by CID
   */
  async getRegistrationFile(cid: string): Promise<RegistrationFile> {
    const client = this.getClient();
    return client.getRegistrationFile(cid);
  }

  /**
   * Get raw Pinata JWT for internal use (e.g., direct API calls).
   * Do NOT expose this value in tool responses.
   */
  getPinataJwt(): string | undefined {
    return this._config?.pinataJwt;
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
      this._client = new IPFSClient(this._config);
    }
    return this._client;
  }
}

// Re-export types for convenience
export type { IPFSClientConfig, RegistrationFile };
