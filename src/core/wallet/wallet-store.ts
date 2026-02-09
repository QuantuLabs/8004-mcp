// Unified Wallet Store - Single master password for all wallets
// Supports migration from legacy per-wallet encryption

import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { Keypair } from '@solana/web3.js';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import * as argon2 from 'argon2';
import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Crypto constants
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const NONCE_LENGTH = 12;
const SALT_LENGTH = 32;

// Argon2id parameters (production: 65536 mem, 3 iter ~150ms)
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
  hashLength: KEY_LENGTH,
};

// Session config
const DEFAULT_SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export type WalletChainType = 'solana' | 'evm';

// Individual wallet data (stored in the encrypted store)
interface StoredWallet {
  chainType: WalletChainType;
  secretKey: string; // base64
  publicKey: string;
  address: string;
  createdAt: string;
}

// Decrypted store content
interface StoreContent {
  wallets: Record<string, StoredWallet>;
  createdAt: string;
  updatedAt: string;
}

// Encrypted store file format
interface EncryptedStoreFile {
  version: 3;
  algorithm: 'aes-256-gcm';
  kdf: 'argon2id';
  kdfParams: { memoryCost: number; timeCost: number; parallelism: number };
  salt: string;
  nonce: string;
  authTag: string;
  ciphertext: string;
}

// Legacy wallet file format (for migration)
interface LegacyWalletFile {
  version: 2;
  chainType: WalletChainType;
  algorithm: 'aes-256-gcm';
  kdf: 'argon2id';
  kdfParams: { memoryCost: number; timeCost: number; parallelism: number };
  salt: string;
  nonce: string;
  authTag: string;
  ciphertext: string;
  publicKey: string;
  address: string;
  name: string;
  createdAt: string;
}

// Public wallet info
export interface WalletInfo {
  name: string;
  chainType: WalletChainType;
  address: string;
  publicKey: string;
  createdAt: string;
}

// Unlocked wallet with keys in memory
export interface UnlockedWallet {
  name: string;
  chainType: WalletChainType;
  address: string;
  publicKey: string;
  solanaKeypair?: Keypair;
  evmAccount?: PrivateKeyAccount;
}

// Store status
export interface StoreStatus {
  initialized: boolean;
  unlocked: boolean;
  walletCount: number;
  sessionExpiresAt: number | null;
}

export class WalletStore {
  private readonly baseDir: string;
  private readonly storePath: string;
  private readonly legacyWalletsPath: string;

  // In-memory state
  private masterKey: Buffer | null = null;
  private storeContent: StoreContent | null = null;
  private unlockedWallets: Map<string, UnlockedWallet> = new Map();
  private sessionTimer: ReturnType<typeof setTimeout> | null = null;
  private sessionExpiresAt: number | null = null;
  private sessionTimeoutMs: number = DEFAULT_SESSION_TIMEOUT_MS;

  // Rate limiting for unlock attempts
  private unlockFailCount = 0;
  private unlockLockedUntil = 0;

