// Wallet Store Tools (v2) - Single master password for all wallets

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getArgs, readString } from '../../core/parsers/common.js';
import { successResponse } from '../../core/serializers/common.js';
import { getWalletStore, type WalletChainType } from '../../core/wallet/wallet-store.js';
import { globalState } from '../../state/global-state.js';
import { wrapHandler } from '../../core/errors/mcp-error.js';
import type { SolanaChainProvider } from '../../chains/solana/provider.js';
import type { EVMChainProvider } from '../../chains/evm/provider.js';
import { Keypair } from '@solana/web3.js';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

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

// Invalidate all SDKs
function invalidateAllSDKs(): void {
  invalidateSolanaSDK();
  invalidateEvmSDKs();
}

// Tool definitions
export const walletStoreTools: Tool[] = [
  // Store management
  {
    name: 'wallet_store_init',
    description: 'Initialize wallet store with a master password. Required before creating wallets.',
    inputSchema: {
      type: 'object',
      properties: {
        password: {
          type: 'string',
          description: 'Master password for the wallet store (min 8 characters). This single password unlocks all wallets.',
        },
      },
      required: ['password'],
    },
  },
  {
    name: 'wallet_store_unlock',
    description: 'Unlock the wallet store with master password. Unlocks all wallets at once.',
    inputSchema: {
      type: 'object',
      properties: {
        password: {
          type: 'string',
          description: 'Master password for the wallet store',
        },
      },
      required: ['password'],
    },
  },
  {
    name: 'wallet_store_lock',
    description: 'Lock the wallet store. Securely wipes all keys from memory.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'wallet_store_status',
    description: 'Get wallet store status: initialized, unlocked, wallet count, session info.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'wallet_store_change_password',
    description: 'Change the master password for the wallet store.',
    inputSchema: {
      type: 'object',
      properties: {
        currentPassword: {
          type: 'string',
          description: 'Current master password',
        },
        newPassword: {
          type: 'string',
          description: 'New master password (min 8 characters)',
        },
      },
      required: ['currentPassword', 'newPassword'],
    },
  },
  {
    name: 'wallet_store_migrate',
    description: 'Migrate legacy wallets (individual passwords) to the new store format.',
    inputSchema: {
      type: 'object',
      properties: {
        masterPassword: {
          type: 'string',
          description: 'Master password for the new store (used if store not initialized)',
        },
        legacyPasswords: {
          type: 'object',
          description: 'Map of wallet name to password: { "wallet1": "pass1", "wallet2": "pass2" }',
          additionalProperties: { type: 'string' },
        },
        deleteLegacy: {
          type: 'boolean',
          description: 'Delete legacy wallet files after successful migration (default: false)',
        },
      },
      required: ['masterPassword', 'legacyPasswords'],
    },
  },

  // Wallet operations (store must be unlocked)
  {
    name: 'wallet_list',
    description: 'List all wallets with their names, addresses, and chain types.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'wallet_create',
    description: 'Create a new wallet. Store must be unlocked first.',
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
      },
      required: ['name', 'chainType'],
    },
  },
  {
    name: 'wallet_import',
    description: 'Import an existing private key. Store must be unlocked first.',
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
      },
      required: ['name', 'chainType', 'privateKey'],
    },
  },
  {
    name: 'wallet_delete',
    description: 'Delete a wallet from the store. Store must be unlocked first.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the wallet to delete',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'wallet_info',
    description: 'Get detailed information about a specific wallet.',
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
    name: 'wallet_security',
    description: 'Configure session timeout and view security settings.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionTimeoutMinutes: {
          type: 'number',
          description: 'Session timeout in minutes (1-1440, default 30). Store auto-locks after this period.',
        },
      },
    },
  },
];

