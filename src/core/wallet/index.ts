// Wallet management exports

// New unified wallet store (v2)
export {
  WalletStore,
  getWalletStore,
  setWalletStore,
  type WalletChainType,
  type WalletInfo,
  type UnlockedWallet,
  type StoreStatus,
} from './wallet-store.js';

// Legacy wallet manager (deprecated, kept for migration)
export {
  WalletManager,
  getWalletManager,
  setWalletManager,
  type WalletListResult,
  type WalletCreateResult,
  type WalletUnlockResult,
} from './wallet-manager.js';