  // Write mutex for saveStore serialization
  private writeLock: Promise<void> = Promise.resolve();

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? join(homedir(), '.8004-mcp');
    this.storePath = join(this.baseDir, 'wallet-store.enc');
    this.legacyWalletsPath = join(this.baseDir, 'wallets');
  }

  private async deriveKey(
    password: string,
    salt: Buffer,
    kdfParams?: { memoryCost: number; timeCost: number; parallelism: number }
  ): Promise<Buffer> {
    const options = kdfParams
      ? { type: argon2.argon2id, ...kdfParams, hashLength: KEY_LENGTH, salt, raw: true }
      : { ...ARGON2_OPTIONS, salt, raw: true };
    const hash = await argon2.hash(password, options);
    return Buffer.from(hash);
  }

  // Encrypt data
  private encrypt(data: Buffer, key: Buffer): { nonce: Buffer; ciphertext: Buffer; authTag: Buffer } {
    const nonce = randomBytes(NONCE_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, nonce);
    const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return { nonce, ciphertext, authTag };
  }

  // Decrypt data
  private decrypt(ciphertext: Buffer, key: Buffer, nonce: Buffer, authTag: Buffer): Buffer {
    const decipher = createDecipheriv(ALGORITHM, key, nonce);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  // Ensure base directory exists
  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true, mode: 0o700 });
  }

  // Check if store exists
  async isInitialized(): Promise<boolean> {
    try {
      await fs.access(this.storePath);
      return true;
    } catch {
      return false;
    }
  }

  // Check if store is unlocked
  isUnlocked(): boolean {
    return this.masterKey !== null && this.storeContent !== null;
  }

  // Get store status
  async getStatus(): Promise<StoreStatus> {
    const initialized = await this.isInitialized();
    return {
      initialized,
      unlocked: this.isUnlocked(),
      walletCount: this.storeContent?.wallets ? Object.keys(this.storeContent.wallets).length : 0,
      sessionExpiresAt: this.sessionExpiresAt,
    };
  }

  // Initialize new store with master password
  async initialize(masterPassword: string): Promise<void> {
    if (masterPassword.length < 8) {
      throw new Error('Master password must be at least 8 characters.');
    }

    if (await this.isInitialized()) {
      throw new Error('Wallet store already initialized. Use unlock() or migrate().');
    }

    await this.ensureDir();

    // Create empty store
    const content: StoreContent = {
      wallets: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Encrypt and save
    const salt = randomBytes(SALT_LENGTH);
    const key = await this.deriveKey(masterPassword, salt);
    const { nonce, ciphertext, authTag } = this.encrypt(
      Buffer.from(JSON.stringify(content), 'utf-8'),
      key
    );

    const storeFile: EncryptedStoreFile = {
      version: 3,
      algorithm: 'aes-256-gcm',
      kdf: 'argon2id',
      kdfParams: {
        memoryCost: ARGON2_OPTIONS.memoryCost!,
        timeCost: ARGON2_OPTIONS.timeCost!,
        parallelism: ARGON2_OPTIONS.parallelism!,
      },
      salt: salt.toString('base64'),
      nonce: nonce.toString('base64'),
      authTag: authTag.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    };

    await fs.writeFile(this.storePath, JSON.stringify(storeFile, null, 2), { mode: 0o600 });

    // Auto-unlock after init
    this.masterKey = key;
    this.storeContent = content;
    this.startSession();
  }

  // Unlock store with password
  async unlock(password: string): Promise<{ walletCount: number; message: string }> {
    if (!password) {
      throw new Error('Password required.');
    }

    // Rate limiting: check if locked out
    const now = Date.now();
    if (now < this.unlockLockedUntil) {
      const waitSec = Math.ceil((this.unlockLockedUntil - now) / 1000);
      throw new Error(`Too many failed attempts. Try again in ${waitSec}s.`);
    }

    if (!await this.isInitialized()) {
      throw new Error('Wallet store not initialized. Use initialize() first.');
    }

    // Already unlocked?
    if (this.isUnlocked()) {
      this.refreshSession();
      return {
        walletCount: Object.keys(this.storeContent!.wallets).length,
        message: 'Store already unlocked. Session refreshed.',
      };
    }

    // Read and decrypt store
    const fileContent = await fs.readFile(this.storePath, 'utf-8');
    const storeFile = JSON.parse(fileContent) as EncryptedStoreFile;

    if (storeFile.version !== 3) {
      throw new Error('Invalid store version. Migration may be required.');
    }

    const salt = Buffer.from(storeFile.salt, 'base64');
    const nonce = Buffer.from(storeFile.nonce, 'base64');
    const authTag = Buffer.from(storeFile.authTag, 'base64');
    const ciphertext = Buffer.from(storeFile.ciphertext, 'base64');

    const key = await this.deriveKey(password, salt, storeFile.kdfParams);

    let decrypted: Buffer;
    try {
      decrypted = this.decrypt(ciphertext, key, nonce, authTag);
    } catch {
      this.unlockFailCount++;
      if (this.unlockFailCount >= 5) {
        const delayMs = Math.min(1000 * Math.pow(2, this.unlockFailCount - 5), 16000);
        this.unlockLockedUntil = Date.now() + delayMs;
      }
      throw new Error('Incorrect master password.');
    }

    // Reset rate limiting on success
    this.unlockFailCount = 0;
    this.unlockLockedUntil = 0;

    const content = JSON.parse(decrypted.toString('utf-8')) as StoreContent;

    // Store in memory
    this.masterKey = key;
    this.storeContent = content;

    // Reconstruct unlocked wallets
    this.unlockedWallets.clear();
    for (const [name, wallet] of Object.entries(content.wallets)) {
      const secretKey = Buffer.from(wallet.secretKey, 'base64');
      this.loadWalletIntoMemory(name, wallet.chainType, secretKey, wallet.publicKey, wallet.address);
    }

    this.startSession();

    return {
      walletCount: Object.keys(content.wallets).length,
      message: `Store unlocked. ${Object.keys(content.wallets).length} wallet(s) available.`,
    };
  }

  // Lock store (secure wipe)
  lock(): void {
    // Clear session timer
    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer);
      this.sessionTimer = null;
    }
    this.sessionExpiresAt = null;

    // Secure wipe unlocked wallets
    for (const wallet of this.unlockedWallets.values()) {
      if (wallet.solanaKeypair) {
        wallet.solanaKeypair.secretKey.fill(0);
      }
    }
    this.unlockedWallets.clear();

    // Clear master key
    if (this.masterKey) {
      this.masterKey.fill(0);
      this.masterKey = null;
    }

    this.storeContent = null;
  }

  // Session management
  private startSession(): void {
    this.refreshSession();
  }

  private refreshSession(): void {
    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer);
    }
    this.sessionExpiresAt = Date.now() + this.sessionTimeoutMs;
    this.sessionTimer = setTimeout(() => this.lock(), this.sessionTimeoutMs);
  }

  setSessionTimeout(minutes: number): void {
    this.sessionTimeoutMs = Math.max(1, Math.min(1440, minutes)) * 60 * 1000;
    if (this.isUnlocked()) {
      this.refreshSession();
    }
  }

  // Load wallet keys into memory
  private loadWalletIntoMemory(
    name: string,
    chainType: WalletChainType,
    secretKey: Buffer,
    publicKey: string,
    address: string
  ): void {
    if (chainType === 'solana') {
      const keypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));
      this.unlockedWallets.set(name, { name, chainType, address, publicKey, solanaKeypair: keypair });
    } else {
      const privateKeyHex = `0x${secretKey.toString('hex')}` as `0x${string}`;
      const account = privateKeyToAccount(privateKeyHex);
      this.unlockedWallets.set(name, { name, chainType, address, publicKey, evmAccount: account });
    }
  }

  // Save store to disk (serialized via mutex)
  private saveStore(): Promise<void> {
    const prev = this.writeLock;
    let resolve: () => void;
    this.writeLock = new Promise<void>(r => { resolve = r; });
    return prev.then(() => this.saveStoreInner()).finally(() => resolve!());
  }

  private async saveStoreInner(): Promise<void> {
    if (!this.masterKey || !this.storeContent) {
      throw new Error('Store not unlocked.');
    }

    // Read current file (salt stays the same)
    const fileContent = await fs.readFile(this.storePath, 'utf-8');
    const storeFile = JSON.parse(fileContent) as EncryptedStoreFile;

    // Update timestamp
    this.storeContent.updatedAt = new Date().toISOString();

    // Encrypt
    const { nonce, ciphertext, authTag } = this.encrypt(
      Buffer.from(JSON.stringify(this.storeContent), 'utf-8'),
      this.masterKey
    );

    // Update file
    storeFile.nonce = nonce.toString('base64');
    storeFile.authTag = authTag.toString('base64');
    storeFile.ciphertext = ciphertext.toString('base64');

    await fs.writeFile(this.storePath, JSON.stringify(storeFile, null, 2), { mode: 0o600 });
  }

  // Add wallet to store
  async addWallet(
    name: string,
    chainType: WalletChainType,
    secretKey: Uint8Array,
    publicKey: string,
    address: string
  ): Promise<void> {
    if (!this.isUnlocked()) {
      throw new Error('Store locked. Unlock first.');
    }

    if (this.storeContent!.wallets[name]) {
      throw new Error(`Wallet "${name}" already exists.`);
    }

    // Add to content
    this.storeContent!.wallets[name] = {
      chainType,
      secretKey: Buffer.from(secretKey).toString('base64'),
      publicKey,
      address,
      createdAt: new Date().toISOString(),
    };

    // Load into memory
    this.loadWalletIntoMemory(name, chainType, Buffer.from(secretKey), publicKey, address);

    // Save
    await this.saveStore();
    this.refreshSession();
  }

  // Remove wallet from store
  async removeWallet(name: string): Promise<void> {
    if (!this.isUnlocked()) {
      throw new Error('Store locked. Unlock first.');
    }

    if (!this.storeContent!.wallets[name]) {
      throw new Error(`Wallet "${name}" not found.`);
    }

    // Remove from content
    delete this.storeContent!.wallets[name];

    // Remove from memory (secure wipe)
    const wallet = this.unlockedWallets.get(name);
    if (wallet?.solanaKeypair) {
      wallet.solanaKeypair.secretKey.fill(0);
    }
    this.unlockedWallets.delete(name);

    // Save
    await this.saveStore();
  }

  // List wallets
  listWallets(): WalletInfo[] {
    if (!this.storeContent) return [];

    return Object.entries(this.storeContent.wallets).map(([name, w]) => ({
      name,
      chainType: w.chainType,
      address: w.address,
      publicKey: w.publicKey,
      createdAt: w.createdAt,
    }));
  }

  // Get unlocked wallet
  getWallet(name: string): UnlockedWallet | null {
    if (!this.isUnlocked()) return null;
    this.refreshSession();
    return this.unlockedWallets.get(name) ?? null;
  }

  // Get any Solana keypair
  getAnySolanaKeypair(): Keypair | null {
    for (const wallet of this.unlockedWallets.values()) {
      if (wallet.solanaKeypair) return wallet.solanaKeypair;
    }
    return null;
  }

  // Get any EVM account
  getAnyEvmAccount(): PrivateKeyAccount | null {
    for (const wallet of this.unlockedWallets.values()) {
      if (wallet.evmAccount) return wallet.evmAccount;
    }
    return null;
  }

  // Get any EVM private key
  getAnyEvmPrivateKey(): `0x${string}` | null {
    for (const [name, wallet] of this.unlockedWallets.entries()) {
      if (wallet.evmAccount && this.storeContent?.wallets[name]) {
        const secretKey = Buffer.from(this.storeContent.wallets[name].secretKey, 'base64');
        return `0x${secretKey.toString('hex')}` as `0x${string}`;
      }
    }
    return null;
  }

  // Change master password
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    if (newPassword.length < 8) {
      throw new Error('New password must be at least 8 characters.');
    }

    // Verify current password
    if (!this.isUnlocked()) {
      await this.unlock(currentPassword);
    }

    // Generate new salt and key
    const newSalt = randomBytes(SALT_LENGTH);
    const newKey = await this.deriveKey(newPassword, newSalt);

    // Re-encrypt
    const { nonce, ciphertext, authTag } = this.encrypt(
      Buffer.from(JSON.stringify(this.storeContent), 'utf-8'),
      newKey
    );

    // Create new store file
    const storeFile: EncryptedStoreFile = {
      version: 3,
      algorithm: 'aes-256-gcm',
      kdf: 'argon2id',
      kdfParams: {
        memoryCost: ARGON2_OPTIONS.memoryCost!,
        timeCost: ARGON2_OPTIONS.timeCost!,
        parallelism: ARGON2_OPTIONS.parallelism!,
      },
      salt: newSalt.toString('base64'),
      nonce: nonce.toString('base64'),
      authTag: authTag.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    };

    await fs.writeFile(this.storePath, JSON.stringify(storeFile, null, 2), { mode: 0o600 });

    // Update in-memory key
    if (this.masterKey) {
      this.masterKey.fill(0);
    }
    this.masterKey = newKey;
  }

  // Migrate from legacy wallets
  async migrate(legacyPasswords: Record<string, string>, newMasterPassword: string): Promise<{
    migrated: string[];
    failed: Array<{ name: string; error: string }>;
  }> {
    // Initialize store if needed
    if (!await this.isInitialized()) {
      await this.initialize(newMasterPassword);
    } else {
      await this.unlock(newMasterPassword);
    }

    const migrated: string[] = [];
    const failed: Array<{ name: string; error: string }> = [];

    // Find legacy wallet files
    let legacyFiles: string[];
    try {
      legacyFiles = await fs.readdir(this.legacyWalletsPath);
    } catch {
      return { migrated, failed };
    }

    for (const file of legacyFiles) {
      if (!file.endsWith('.enc')) continue;

      const filePath = join(this.legacyWalletsPath, file);
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const legacyWallet = JSON.parse(content) as LegacyWalletFile;

        if (legacyWallet.version !== 2) {
          failed.push({ name: file, error: 'Unsupported version' });
          continue;
        }

        const walletName = legacyWallet.name;
        const password = legacyPasswords[walletName];

        if (!password) {
          failed.push({ name: walletName, error: 'No password provided' });
          continue;
        }

        // Decrypt legacy wallet
        const salt = Buffer.from(legacyWallet.salt, 'base64');
        const nonce = Buffer.from(legacyWallet.nonce, 'base64');
        const authTag = Buffer.from(legacyWallet.authTag, 'base64');
        const ciphertext = Buffer.from(legacyWallet.ciphertext, 'base64');

        // Use legacy KDF params
        const legacyKey = await argon2.hash(password, {
          type: argon2.argon2id,
          memoryCost: legacyWallet.kdfParams.memoryCost,
          timeCost: legacyWallet.kdfParams.timeCost,
          parallelism: legacyWallet.kdfParams.parallelism,
          hashLength: KEY_LENGTH,
          salt,
          raw: true,
        });

        let secretKey: Buffer;
        try {
          const decipher = createDecipheriv(ALGORITHM, Buffer.from(legacyKey), nonce);
          decipher.setAuthTag(authTag);
          secretKey = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        } catch {
          failed.push({ name: walletName, error: 'Incorrect password' });
          continue;
        }

        // Add to store (skip if already exists)
        if (!this.storeContent!.wallets[walletName]) {
          await this.addWallet(
            walletName,
            legacyWallet.chainType,
            Uint8Array.from(secretKey),
            legacyWallet.publicKey,
            legacyWallet.address
          );
          migrated.push(walletName);
        }

        // Secure wipe
        secretKey.fill(0);

      } catch (err) {
        failed.push({ name: file, error: err instanceof Error ? err.message : 'Unknown error' });
      }
    }

    return { migrated, failed };
  }

  // Delete legacy wallet files after successful migration
  async deleteLegacyWallets(names: string[]): Promise<void> {
    for (const name of names) {
      const safeName = name.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
      const filePath = join(this.legacyWalletsPath, `${safeName}.enc`);
      try {
        await fs.unlink(filePath);
      } catch {
        // Ignore errors
      }
    }
  }
}

// Singleton
let storeInstance: WalletStore | null = null;

export function getWalletStore(): WalletStore {
  if (!storeInstance) {
    storeInstance = new WalletStore();
  }
  return storeInstance;
}

export function setWalletStore(store: WalletStore): void {
  storeInstance = store;
}
