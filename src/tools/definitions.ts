// Tool definitions aggregator

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ToolRegistry } from '../core/registry/tool-registry.js';

// Unified tools
import {
  configTools,
  configHandlers,
  configAliases,
} from './unified/config.js';
import {
  agentTools,
  agentHandlers,
  agentAliases,
} from './unified/agent.js';
import {
  feedbackTools,
  feedbackHandlers,
  feedbackAliases,
} from './unified/feedback.js';
import {
  reputationTools,
  reputationHandlers,
  reputationAliases,
} from './unified/reputation.js';
import {
  collectionTools,
  collectionHandlers,
  collectionAliases,
} from './unified/collection.js';
import {
  cacheTools,
  cacheHandlers,
  cacheAliases,
} from './unified/cache.js';
import {
  ipfsTools,
  ipfsHandlers,
  ipfsAliases,
} from './unified/ipfs.js';
import {
  oasfTools,
  oasfHandlers,
  oasfAliases,
} from './unified/oasf.js';
import {
  crawlerTools,
  crawlerHandlers,
  crawlerAliases,
} from './unified/crawler.js';
import {
  walletStoreTools as unifiedWalletTools,
  walletStoreHandlers as unifiedWalletHandlers,
  walletStoreAliases as unifiedWalletAliases,
} from './unified/wallet-v2.js';
import {
  registrationTools,
  registrationHandlers,
  registrationAliases,
} from './unified/registration.js';
import {
  writeOperationTools,
  writeOperationHandlers,
  writeOperationAliases,
} from './unified/write-operations.js';
import {
  x402Tools,
  x402Handlers,
  x402Aliases,
} from './unified/x402.js';

// Solana-specific tools
import { createAtomTools } from '../chains/solana/tools/atom.js';
import { createWalletTools } from '../chains/solana/tools/wallet.js';
import { createValidationTools } from '../chains/solana/tools/validation.js';
import { createIntegrityTools } from '../chains/solana/tools/integrity.js';
import type { SolanaStateManager } from '../chains/solana/state.js';

// All unified tools
export const unifiedTools: Tool[] = [
  ...configTools,
  ...agentTools,
  ...feedbackTools,
  ...reputationTools,
  ...collectionTools,
  ...cacheTools,
  ...ipfsTools,
  ...oasfTools,
  ...crawlerTools,
  ...unifiedWalletTools,
  ...registrationTools,
  ...writeOperationTools,
  ...x402Tools,
];

// All unified handlers
export const unifiedHandlers: Record<string, (args: unknown) => Promise<unknown>> = {
  ...configHandlers,
  ...agentHandlers,
  ...feedbackHandlers,
  ...reputationHandlers,
  ...collectionHandlers,
  ...cacheHandlers,
  ...ipfsHandlers,
  ...oasfHandlers,
  ...crawlerHandlers,
  ...unifiedWalletHandlers,
  ...registrationHandlers,
  ...writeOperationHandlers,
  ...x402Handlers,
};

// All unified aliases
export const unifiedAliases: Record<string, string> = {
  ...configAliases,
  ...agentAliases,
  ...feedbackAliases,
  ...reputationAliases,
  ...collectionAliases,
  ...cacheAliases,
  ...ipfsAliases,
  ...oasfAliases,
  ...crawlerAliases,
  ...unifiedWalletAliases,
  ...registrationAliases,
  ...writeOperationAliases,
  ...x402Aliases,
};

// Register all unified tools to a registry
export function registerUnifiedTools(registry: ToolRegistry): void {
  // Register unified tools
  for (const tool of unifiedTools) {
    const handler = unifiedHandlers[tool.name];
    if (handler) {
      // Find aliases for this tool
      const aliases = Object.entries(unifiedAliases)
        .filter(([_, target]) => target === tool.name)
        .map(([alias]) => alias);

      registry.register({
        tool,
        handler,
        aliases: aliases.length > 0 ? aliases : undefined,
        chainType: 'any',
      });
    }
  }
}

// Register Solana-specific tools
export function registerSolanaTools(
  registry: ToolRegistry,
  getState: () => SolanaStateManager
): void {
  const atomTools = createAtomTools(getState);
  const walletTools = createWalletTools(getState);
  const validationTools = createValidationTools(getState);
  const integrityTools = createIntegrityTools(getState);

  // Register ATOM tools
  for (const tool of atomTools.tools) {
    const handler = atomTools.handlers[tool.name];
    if (handler) {
      registry.register({
        tool,
        handler,
        chainType: 'solana',
      });
    }
  }

  // Register wallet tools
  for (const tool of walletTools.tools) {
    const handler = walletTools.handlers[tool.name];
    if (handler) {
      registry.register({
        tool,
        handler,
        chainType: 'solana',
      });
    }
  }

  // Register validation tools
  for (const tool of validationTools.tools) {
    const handler = validationTools.handlers[tool.name];
    if (handler) {
      registry.register({
        tool,
        handler,
        chainType: 'solana',
      });
    }
  }

  // Register integrity tools
  for (const tool of integrityTools.tools) {
    const handler = integrityTools.handlers[tool.name];
    if (handler) {
      registry.register({
        tool,
        handler,
        chainType: 'solana',
      });
    }
  }

  // Add backward compatibility aliases for Solana tools
  const solanaAliases: Record<string, string> = {
    sdk_get_atom_stats: 'solana_atom_stats_get',
    sdk_initialize_atom_stats: 'solana_atom_stats_initialize',
    sdk_get_trust_tier: 'solana_trust_tier_get',
    sdk_get_enriched_summary: 'solana_enriched_summary_get',
    sdk_set_agent_wallet_with_keypair: 'solana_agent_wallet_set_with_keypair',
    sdk_set_agent_wallet_with_signature: 'solana_agent_wallet_set_with_signature',
    sdk_prepare_set_agent_wallet: 'solana_agent_wallet_prepare_message',
    sdk_sign: 'solana_sign',
    sdk_verify: 'solana_verify',
    sdk_request_validation: 'solana_validation_request',
    sdk_respond_to_validation: 'solana_validation_respond',
    sdk_read_validation: 'solana_validation_read',
    sdk_wait_for_validation: 'solana_validation_wait',
    sdk_get_pending_validations: 'solana_validation_pending_get',
    sdk_verify_integrity: 'solana_integrity_verify',
    sdk_verify_integrity_deep: 'solana_integrity_verify_deep',
  };

  // Register aliases by looking up existing tools
  for (const [alias, targetName] of Object.entries(solanaAliases)) {
    const target = registry.get(targetName);
    if (target) {
      // Create alias tool definition
      registry.register({
        tool: {
          ...target.tool,
          name: alias,
          description: `[Alias for ${targetName}] ${target.tool.description}`,
        },
        handler: target.handler,
        chainType: 'solana',
      });
    }
  }
}

// Get all registered tools
export function getAllTools(registry: ToolRegistry): Tool[] {
  return registry.getAll();
}
