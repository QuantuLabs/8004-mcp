// Tool registry for managing MCP tool definitions and handlers

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export type ToolHandler = (args: unknown) => Promise<unknown>;

export interface IToolDefinition {
  tool: Tool;
  handler: ToolHandler;
  aliases?: string[];
  chainType?: 'solana' | 'evm' | 'any';
}

export class ToolRegistry {
  private readonly tools: Map<string, IToolDefinition> = new Map();
  private readonly aliases: Map<string, string> = new Map();

  register(definition: IToolDefinition): void {
    this.tools.set(definition.tool.name, definition);

    // Register aliases
    if (definition.aliases) {
      for (const alias of definition.aliases) {
        this.aliases.set(alias, definition.tool.name);
      }
    }
  }

  unregister(name: string): boolean {
    const definition = this.tools.get(name);
    if (!definition) return false;

    // Remove aliases
    if (definition.aliases) {
      for (const alias of definition.aliases) {
        this.aliases.delete(alias);
      }
    }

    return this.tools.delete(name);
  }

  get(name: string): IToolDefinition | null {
    // Check direct lookup
    const direct = this.tools.get(name);
    if (direct) return direct;

    // Check aliases
    const canonicalName = this.aliases.get(name);
    if (canonicalName) {
      return this.tools.get(canonicalName) ?? null;
    }

    return null;
  }

  getHandler(name: string): ToolHandler | null {
    const definition = this.get(name);
    return definition?.handler ?? null;
  }

  has(name: string): boolean {
    return this.tools.has(name) || this.aliases.has(name);
  }

  getAll(): Tool[] {
    return Array.from(this.tools.values()).map(d => d.tool);
  }

  getAllByChainType(chainType: 'solana' | 'evm' | 'any'): Tool[] {
    return Array.from(this.tools.values())
      .filter(d => !d.chainType || d.chainType === 'any' || d.chainType === chainType)
      .map(d => d.tool);
  }

  size(): number {
    return this.tools.size;
  }

  // Resolve name (handle aliases)
  resolveName(name: string): string {
    return this.aliases.get(name) ?? name;
  }

  // Clear all tools and aliases
  clear(): void {
    this.tools.clear();
    this.aliases.clear();
  }
}