// Parse Solana private key
function parseSolanaPrivateKey(privateKey: string): Keypair {
  const trimmed = privateKey.trim();

  // JSON array format
  if (trimmed.startsWith('[')) {
    const arr = JSON.parse(trimmed) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  }

  // Hex format
  if (trimmed.startsWith('0x') || (trimmed.length === 128 && /^[0-9a-fA-F]+$/.test(trimmed))) {
    const hex = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed;
    return Keypair.fromSecretKey(Uint8Array.from(Buffer.from(hex, 'hex')));
  }

  // Base64 format
  const decoded = Buffer.from(trimmed, 'base64');
  if (decoded.length === 64) {
    return Keypair.fromSecretKey(Uint8Array.from(decoded));
  }

  throw new Error('Invalid Solana private key format. Use JSON array, hex, or base64.');
}

// Parse EVM private key
function parseEvmPrivateKey(privateKey: string): { address: string; secretKey: Uint8Array } {
  const trimmed = privateKey.trim();
  let privateKeyHex: `0x${string}`;

  if (trimmed.startsWith('0x')) {
    privateKeyHex = trimmed as `0x${string}`;
  } else if (trimmed.length === 64 && /^[0-9a-fA-F]+$/.test(trimmed)) {
    privateKeyHex = `0x${trimmed}`;
  } else {
    const decoded = Buffer.from(trimmed, 'base64');
    if (decoded.length === 32) {
      privateKeyHex = `0x${decoded.toString('hex')}`;
    } else {
      throw new Error('Invalid EVM private key format. Use 0x-prefixed hex, plain hex, or base64.');
    }
  }

  const account = privateKeyToAccount(privateKeyHex);
  const secretKey = Buffer.from(privateKeyHex.slice(2), 'hex');

  return { address: account.address, secretKey: Uint8Array.from(secretKey) };
}

