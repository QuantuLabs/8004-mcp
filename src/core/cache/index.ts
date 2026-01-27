// Legacy full cache (heavy, background sync)
export * from './sqlite-store.js';
export * from './data-source.js';
export * from './sync-manager.js';
export * from './agent-cache.js';

// New lazy cache (lightweight, on-demand)
export * from './slim-store.js';
export * from './lazy-cache.js';
