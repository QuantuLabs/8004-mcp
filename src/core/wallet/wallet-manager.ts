// Multi-wallet manager with AES-256-GCM encryption and Argon2id key derivation
// Supports Solana (Ed25519) and EVM (secp256k1) wallets

import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { Keypair } from '@solana/web3.js';
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import * as argon2 from 'argon2';
import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Crypto constants
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const NONCE_LENGTH = 12; // 96 bits for GCM
const SALT_LENGTH = 32; // 256 bits

// Argon2id parameters (OWASP recommended, ~1-2s)
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
  hashLength: KEY_LENGTH,
};

// Chain types
export type WalletChainType = 'solana' | 'evm';

// Wallet file format (v2 - multi-wallet)
interface EncryptedWalletFile {
  version: 2;
  chainType: WalletChainType;
  algorithm: 'aes-256-gcm';
  kdf: 'argon2id';
  kdfParams: {
    memoryCost: number;
    timeCost: number;
    parallelism: number;
  };
  salt: string; // base64
  nonce: string; // base64
  authTag: string; // base64
  ciphertext: string; // base64
  publicKey: string; // base58 (Solana) or 0x... (EVM)
  address: string; // Display address for funding
  name: string; // User-friendly name
  createdAt: string; // ISO date
  updatedAt: string; // ISO date
}

// Public wallet info (safe to display)
export interface WalletInfo {
  name: string;
  chainType: WalletChainType;
  address: string;
  publicKey: string;
  createdAt: string;
  isUnlocked: boolean;
}

export interface WalletListResult {
  wallets: WalletInfo[];
  unlockedCount: number;
}

export interface WalletCreateResult {
  name: string;
  chainType: WalletChainType;
  address: string;
  publicKey: string;
  filePath: string;
  message: string;
}

export interface WalletUnlockResult {
  name: string;
  chainType: WalletChainType;
  address: string;
  sessionToken: string; // Use this token instead of password for subsequent operations
  message: string;
}

export interface WalletExportResult {
  name: string;
  exportPath: string; // File path instead of encrypted data
  message: string;
}

// Unified wallet interface for unlocked wallets
export interface UnlockedWallet {
  name: string;
  chainType: WalletChainType;
  address: string;
  publicKey: string;
  // Chain-specific key access
  solanaKeypair?: Keypair;
  evmAccount?: PrivateKeyAccount;
  evmPrivateKeyBytes?: Uint8Array; // Store as bytes for secure wipe capability
}

// Auto-lock configuration
const DEFAULT_AUTO_LOCK_MS = 15 * 60 * 1000; // 15 minutes default
const MIN_AUTO_LOCK_MS = 60 * 1000; // 1 minute minimum
const MAX_AUTO_LOCK_MS = 24 * 60 * 60 * 1000; // 24 hours maximum

interface WalletSession {
  wallet: UnlockedWallet;
  timer: ReturnType<typeof setTimeout>;
  lastActivity: number;
  sessionToken: string; // Secure random token for password-less operations
}

export class WalletManager {
  private readonly walletDir: string;
  private readonly walletsPath: string;
  private readonly exportsPath: string;
  private unlockedWallets: Map<string, UnlockedWallet> = new Map();
  private walletSessions: Map<string, WalletSession> = new Map();
  private sessionTokens: Map<string, string> = new Map(); // token -> walletName
  private autoLockMs: number = DEFAULT_AUTO_LOCK_MS;

  // Rate limiting for unlock attempts (per wallet)
  private unlockFailCounts: Map<string, number> = new Map();
  private unlockLockedUntil: Map<string, number> = new Map();

  constructor(walletDir?: string) {
    this.walletDir = walletDir ?? join(homedir(), '.8004-mcp');
    this.walletsPath = join(this.walletDir, 'wallets');
    this.exportsPath = join(this.walletDir, 'exports');
  }

  // Generate secure session token (32 bytes = 256 bits)
  private generateSessionToken(): string {
    return randomBytes(32).toString('base64url');
  }

