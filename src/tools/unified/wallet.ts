// Multi-wallet management tools (Solana + EVM)

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getArgs, readString, readStringOptional } from '../../core/parsers/common.js';
import { successResponse } from '../../core/serializers/common.js';
import { getWalletManager, type WalletChainType } from '../../core/wallet/index.js';
import { globalState } from '../../state/global-state.js';
import { wrapHandler } from '../../core/errors/mcp-error.js';
import type { SolanaChainProvider } from '../../chains/solana/provider.js';
import type { EVMChainProvider } from '../../chains/evm/provider.js';

// Helper to invalidate Solana SDK after wallet state change
function invalidateSolanaSDK(): void {
  const provider = globalState.chains.getByPrefix('sol') as SolanaChainProvider | null;
  if (provider) {
    provider.getState().invalidateSdk();
  }
}

// Helper to invalidate all EVM SDKs after wallet state change
function invalidateEvmSDKs(): void {
  const evmPrefixes = ['eth', 'base', 'poly', 'bsc', 'monad'] as const;
  for (const prefix of evmPrefixes) {
    const provider = globalState.chains.getByPrefix(prefix) as EVMChainProvider | null;
    if (provider) {
      provider.invalidateSdk();
    }
  }
}

export const walletTools: Tool[] = [
  {
    name: 'wallet_list',
    description: 'List all wallets with their names, addresses, and chain types. Shows which wallets are unlocked.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'wallet_info',
    description: 'Get detailed information about a specific wallet by name',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the wallet',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'wallet_create',
    description: 'Create a new wallet with a name and password. Supports Solana and EVM chains. Returns the address for funding.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Unique name/label for the wallet (e.g., "main-trading", "dev-wallet")',
        },
        chainType: {
          type: 'string',
          enum: ['solana', 'evm'],
          description: 'Chain type: "solana" for Solana wallets, "evm" for Ethereum/Base/etc.',
        },
        password: {
          type: 'string',
          description: 'Password to encrypt the wallet (min 8 characters)',
        },
      },
      required: ['name', 'chainType', 'password'],
    },
  },
  {
    name: 'wallet_import',
    description: 'Import an existing private key as a new wallet. Supports Solana (JSON array, base64, hex) and EVM (hex) formats.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Unique name/label for the wallet',
        },
        chainType: {
          type: 'string',
          enum: ['solana', 'evm'],
          description: 'Chain type: "solana" or "evm"',
        },
        privateKey: {
          type: 'string',
          description: 'Private key. Solana: JSON array [1,2,...], base64, or hex. EVM: 0x-prefixed or plain hex.',
        },
        password: {
          type: 'string',
          description: 'Password to encrypt the wallet (min 8 characters)',
        },
      },
      required: ['name', 'chainType', 'privateKey', 'password'],
    },
  },
  {
    name: 'wallet_unlock',
    description: 'Unlock a wallet with password to enable signing operations',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the wallet to unlock',
        },
        password: {
          type: 'string',
          description: 'Password to decrypt the wallet',
        },
      },
      required: ['name', 'password'],
    },
  },
  {
    name: 'wallet_lock',
    description: 'Lock a specific wallet or all wallets (clear keys from memory)',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the wallet to lock. If not provided, locks all wallets.',
        },
      },
    },
  },
  {
    name: 'wallet_export',
    description: 'Export wallet as encrypted backup (requires password)',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the wallet to export',
        },
        password: {
          type: 'string',
          description: 'Current wallet password',
        },
        exportPassword: {
          type: 'string',
          description: 'Password for the export file (optional, uses current password if not provided)',
        },
      },
      required: ['name', 'password'],
    },
  },
  {
    name: 'wallet_delete',
    description: 'Delete a wallet permanently (requires password confirmation)',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the wallet to delete',
        },
        password: {
          type: 'string',
          description: 'Wallet password for confirmation',
        },
      },
      required: ['name', 'password'],
    },
  },
  {
    name: 'wallet_change_password',
    description: 'Change the password for a wallet',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the wallet',
        },
        currentPassword: {
          type: 'string',
          description: 'Current wallet password',
        },
        newPassword: {
          type: 'string',
          description: 'New password (min 8 characters)',
        },
      },
      required: ['name', 'currentPassword', 'newPassword'],
    },
  },
  {
    name: 'wallet_security',
    description: 'Configure wallet security settings (auto-lock timeout) and view session status',
    inputSchema: {
      type: 'object',
      properties: {
        autoLockMinutes: {
          type: 'number',
          description: 'Auto-lock timeout in minutes (1-1440, default 15). Wallets auto-lock after this period of inactivity.',
        },
      },
    },
  },
];

