// Chain registry for multi-chain provider management

import type { IChainProvider } from '../interfaces/chain-provider.js';
import type { ChainPrefix, ChainType } from '../interfaces/agent.js';
import { chainNotFoundError, McpError, McpErrorCode } from '../errors/mcp-error.js';

export class ChainRegistry {
  private readonly providers: Map<string, IChainProvider> = new Map();
  private defaultChainId: string | null = null;

  // Get unique chain ID from config
  static getChainId(config: { chainPrefix: ChainPrefix; chainId?: string }): string {
    if (config.chainPrefix === 'sol') {
      return 'sol';
    }
    return `${config.chainPrefix}:${config.chainId ?? ''}`;
  }

  register(provider: IChainProvider): void {
    // Use getConfig().chainId (numeric) instead of provider.chainId (formatted)
    // to avoid double-prefixing for EVM chains
    const config = provider.getConfig();
    const chainId = ChainRegistry.getChainId({
      chainPrefix: provider.chainPrefix,
      chainId: config.chainId,
    });
    this.providers.set(chainId, provider);

    // Set as default if first registered or if config says so
    if (this.defaultChainId === null || config.isDefault) {
      this.defaultChainId = chainId;
    }
  }

  unregister(chainId: string): boolean {
    const deleted = this.providers.delete(chainId);
    if (deleted && this.defaultChainId === chainId) {
      // Set new default if available
      const remaining = Array.from(this.providers.keys());
      this.defaultChainId = remaining[0] ?? null;
    }
    return deleted;
  }

  get(chainId: string): IChainProvider | null {
    return this.providers.get(chainId) ?? null;
  }

  getByPrefix(prefix: ChainPrefix): IChainProvider | null {
    // For Solana, direct lookup
    if (prefix === 'sol') {
      return this.providers.get('sol') ?? null;
    }

    // For EVM, find first matching prefix
    for (const [, provider] of this.providers) {
      if (provider.chainPrefix === prefix) {
        return provider;
      }
    }
    return null;
  }

  getDefault(): IChainProvider | null {
    if (!this.defaultChainId) return null;
    return this.providers.get(this.defaultChainId) ?? null;
  }

  setDefault(chainId: string): void {
    if (!this.providers.has(chainId)) {
      throw chainNotFoundError(chainId);
    }
    this.defaultChainId = chainId;
  }

  getAll(): IChainProvider[] {
    return Array.from(this.providers.values());
  }

  getAllByType(chainType: ChainType): IChainProvider[] {
    return Array.from(this.providers.values()).filter(p => p.chainType === chainType);
  }

  has(chainId: string): boolean {
    return this.providers.has(chainId);
  }

  size(): number {
    return this.providers.size;
  }

  // Initialize all providers
  async initializeAll(): Promise<void> {
    const errors: Array<{ chainId: string; error: Error }> = [];

    for (const [chainId, provider] of this.providers) {
      try {
        await provider.initialize();
      } catch (error) {
        errors.push({
          chainId,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }

    if (errors.length > 0) {
      throw new McpError(
        McpErrorCode.CHAIN_CONNECTION_FAILED,
        `Failed to initialize ${errors.length} chain(s): ${errors.map(e => e.chainId).join(', ')}`,
        { errors: errors.map(e => ({ chainId: e.chainId, message: e.error.message })) }
      );
    }
  }

  // Get provider or throw
  require(chainId?: string): IChainProvider {
    const provider = chainId ? this.get(chainId) : this.getDefault();
    if (!provider) {
      throw chainNotFoundError(chainId ?? 'default');
    }
    return provider;
  }

  // Resolve chain from global ID
  resolveFromGlobalId(globalId: string): IChainProvider | null {
    const parts = globalId.split(':');
    const prefix = parts[0] as ChainPrefix;

    if (prefix === 'sol') {
      return this.providers.get('sol') ?? null;
    }

    // For EVM, try to find matching chain
    // Global ID format: "base:84532:1234" → chainId is parts[1] = "84532"
    const chainIdFromGlobalId = parts[1];
    for (const [, provider] of this.providers) {
      // Compare with config.chainId (numeric) not provider.chainId (formatted)
      const providerConfig = provider.getConfig();
      if (provider.chainPrefix === prefix && providerConfig.chainId === chainIdFromGlobalId) {
        return provider;
      }
    }

    // Fallback to prefix-only match
    return this.getByPrefix(prefix);
  }

  // Invalidate all providers (e.g., after network mode change)
  // This tells providers to reconfigure their SDK/connection on next use
  invalidateAll(): void {
    for (const provider of this.providers.values()) {
      // Check if provider has invalidateSdk method (EVM providers have it)
      if ('invalidateSdk' in provider && typeof provider.invalidateSdk === 'function') {
        (provider as { invalidateSdk: () => void }).invalidateSdk();
      }
      // Solana providers may have invalidate method
      if ('invalidate' in provider && typeof provider.invalidate === 'function') {
        (provider as { invalidate: () => void }).invalidate();
      }
    }
  }

  // Clear all providers (for complete reset)
  clear(): void {
    this.providers.clear();
    this.defaultChainId = null;
  }
}