  // Validate session token and return wallet name
  validateSessionToken(token: string): string | null {
    return this.sessionTokens.get(token) ?? null;
  }

  // Revoke session token (called on lock)
  private revokeSessionToken(walletName: string): void {
    for (const [token, name] of this.sessionTokens.entries()) {
      if (name === walletName) {
        this.sessionTokens.delete(token);
      }
    }
  }

  // Configure auto-lock timeout (in milliseconds)
  setAutoLockTimeout(ms: number): void {
    this.autoLockMs = Math.max(MIN_AUTO_LOCK_MS, Math.min(MAX_AUTO_LOCK_MS, ms));
  }

  // Get current auto-lock timeout
  getAutoLockTimeout(): number {
    return this.autoLockMs;
  }

  // Start or refresh auto-lock timer for a wallet
  private refreshAutoLock(name: string): void {
    const session = this.walletSessions.get(name);
    if (session) {
      // Clear existing timer
      clearTimeout(session.timer);
      // Set new timer
      session.timer = setTimeout(() => this.autoLockWallet(name), this.autoLockMs);
      session.lastActivity = Date.now();
    }
  }

  // Auto-lock a wallet (called by timer)
  private autoLockWallet(name: string): void {
    const session = this.walletSessions.get(name);
    if (session) {
      // Securely clear the wallet from memory
      this.secureWipe(session.wallet);
      this.walletSessions.delete(name);
      this.unlockedWallets.delete(name);
    }
  }

  // Securely wipe sensitive data from memory
  private secureWipe(wallet: UnlockedWallet): void {
    // Overwrite Solana keypair secret key with zeros
    if (wallet.solanaKeypair) {
      const secretKey = wallet.solanaKeypair.secretKey;
      for (let i = 0; i < secretKey.length; i++) {
        secretKey[i] = 0;
      }
    }
    // Overwrite EVM private key bytes with zeros (now works since it's Uint8Array)
    if (wallet.evmPrivateKeyBytes) {
      for (let i = 0; i < wallet.evmPrivateKeyBytes.length; i++) {
        wallet.evmPrivateKeyBytes[i] = 0;
      }
      (wallet as unknown as Record<string, unknown>).evmPrivateKeyBytes = undefined;
    }
    if (wallet.evmAccount) {
      (wallet as unknown as Record<string, unknown>).evmAccount = undefined;
    }
  }

  // Touch a wallet to refresh its auto-lock timer (call on every operation)
  touchWallet(name: string): boolean {
    if (this.walletSessions.has(name)) {
      this.refreshAutoLock(name);
      return true;
    }
    return false;
  }

  // Derive encryption key from password using Argon2id
  private async deriveKey(password: string, salt: Buffer): Promise<Buffer> {
    const hash = await argon2.hash(password, {
      ...ARGON2_OPTIONS,
      salt,
      raw: true,
    });
    return Buffer.from(hash);
  }