// Internal handlers (unwrapped)
const _walletHandlers: Record<string, (args: unknown) => Promise<unknown>> = {
  wallet_list: async () => {
    const manager = getWalletManager();
    const result = await manager.list();

    // Format wallets for display
    const formatted = result.wallets.map((w) => ({
      name: w.name,
      chain: w.chainType,
      address: w.address,
      status: w.isUnlocked ? 'unlocked' : 'locked',
      created: w.createdAt,
    }));

    return successResponse({
      wallets: formatted,
      total: result.wallets.length,
      unlocked: result.unlockedCount,
      hint: result.wallets.length === 0
        ? 'No wallets found. Use wallet_create to create a new wallet.'
        : undefined,
    });
  },

  wallet_info: async (args: unknown) => {
    const input = getArgs(args);
    const name = readString(input, 'name', true);

    const manager = getWalletManager();
    const info = await manager.getInfo(name);

    if (!info) {
      throw new Error(`Wallet "${name}" not found.`);
    }

    return successResponse({
      name: info.name,
      chainType: info.chainType,
      address: info.address,
      publicKey: info.publicKey,
      status: info.isUnlocked ? 'unlocked' : 'locked',
      createdAt: info.createdAt,
      fundingInstructions: info.chainType === 'solana'
        ? `Send SOL to: ${info.address}`
        : `Send ETH/tokens to: ${info.address}`,
    });
  },

  wallet_create: async (args: unknown) => {
    const input = getArgs(args);
    const name = readString(input, 'name', true);
    const chainType = readString(input, 'chainType', true) as WalletChainType;
    const password = readString(input, 'password', true);

    // Validate chain type
    if (!['solana', 'evm'].includes(chainType)) {
      throw new Error('chainType must be "solana" or "evm"');
    }

    const manager = getWalletManager();
    const result = await manager.create(name, chainType, password);

    // Invalidate SDK so it picks up the new keypair (auto-unlocked after create)
    if (chainType === 'solana') {
      invalidateSolanaSDK();
    } else {
      invalidateEvmSDKs();
    }

    return successResponse({
      name: result.name,
      chainType: result.chainType,
      address: result.address,
      publicKey: result.publicKey,
      status: 'unlocked',
      message: result.message,
      fundingInstructions: chainType === 'solana'
        ? `Send SOL to fund this wallet: ${result.address}`
        : `Send ETH/tokens to fund this wallet: ${result.address}`,
      warning: 'IMPORTANT: Save your password securely. There is no way to recover your wallet if you forget it.',
    });
  },

  wallet_import: async (args: unknown) => {
    const input = getArgs(args);
    const name = readString(input, 'name', true);
    const chainType = readString(input, 'chainType', true) as WalletChainType;
    const privateKey = readString(input, 'privateKey', true);
    const password = readString(input, 'password', true);

    // Validate chain type
    if (!['solana', 'evm'].includes(chainType)) {
      throw new Error('chainType must be "solana" or "evm"');
    }

    const manager = getWalletManager();
    const result = await manager.import(name, chainType, privateKey, password);

    // Invalidate SDK so it picks up the new keypair (auto-unlocked after import)
    if (chainType === 'solana') {
      invalidateSolanaSDK();
    } else {
      invalidateEvmSDKs();
    }

    return successResponse({
      name: result.name,
      chainType: result.chainType,
      address: result.address,
      publicKey: result.publicKey,
      status: 'unlocked',
      message: result.message,
      warning: 'IMPORTANT: Save your password securely. There is no way to recover your wallet if you forget it.',
    });
  },

  wallet_unlock: async (args: unknown) => {
    const input = getArgs(args);
    const name = readString(input, 'name', true);
    const password = readString(input, 'password', true);

    const manager = getWalletManager();
    const result = await manager.unlock(name, password);

    // Invalidate SDK so it picks up the new keypair
    if (result.chainType === 'solana') {
      invalidateSolanaSDK();
    } else {
      invalidateEvmSDKs();
    }

    return successResponse({
      name: result.name,
      chainType: result.chainType,
      address: result.address,
      status: 'unlocked',
      message: result.message,
    });
  },

  wallet_lock: async (args: unknown) => {
    const input = getArgs(args);
    const name = readStringOptional(input, 'name');

    const manager = getWalletManager();

    if (name) {
      // Lock specific wallet
      const locked = manager.lock(name);
      if (!locked) {
        return successResponse({
          message: `Wallet "${name}" was not unlocked.`,
        });
      }

      // Invalidate SDKs (both chains since we might not know the type)
      invalidateSolanaSDK();
      invalidateEvmSDKs();

      return successResponse({
        name,
        status: 'locked',
        message: `Wallet "${name}" locked successfully.`,
      });
    } else {
      // Lock all wallets
      const count = manager.lockAll();

      // Invalidate all SDKs
      invalidateSolanaSDK();
      invalidateEvmSDKs();

      return successResponse({
        lockedCount: count,
        message: count > 0
          ? `Locked ${count} wallet(s).`
          : 'No wallets were unlocked.',
      });
    }
  },

  wallet_export: async (args: unknown) => {
    const input = getArgs(args);
    const name = readString(input, 'name', true);
    const password = readString(input, 'password', true);
    const exportPassword = readStringOptional(input, 'exportPassword');

    const manager = getWalletManager();
    const result = await manager.export(name, password, exportPassword ?? undefined);

    // Return file path only - encrypted data is NEVER returned in response
    return successResponse({
      name: result.name,
      exportPath: result.exportPath,
      message: result.message,
      warning: 'The backup file contains your encrypted private key. Delete it after copying to secure storage.',
    });
  },

  wallet_delete: async (args: unknown) => {
    const input = getArgs(args);
    const name = readString(input, 'name', true);
    const password = readString(input, 'password', true);

    const manager = getWalletManager();
    await manager.delete(name, password);

    // Invalidate all SDKs (we don't know the chain type after deletion)
    invalidateSolanaSDK();
    invalidateEvmSDKs();

    return successResponse({
      name,
      message: `Wallet "${name}" deleted permanently.`,
    });
  },

  wallet_change_password: async (args: unknown) => {
    const input = getArgs(args);
    const name = readString(input, 'name', true);
    const currentPassword = readString(input, 'currentPassword', true);
    const newPassword = readString(input, 'newPassword', true);

    const manager = getWalletManager();
    await manager.changePassword(name, currentPassword, newPassword);

    return successResponse({
      name,
      message: `Password changed successfully for wallet "${name}".`,
    });
  },

  wallet_security: async (args: unknown) => {
    const input = getArgs(args);
    const manager = getWalletManager();

    // Update auto-lock if provided
    if (input && typeof input === 'object' && 'autoLockMinutes' in input) {
      const minutes = Number(input.autoLockMinutes);
      if (!isNaN(minutes) && minutes >= 1 && minutes <= 1440) {
        manager.setAutoLockTimeout(minutes * 60 * 1000);
      }
    }

    // Get current settings and session info
    const autoLockMs = manager.getAutoLockTimeout();
    const sessions = manager.getSessionInfo();

    return successResponse({
      security: {
        autoLockMinutes: Math.round(autoLockMs / 60000),
        autoLockEnabled: true,
        memoryWipeOnLock: true,
      },
      activeSessions: sessions.map(s => ({
        wallet: s.name,
        lastActivity: new Date(s.lastActivity).toISOString(),
        expiresIn: `${Math.round((s.lastActivity + autoLockMs - Date.now()) / 1000)}s`,
      })),
      message: sessions.length > 0
        ? `${sessions.length} wallet(s) unlocked. Auto-lock: ${Math.round(autoLockMs / 60000)} min.`
        : `No wallets unlocked. Auto-lock: ${Math.round(autoLockMs / 60000)} min.`,
    });
  },
};

// Export wrapped handlers with error handling
export const walletHandlers: Record<string, (args: unknown) => Promise<unknown>> = Object.fromEntries(
  Object.entries(_walletHandlers).map(([name, handler]) => [
    name,
    wrapHandler(handler, `wallet operation (${name})`)
  ])
);

// Tool aliases for backward compatibility
export const walletAliases: Record<string, string> = {
  // Old single-wallet tools map to new multi-wallet versions
  wallet_status: 'wallet_list',
};