// Internal handlers
const _walletStoreHandlers: Record<string, (args: unknown) => Promise<unknown>> = {
  wallet_store_init: async (args: unknown) => {
    const input = getArgs(args);
    const password = readString(input, 'password', true);

    const store = getWalletStore();

    if (await store.isInitialized()) {
      throw new Error('Wallet store already initialized. Use wallet_store_unlock to unlock it.');
    }

    await store.initialize(password);

    return successResponse({
      initialized: true,
      unlocked: true,
      message: 'Wallet store initialized and unlocked. You can now create wallets.',
      warning: 'IMPORTANT: Save your master password securely. There is no way to recover your wallets if you forget it.',
    });
  },

  wallet_store_unlock: async (args: unknown) => {
    const input = getArgs(args);
    const password = readString(input, 'password', true);

    const store = getWalletStore();

    if (!await store.isInitialized()) {
      throw new Error('Wallet store not initialized. Use wallet_store_init first.');
    }

    const result = await store.unlock(password);

    // Invalidate SDKs to pick up unlocked wallets
    invalidateAllSDKs();

    return successResponse({
      unlocked: true,
      walletCount: result.walletCount,
      message: result.message,
    });
  },

  wallet_store_lock: async () => {
    const store = getWalletStore();
    store.lock();

    // Invalidate SDKs
    invalidateAllSDKs();

    return successResponse({
      unlocked: false,
      message: 'Wallet store locked. All keys wiped from memory.',
    });
  },

  wallet_store_status: async () => {
    const store = getWalletStore();
    const status = await store.getStatus();

    const wallets = store.listWallets();

    return successResponse({
      initialized: status.initialized,
      unlocked: status.unlocked,
      walletCount: status.walletCount,
      sessionExpiresAt: status.sessionExpiresAt
        ? new Date(status.sessionExpiresAt).toISOString()
        : null,
      wallets: status.unlocked
        ? wallets.map(w => ({ name: w.name, chain: w.chainType, address: w.address }))
        : [],
      hint: !status.initialized
        ? 'Use wallet_store_init to initialize the store.'
        : !status.unlocked
          ? 'Use wallet_store_unlock to unlock the store.'
          : null,
    });
  },

  wallet_store_change_password: async (args: unknown) => {
    const input = getArgs(args);
    const currentPassword = readString(input, 'currentPassword', true);
    const newPassword = readString(input, 'newPassword', true);

    const store = getWalletStore();
    await store.changePassword(currentPassword, newPassword);

    return successResponse({
      message: 'Master password changed successfully.',
    });
  },

  wallet_store_migrate: async (args: unknown) => {
    const input = getArgs(args);
    const masterPassword = readString(input, 'masterPassword', true);
    const legacyPasswords = input.legacyPasswords as Record<string, string>;
    const deleteLegacy = input.deleteLegacy === true;

    if (!legacyPasswords || typeof legacyPasswords !== 'object') {
      throw new Error('legacyPasswords must be an object mapping wallet names to passwords.');
    }

    const store = getWalletStore();
    const result = await store.migrate(legacyPasswords, masterPassword);

    // Delete legacy files if requested
    if (deleteLegacy && result.migrated.length > 0) {
      await store.deleteLegacyWallets(result.migrated);
    }

    // Invalidate SDKs
    invalidateAllSDKs();

    return successResponse({
      migrated: result.migrated,
      failed: result.failed,
      message: result.migrated.length > 0
        ? `Migrated ${result.migrated.length} wallet(s). ${result.failed.length} failed.`
        : 'No wallets migrated.',
      hint: deleteLegacy
        ? 'Legacy wallet files have been deleted.'
        : 'Set deleteLegacy=true to remove old wallet files after migration.',
    });
  },

  wallet_list: async () => {
    const store = getWalletStore();
    const status = await store.getStatus();

    if (!status.initialized) {
      return successResponse({
        wallets: [],
        total: 0,
        unlocked: false,
        hint: 'Wallet store not initialized. Use wallet_store_init to create it.',
      });
    }

    if (!status.unlocked) {
      return successResponse({
        wallets: [],
        total: status.walletCount,
        unlocked: false,
        hint: 'Wallet store is locked. Use wallet_store_unlock to access wallets.',
      });
    }

    const wallets = store.listWallets();

    return successResponse({
      wallets: wallets.map(w => ({
        name: w.name,
        chain: w.chainType,
        address: w.address,
        created: w.createdAt,
      })),
      total: wallets.length,
      unlocked: true,
    });
  },

  wallet_create: async (args: unknown) => {
    const input = getArgs(args);
    const name = readString(input, 'name', true);
    const chainType = readString(input, 'chainType', true) as WalletChainType;

    if (!['solana', 'evm'].includes(chainType)) {
      throw new Error('chainType must be "solana" or "evm"');
    }

    const store = getWalletStore();

    if (!store.isUnlocked()) {
      throw new Error('Wallet store is locked. Use wallet_store_unlock first.');
    }

    // Generate keys
    let secretKey: Uint8Array;
    let publicKey: string;
    let address: string;

    if (chainType === 'solana') {
      const keypair = Keypair.generate();
      secretKey = keypair.secretKey;
      publicKey = keypair.publicKey.toBase58();
      address = publicKey;
    } else {
      const privateKeyHex = generatePrivateKey();
      const account = privateKeyToAccount(privateKeyHex);
      secretKey = Buffer.from(privateKeyHex.slice(2), 'hex');
      publicKey = account.address;
      address = account.address;
    }

    // Add to store
    await store.addWallet(name, chainType, secretKey, publicKey, address);

    // Invalidate SDK
    if (chainType === 'solana') {
      invalidateSolanaSDK();
    } else {
      invalidateEvmSDKs();
    }

    return successResponse({
      name,
      chainType,
      address,
      publicKey,
      message: `Wallet "${name}" created.`,
      fundingInstructions: chainType === 'solana'
        ? `Send SOL to: ${address}`
        : `Send ETH/tokens to: ${address}`,
    });
  },

  wallet_import: async (args: unknown) => {
    const input = getArgs(args);
    const name = readString(input, 'name', true);
    const chainType = readString(input, 'chainType', true) as WalletChainType;
    const privateKey = readString(input, 'privateKey', true);

    if (!['solana', 'evm'].includes(chainType)) {
      throw new Error('chainType must be "solana" or "evm"');
    }

    const store = getWalletStore();

    if (!store.isUnlocked()) {
      throw new Error('Wallet store is locked. Use wallet_store_unlock first.');
    }

    // Parse keys
    let secretKey: Uint8Array;
    let publicKey: string;
    let address: string;

    if (chainType === 'solana') {
      const keypair = parseSolanaPrivateKey(privateKey);
      secretKey = keypair.secretKey;
      publicKey = keypair.publicKey.toBase58();
      address = publicKey;
    } else {
      const parsed = parseEvmPrivateKey(privateKey);
      secretKey = parsed.secretKey;
      publicKey = parsed.address;
      address = parsed.address;
    }

    // Add to store
    await store.addWallet(name, chainType, secretKey, publicKey, address);

    // Invalidate SDK
    if (chainType === 'solana') {
      invalidateSolanaSDK();
    } else {
      invalidateEvmSDKs();
    }

    return successResponse({
      name,
      chainType,
      address,
      publicKey,
      message: `Wallet "${name}" imported.`,
    });
  },

  wallet_delete: async (args: unknown) => {
    const input = getArgs(args);
    const name = readString(input, 'name', true);

    const store = getWalletStore();

    if (!store.isUnlocked()) {
      throw new Error('Wallet store is locked. Use wallet_store_unlock first.');
    }

    await store.removeWallet(name);

    // Invalidate SDKs
    invalidateAllSDKs();

    return successResponse({
      name,
      message: `Wallet "${name}" deleted.`,
    });
  },

  wallet_info: async (args: unknown) => {
    const input = getArgs(args);
    const name = readString(input, 'name', true);

    const store = getWalletStore();

    if (!store.isUnlocked()) {
      throw new Error('Wallet store is locked. Use wallet_store_unlock first.');
    }

    const wallet = store.getWallet(name);
    if (!wallet) {
      throw new Error(`Wallet "${name}" not found.`);
    }

    const wallets = store.listWallets();
    const info = wallets.find(w => w.name === name);

    return successResponse({
      name: wallet.name,
      chainType: wallet.chainType,
      address: wallet.address,
      publicKey: wallet.publicKey,
      createdAt: info?.createdAt,
      fundingInstructions: wallet.chainType === 'solana'
        ? `Send SOL to: ${wallet.address}`
        : `Send ETH/tokens to: ${wallet.address}`,
    });
  },

  wallet_security: async (args: unknown) => {
    const input = getArgs(args);
    const store = getWalletStore();

    // Update timeout if provided
    if (input && typeof input === 'object' && 'sessionTimeoutMinutes' in input) {
      const minutes = Number(input.sessionTimeoutMinutes);
      if (!isNaN(minutes)) {
        store.setSessionTimeout(minutes);
      }
    }

    const status = await store.getStatus();

    return successResponse({
      security: {
        storeEncryption: 'AES-256-GCM',
        keyDerivation: 'Argon2id',
        memoryWipeOnLock: true,
      },
      session: {
        unlocked: status.unlocked,
        expiresAt: status.sessionExpiresAt
          ? new Date(status.sessionExpiresAt).toISOString()
          : null,
      },
    });
  },
};

// Export wrapped handlers
export const walletStoreHandlers: Record<string, (args: unknown) => Promise<unknown>> = Object.fromEntries(
  Object.entries(_walletStoreHandlers).map(([name, handler]) => [
    name,
    wrapHandler(handler, `wallet operation (${name})`),
  ])
);

// Aliases for backward compatibility
export const walletStoreAliases: Record<string, string> = {
  wallet_unlock: 'wallet_store_unlock',
  wallet_lock: 'wallet_store_lock',
  wallet_status: 'wallet_store_status',
};