  // Encrypt private key with AES-256-GCM
  private encrypt(secretKey: Uint8Array, key: Buffer, nonce: Buffer): { ciphertext: Buffer; authTag: Buffer } {
    const cipher = createCipheriv(ALGORITHM, key, nonce);
    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from(secretKey)),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return { ciphertext, authTag };
  }

  // Decrypt private key with AES-256-GCM
  private decrypt(ciphertext: Buffer, key: Buffer, nonce: Buffer, authTag: Buffer): Buffer {
    const decipher = createDecipheriv(ALGORITHM, key, nonce);
    decipher.setAuthTag(authTag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
  }

  // Ensure wallets directory exists
  private async ensureDir(): Promise<void> {
    try {
      await fs.mkdir(this.walletsPath, { recursive: true, mode: 0o700 });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
  }

  // Get wallet file path from name
  private getWalletPath(name: string): string {
    // Sanitize name for filesystem
    const safeName = name.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
    return join(this.walletsPath, `${safeName}.enc`);
  }

  // Check if wallet exists by name
  async exists(name: string): Promise<boolean> {
    try {
      await fs.access(this.getWalletPath(name));
      return true;
    } catch {
      return false;
    }
  }

  // Read wallet file (without decrypting)
  private async readWalletFile(name: string): Promise<EncryptedWalletFile | null> {
    try {
      const content = await fs.readFile(this.getWalletPath(name), 'utf-8');
      return JSON.parse(content) as EncryptedWalletFile;
    } catch {
      return null;
    }
  }

  // List all wallets
  async list(): Promise<WalletListResult> {
    await this.ensureDir();

    try {
      const files = await fs.readdir(this.walletsPath);
      const wallets: WalletInfo[] = [];

      for (const file of files) {
        if (!file.endsWith('.enc')) continue;

        const filePath = join(this.walletsPath, file);
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const wallet = JSON.parse(content) as EncryptedWalletFile;

          wallets.push({
            name: wallet.name,
            chainType: wallet.chainType,
            address: wallet.address,
            publicKey: wallet.publicKey,
            createdAt: wallet.createdAt,
            isUnlocked: this.unlockedWallets.has(wallet.name),
          });
        } catch {
          // Skip invalid files
        }
      }

      // Sort by name
      wallets.sort((a, b) => a.name.localeCompare(b.name));

      return {
        wallets,
        unlockedCount: this.unlockedWallets.size,
      };
    } catch {
      return { wallets: [], unlockedCount: 0 };
    }
  }

  // Get wallet info by name
  async getInfo(name: string): Promise<WalletInfo | null> {
    const walletFile = await this.readWalletFile(name);
    if (!walletFile) return null;

    return {
      name: walletFile.name,
      chainType: walletFile.chainType,
      address: walletFile.address,
      publicKey: walletFile.publicKey,
      createdAt: walletFile.createdAt,
      isUnlocked: this.unlockedWallets.has(walletFile.name),
    };
  }

  // Create new wallet
  async create(name: string, chainType: WalletChainType, password: string): Promise<WalletCreateResult> {
    // Check if wallet already exists
    if (await this.exists(name)) {
      throw new Error(`Wallet "${name}" already exists. Use a different name or delete the existing wallet.`);
    }

    // Validate password strength
    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters long.');
    }

    // Validate name
    if (!name || name.length < 1 || name.length > 50) {
      throw new Error('Wallet name must be between 1 and 50 characters.');
    }

    // Generate keys based on chain type
    let secretKey: Uint8Array;
    let publicKey: string;
    let address: string;

    if (chainType === 'solana') {
      const keypair = Keypair.generate();
      secretKey = keypair.secretKey;
      publicKey = keypair.publicKey.toBase58();
      address = publicKey; // Solana address is the public key
    } else if (chainType === 'evm') {
      const privateKey = generatePrivateKey();
      const account = privateKeyToAccount(privateKey);
      // Convert hex private key to bytes (remove 0x prefix)
      secretKey = Buffer.from(privateKey.slice(2), 'hex');
      publicKey = account.address; // For EVM, we store the address as public key
      address = account.address;
    } else {
      throw new Error(`Unsupported chain type: ${chainType}`);
    }

    // Generate cryptographic random values
    const salt = randomBytes(SALT_LENGTH);
    const nonce = randomBytes(NONCE_LENGTH);

    // Derive encryption key from password
    const key = await this.deriveKey(password, salt);

    // Encrypt the secret key
    const { ciphertext, authTag } = this.encrypt(secretKey, key, nonce);

    // Create wallet file
    const walletFile: EncryptedWalletFile = {
      version: 2,
      chainType,
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
      publicKey,
      address,
      name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Ensure directory exists and write file
    await this.ensureDir();
    const filePath = this.getWalletPath(name);
    await fs.writeFile(filePath, JSON.stringify(walletFile, null, 2), {
      encoding: 'utf-8',
      mode: 0o600, // Read/write for owner only
    });

    // Auto-unlock after creation with auto-lock timer
    if (chainType === 'solana') {
      const keypair = Keypair.fromSecretKey(secretKey);
      this.unlockedWallets.set(name, {
        name,
        chainType,
        address,
        publicKey,
        solanaKeypair: keypair,
      });
    } else {
      const privateKeyHex = `0x${Buffer.from(secretKey).toString('hex')}` as `0x${string}`;
      const account = privateKeyToAccount(privateKeyHex);
      // Store as Uint8Array for secure wipe capability
      const keyBytes = new Uint8Array(secretKey);
      this.unlockedWallets.set(name, {
        name,
        chainType,
        address,
        publicKey,
        evmAccount: account,
        evmPrivateKeyBytes: keyBytes,
      });
    }

    // Generate session token for auto-unlocked wallet
    const sessionToken = this.generateSessionToken();
    this.sessionTokens.set(sessionToken, name);

    // Create session with auto-lock timer
    const wallet = this.unlockedWallets.get(name)!;
    const timer = setTimeout(() => this.autoLockWallet(name), this.autoLockMs);
    this.walletSessions.set(name, {
      wallet,
      timer,
      lastActivity: Date.now(),
      sessionToken,
    });

    return {
      name,
      chainType,
      address,
      publicKey,
      filePath,
      message: `Wallet "${name}" created and unlocked. Fund this address: ${address}`,
    };
  }

  // Import existing private key
  async import(name: string, chainType: WalletChainType, privateKey: string, password: string): Promise<WalletCreateResult> {
    // Check if wallet already exists
    if (await this.exists(name)) {
      throw new Error(`Wallet "${name}" already exists. Use a different name.`);
    }

    // Validate password strength
    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters long.');
    }

    // Parse private key based on chain type
    let secretKey: Uint8Array;
    let publicKey: string;
    let address: string;

    if (chainType === 'solana') {
      const keypair = this.parseSolanaPrivateKey(privateKey);
      secretKey = keypair.secretKey;
      publicKey = keypair.publicKey.toBase58();
      address = publicKey;
    } else if (chainType === 'evm') {
      const { account, privateKeyBytes } = this.parseEvmPrivateKey(privateKey);
      secretKey = privateKeyBytes;
      publicKey = account.address;
      address = account.address;
    } else {
      throw new Error(`Unsupported chain type: ${chainType}`);
    }

    // Generate cryptographic random values
    const salt = randomBytes(SALT_LENGTH);
    const nonce = randomBytes(NONCE_LENGTH);

    // Derive encryption key from password
    const key = await this.deriveKey(password, salt);

    // Encrypt the secret key
    const { ciphertext, authTag } = this.encrypt(secretKey, key, nonce);

    // Create wallet file
    const walletFile: EncryptedWalletFile = {
      version: 2,
      chainType,
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
      publicKey,
      address,
      name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Ensure directory exists and write file
    await this.ensureDir();
    const filePath = this.getWalletPath(name);
    await fs.writeFile(filePath, JSON.stringify(walletFile, null, 2), {
      encoding: 'utf-8',
      mode: 0o600,
    });

    // Auto-unlock after import with auto-lock timer
    if (chainType === 'solana') {
      const keypair = Keypair.fromSecretKey(secretKey);
      this.unlockedWallets.set(name, {
        name,
        chainType,
        address,
        publicKey,
        solanaKeypair: keypair,
      });
    } else {
      const privateKeyHex = `0x${Buffer.from(secretKey).toString('hex')}` as `0x${string}`;
      const account = privateKeyToAccount(privateKeyHex);
      // Store as Uint8Array for secure wipe capability
      const keyBytes = new Uint8Array(secretKey);
      this.unlockedWallets.set(name, {
        name,
        chainType,
        address,
        publicKey,
        evmAccount: account,
        evmPrivateKeyBytes: keyBytes,
      });
    }

    // Generate session token for auto-unlocked wallet
    const sessionToken = this.generateSessionToken();
    this.sessionTokens.set(sessionToken, name);

    // Create session with auto-lock timer
    const importedWallet = this.unlockedWallets.get(name)!;
    const importTimer = setTimeout(() => this.autoLockWallet(name), this.autoLockMs);
    this.walletSessions.set(name, {
      wallet: importedWallet,
      timer: importTimer,
      lastActivity: Date.now(),
      sessionToken,
    });

    return {
      name,
      chainType,
      address,
      publicKey,
      filePath,
      message: `Wallet "${name}" imported and unlocked. Address: ${address}`,
    };
  }

  // Parse Solana private key from various formats
  private parseSolanaPrivateKey(privateKey: string): Keypair {
    try {
      const trimmed = privateKey.trim();

      // JSON array format [1,2,3,...]
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

      throw new Error('Invalid private key format');
    } catch (err) {
      throw new Error(`Failed to parse Solana private key: ${err instanceof Error ? err.message : 'Invalid format'}`);
    }
  }

  // Parse EVM private key from various formats
  private parseEvmPrivateKey(privateKey: string): { account: PrivateKeyAccount; privateKeyBytes: Uint8Array } {
    try {
      const trimmed = privateKey.trim();
      let privateKeyHex: `0x${string}`;

      // 0x prefixed hex
      if (trimmed.startsWith('0x')) {
        privateKeyHex = trimmed as `0x${string}`;
      }
      // Unprefixed hex (64 chars = 32 bytes)
      else if (trimmed.length === 64 && /^[0-9a-fA-F]+$/.test(trimmed)) {
        privateKeyHex = `0x${trimmed}`;
      }
      // Base64
      else {
        const decoded = Buffer.from(trimmed, 'base64');
        if (decoded.length === 32) {
          privateKeyHex = `0x${decoded.toString('hex')}`;
        } else {
          throw new Error('Invalid private key length');
        }
      }

      const account = privateKeyToAccount(privateKeyHex);
      const privateKeyBytes = Buffer.from(privateKeyHex.slice(2), 'hex');

      return { account, privateKeyBytes };
    } catch (err) {
      throw new Error(`Failed to parse EVM private key: ${err instanceof Error ? err.message : 'Invalid format'}`);
    }
  }

  // Unlock wallet with password
  async unlock(name: string, password: string): Promise<WalletUnlockResult> {
    // Rate limiting: check if locked out
    const now = Date.now();
    const lockedUntil = this.unlockLockedUntil.get(name) ?? 0;
    if (now < lockedUntil) {
      const waitSec = Math.ceil((lockedUntil - now) / 1000);
      throw new Error(`Too many failed attempts for "${name}". Try again in ${waitSec}s.`);
    }

    // Check if wallet exists
    if (!(await this.exists(name))) {
      throw new Error(`Wallet "${name}" not found. Use wallet_list to see available wallets.`);
    }

    // Already unlocked? Refresh timer and return existing token
    if (this.unlockedWallets.has(name)) {
      const wallet = this.unlockedWallets.get(name)!;
      const session = this.walletSessions.get(name);
      this.refreshAutoLock(name);
      const timeoutMinutes = Math.round(this.autoLockMs / 60000);
      return {
        name: wallet.name,
        chainType: wallet.chainType,
        address: wallet.address,
        sessionToken: session?.sessionToken ?? this.generateSessionToken(),
        message: `Wallet "${name}" is already unlocked. Timer refreshed (${timeoutMinutes} min). Use sessionToken for subsequent operations.`,
      };
    }

    // Read wallet file
    const walletFile = await this.readWalletFile(name);
    if (!walletFile) {
      throw new Error('Failed to read wallet file.');
    }

    // Validate version and algorithm
    if (walletFile.version !== 2 || walletFile.algorithm !== 'aes-256-gcm') {
      throw new Error('Unsupported wallet format.');
    }

    // Decode values
    const salt = Buffer.from(walletFile.salt, 'base64');
    const nonce = Buffer.from(walletFile.nonce, 'base64');
    const authTag = Buffer.from(walletFile.authTag, 'base64');
    const ciphertext = Buffer.from(walletFile.ciphertext, 'base64');

    // Derive key from password
    const key = await this.deriveKey(password, salt);

    // Decrypt
    let secretKey: Buffer;
    try {
      secretKey = this.decrypt(ciphertext, key, nonce, authTag);
    } catch {
      const failCount = (this.unlockFailCounts.get(name) ?? 0) + 1;
      this.unlockFailCounts.set(name, failCount);
      if (failCount >= 5) {
        const delayMs = Math.min(1000 * Math.pow(2, failCount - 5), 16000);
        this.unlockLockedUntil.set(name, Date.now() + delayMs);
      }
      throw new Error('Incorrect password.');
    }

    // Reset rate limiting on success
    this.unlockFailCounts.delete(name);
    this.unlockLockedUntil.delete(name);

    // Reconstruct keys based on chain type
    if (walletFile.chainType === 'solana') {
      const keypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));

      // Verify public key matches
      if (keypair.publicKey.toBase58() !== walletFile.publicKey) {
        throw new Error('Wallet integrity check failed.');
      }

      this.unlockedWallets.set(name, {
        name: walletFile.name,
        chainType: walletFile.chainType,
        address: walletFile.address,
        publicKey: walletFile.publicKey,
        solanaKeypair: keypair,
      });
    } else if (walletFile.chainType === 'evm') {
      const privateKeyHex = `0x${secretKey.toString('hex')}` as `0x${string}`;
      const account = privateKeyToAccount(privateKeyHex);

      // Verify address matches
      if (account.address.toLowerCase() !== walletFile.address.toLowerCase()) {
        throw new Error('Wallet integrity check failed.');
      }

      // Store as Uint8Array for secure wipe capability
      const keyBytes = new Uint8Array(secretKey);
      this.unlockedWallets.set(name, {
        name: walletFile.name,
        chainType: walletFile.chainType,
        address: walletFile.address,
        publicKey: walletFile.publicKey,
        evmAccount: account,
        evmPrivateKeyBytes: keyBytes,
      });
    }

    // Clear sensitive data from decryption
    secretKey.fill(0);

    // Generate session token
    const sessionToken = this.generateSessionToken();
    this.sessionTokens.set(sessionToken, name);

    // Create session with auto-lock timer
    const wallet = this.unlockedWallets.get(name)!;
    const timer = setTimeout(() => this.autoLockWallet(name), this.autoLockMs);
    this.walletSessions.set(name, {
      wallet,
      timer,
      lastActivity: Date.now(),
      sessionToken,
    });

    const timeoutMinutes = Math.round(this.autoLockMs / 60000);
    return {
      name: walletFile.name,
      chainType: walletFile.chainType,
      address: walletFile.address,
      sessionToken,
      message: `Wallet "${name}" unlocked. Use sessionToken for subsequent operations (expires after ${timeoutMinutes} min of inactivity).`,
    };
  }

  // Lock a specific wallet (securely wipes memory and revokes token)
  lock(name: string): boolean {
    const session = this.walletSessions.get(name);
    if (session) {
      clearTimeout(session.timer);
      this.secureWipe(session.wallet);
      this.walletSessions.delete(name);
    }
    // Revoke session token
    this.revokeSessionToken(name);
    if (this.unlockedWallets.has(name)) {
      this.unlockedWallets.delete(name);
      return true;
    }
    return false;
  }

  // Lock all wallets (securely wipes all memory and revokes all tokens)
  lockAll(): number {
    // Clear all timers and wipe memory
    for (const [, session] of this.walletSessions.entries()) {
      clearTimeout(session.timer);
      this.secureWipe(session.wallet);
    }
    this.walletSessions.clear();
    this.sessionTokens.clear(); // Revoke all tokens

    const count = this.unlockedWallets.size;
    this.unlockedWallets.clear();
    return count;
  }

  // Check if wallet is unlocked
  isUnlocked(name: string): boolean {
    return this.unlockedWallets.has(name);
  }

  // Get session info for all unlocked wallets
  getSessionInfo(): Array<{ name: string; lastActivity: number; chainType: WalletChainType }> {
    const sessions: Array<{ name: string; lastActivity: number; chainType: WalletChainType }> = [];
    for (const [name, session] of this.walletSessions.entries()) {
      sessions.push({
        name,
        lastActivity: session.lastActivity,
        chainType: session.wallet.chainType,
      });
    }
    return sessions;
  }

  // Get unlocked wallet (throws if locked) - refreshes auto-lock timer
  getUnlockedWallet(name: string): UnlockedWallet {
    const wallet = this.unlockedWallets.get(name);
    if (!wallet) {
      throw new Error(`Wallet "${name}" is locked. Use wallet_unlock to unlock it first.`);
    }
    // Refresh auto-lock timer on access
    this.refreshAutoLock(name);
    return wallet;
  }

  // Get Solana keypair for unlocked wallet (throws if not Solana or locked)
  getSolanaKeypair(name: string): Keypair {
    const wallet = this.getUnlockedWallet(name);
    if (wallet.chainType !== 'solana' || !wallet.solanaKeypair) {
      throw new Error(`Wallet "${name}" is not a Solana wallet.`);
    }
    return wallet.solanaKeypair;
  }

  // Get EVM account for unlocked wallet (throws if not EVM or locked)
  getEvmAccount(name: string): PrivateKeyAccount {
    const wallet = this.getUnlockedWallet(name);
    if (wallet.chainType !== 'evm' || !wallet.evmAccount) {
      throw new Error(`Wallet "${name}" is not an EVM wallet.`);
    }
    return wallet.evmAccount;
  }

  // Get any unlocked Solana keypair (for backward compatibility)
  getAnyUnlockedSolanaKeypair(): Keypair | null {
    for (const wallet of this.unlockedWallets.values()) {
      if (wallet.chainType === 'solana' && wallet.solanaKeypair) {
        return wallet.solanaKeypair;
      }
    }
    return null;
  }

  // Get any unlocked EVM account
  getAnyUnlockedEvmAccount(): PrivateKeyAccount | null {
    for (const wallet of this.unlockedWallets.values()) {
      if (wallet.chainType === 'evm' && wallet.evmAccount) {
        return wallet.evmAccount;
      }
    }
    return null;
  }

  // Get any unlocked EVM private key (for SDK initialization)
  // Converts from secure Uint8Array storage to hex format when needed
  getAnyUnlockedEvmPrivateKey(): `0x${string}` | null {
    for (const wallet of this.unlockedWallets.values()) {
      if (wallet.chainType === 'evm' && wallet.evmPrivateKeyBytes) {
        // Convert bytes to hex on demand
        return `0x${Buffer.from(wallet.evmPrivateKeyBytes).toString('hex')}` as `0x${string}`;
      }
    }
    return null;
  }

  // Export wallet as encrypted backup to file (not returned in response for security)
  async export(name: string, currentPassword: string, exportPassword?: string): Promise<WalletExportResult> {
    // First unlock to verify password
    if (!this.isUnlocked(name)) {
      await this.unlock(name, currentPassword);
    }

    // Read current file
    const walletFile = await this.readWalletFile(name);
    if (!walletFile) {
      throw new Error('Failed to read wallet file.');
    }

    let exportData: EncryptedWalletFile;

    // If export password is the same or not provided, use current file
    if (!exportPassword || exportPassword === currentPassword) {
      exportData = walletFile;
    } else {
      // Re-encrypt with new password
      const wallet = this.getUnlockedWallet(name);
      let secretKey: Uint8Array;

      if (wallet.chainType === 'solana' && wallet.solanaKeypair) {
        secretKey = wallet.solanaKeypair.secretKey;
      } else if (wallet.chainType === 'evm' && wallet.evmAccount) {
        // Re-derive from the current encrypted state
        const salt = Buffer.from(walletFile.salt, 'base64');
        const nonce = Buffer.from(walletFile.nonce, 'base64');
        const authTag = Buffer.from(walletFile.authTag, 'base64');
        const ciphertext = Buffer.from(walletFile.ciphertext, 'base64');
        const key = await this.deriveKey(currentPassword, salt);
        secretKey = this.decrypt(ciphertext, key, nonce, authTag);
      } else {
        throw new Error('Cannot export wallet.');
      }

      // Generate new salt/nonce for export
      const salt = randomBytes(SALT_LENGTH);
      const nonce = randomBytes(NONCE_LENGTH);
      const key = await this.deriveKey(exportPassword, salt);
      const { ciphertext, authTag } = this.encrypt(secretKey, key, nonce);

      exportData = {
        ...walletFile,
        salt: salt.toString('base64'),
        nonce: nonce.toString('base64'),
        authTag: authTag.toString('base64'),
        ciphertext: ciphertext.toString('base64'),
        updatedAt: new Date().toISOString(),
      };
    }

    // Ensure exports directory exists
    await fs.mkdir(this.exportsPath, { recursive: true, mode: 0o700 });

    // Write to file with timestamp (never return encrypted data in response)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const exportFileName = `${name}-${timestamp}.backup`;
    const exportPath = join(this.exportsPath, exportFileName);

    await fs.writeFile(exportPath, JSON.stringify(exportData, null, 2), {
      encoding: 'utf8',
      mode: 0o600, // Restricted permissions
    });

    return {
      name,
      exportPath,
      message: `Wallet exported to: ${exportPath}. Keep this backup secure and delete after copying to safe storage.`,
    };
  }

  // Delete wallet (requires password confirmation)
  async delete(name: string, password: string): Promise<void> {
    // Verify password first
    await this.unlock(name, password);
    this.lock(name);

    // Delete file
    await fs.unlink(this.getWalletPath(name));
  }

  // Change password
  async changePassword(name: string, currentPassword: string, newPassword: string): Promise<void> {
    // Validate new password
    if (newPassword.length < 8) {
      throw new Error('New password must be at least 8 characters long.');
    }

    // Unlock with current password
    if (!this.isUnlocked(name)) {
      await this.unlock(name, currentPassword);
    }

    const wallet = this.getUnlockedWallet(name);
    const walletFile = await this.readWalletFile(name);
    if (!walletFile) {
      throw new Error('Failed to read wallet file.');
    }

    // Get secret key
    let secretKey: Uint8Array;
    if (wallet.chainType === 'solana' && wallet.solanaKeypair) {
      secretKey = wallet.solanaKeypair.secretKey;
    } else if (wallet.chainType === 'evm') {
      const salt = Buffer.from(walletFile.salt, 'base64');
      const nonce = Buffer.from(walletFile.nonce, 'base64');
      const authTag = Buffer.from(walletFile.authTag, 'base64');
      const ciphertext = Buffer.from(walletFile.ciphertext, 'base64');
      const key = await this.deriveKey(currentPassword, salt);
      secretKey = this.decrypt(ciphertext, key, nonce, authTag);
    } else {
      throw new Error('Cannot change password for this wallet.');
    }

    // Generate new salt/nonce
    const salt = randomBytes(SALT_LENGTH);
    const nonce = randomBytes(NONCE_LENGTH);
    const key = await this.deriveKey(newPassword, salt);
    const { ciphertext, authTag } = this.encrypt(secretKey, key, nonce);

    // Update wallet file
    const updatedFile: EncryptedWalletFile = {
      ...walletFile,
      salt: salt.toString('base64'),
      nonce: nonce.toString('base64'),
      authTag: authTag.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
      updatedAt: new Date().toISOString(),
    };

    // Write file
    await fs.writeFile(this.getWalletPath(name), JSON.stringify(updatedFile, null, 2), {
      encoding: 'utf-8',
      mode: 0o600,
    });
  }
}

// Singleton instance
let walletManagerInstance: WalletManager | null = null;

export function getWalletManager(): WalletManager {
  if (!walletManagerInstance) {
    walletManagerInstance = new WalletManager();
  }
  return walletManagerInstance;
}

export function setWalletManager(manager: WalletManager): void {
  walletManagerInstance = manager;
}
