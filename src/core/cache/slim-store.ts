// Slim SQLite store with TTL - optimized for on-demand caching
// ~50 bytes per agent instead of ~900 bytes

import Database from 'better-sqlite3';
import { homedir } from 'os';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import type { ChainPrefix, ChainType, IAgentSummary, ISearchResult } from '../interfaces/agent.js';

export interface ISlimAgent {
  id: string;           // global id: sol:xxx or base:8453:xxx
  chain: string;        // sol, base, eth
  raw_id: string;       // chain-specific id
  name: string;
  owner: string;
  trust_tier: number | null;
  quality_score: number | null;
  expires_at: number;   // TTL timestamp
}

export interface ISlimCacheConfig {
  dbPath?: string;
  ttlMs?: number;       // Default 24 hours
  maxEntries?: number;  // Max cached entries (LRU eviction)
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_MAX_ENTRIES = 10000;
const DEFAULT_CACHE_DIR = join(homedir(), '.8004-mcp');
const DEFAULT_DB_NAME = 'slim-cache.db';

export class SlimStore {
  private db: Database.Database;
  private readonly dbPath: string;
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(config?: ISlimCacheConfig) {
    this.dbPath = config?.dbPath ?? join(DEFAULT_CACHE_DIR, DEFAULT_DB_NAME);
    this.ttlMs = config?.ttlMs ?? DEFAULT_TTL_MS;
    this.maxEntries = config?.maxEntries ?? DEFAULT_MAX_ENTRIES;

    const dir = this.dbPath.substring(0, this.dbPath.lastIndexOf('/'));
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.initialize();
  }

  private initialize(): void {
    // Optimize for speed over durability (cache can be rebuilt)
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = OFF');
    this.db.pragma('cache_size = -8000'); // 8MB cache

    this.db.exec(`
      -- Slim agents table (~50 bytes per row)
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        chain TEXT NOT NULL,
        raw_id TEXT NOT NULL,
        name TEXT NOT NULL,
        owner TEXT NOT NULL,
        trust_tier INTEGER,
        quality_score REAL,
        expires_at INTEGER NOT NULL
      );

      -- Indexes for common queries
      CREATE INDEX IF NOT EXISTS idx_chain ON agents(chain);
      CREATE INDEX IF NOT EXISTS idx_expires ON agents(expires_at);
      CREATE INDEX IF NOT EXISTS idx_name ON agents(name COLLATE NOCASE);

      -- FTS5 for fast name search
      CREATE VIRTUAL TABLE IF NOT EXISTS agents_fts USING fts5(
        id,
        name,
        content='agents',
        content_rowid='rowid',
        tokenize='unicode61'
      );

      -- Triggers to keep FTS in sync
      CREATE TRIGGER IF NOT EXISTS agents_ai AFTER INSERT ON agents BEGIN
        INSERT INTO agents_fts(rowid, id, name) VALUES (NEW.rowid, NEW.id, NEW.name);
      END;

      CREATE TRIGGER IF NOT EXISTS agents_ad AFTER DELETE ON agents BEGIN
        INSERT INTO agents_fts(agents_fts, rowid, id, name) VALUES ('delete', OLD.rowid, OLD.id, OLD.name);
      END;

      CREATE TRIGGER IF NOT EXISTS agents_au AFTER UPDATE ON agents BEGIN
        INSERT INTO agents_fts(agents_fts, rowid, id, name) VALUES ('delete', OLD.rowid, OLD.id, OLD.name);
        INSERT INTO agents_fts(rowid, id, name) VALUES (NEW.rowid, NEW.id, NEW.name);
      END;
    `);
  }

  // Cache an agent (upsert with TTL refresh)
  cache(agent: {
    id: string;
    chain: ChainPrefix;
    rawId: string;
    name: string;
    owner: string;
    trustTier?: number;
    qualityScore?: number;
  }): void {
    const expiresAt = Date.now() + this.ttlMs;

    this.db.prepare(`
      INSERT INTO agents (id, chain, raw_id, name, owner, trust_tier, quality_score, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        owner = excluded.owner,
        trust_tier = excluded.trust_tier,
        quality_score = excluded.quality_score,
        expires_at = excluded.expires_at
    `).run(
      agent.id,
      agent.chain,
      agent.rawId,
      agent.name,
      agent.owner,
      agent.trustTier ?? null,
      agent.qualityScore ?? null,
      expiresAt
    );

    // Evict if over limit
    this.evictIfNeeded();
  }

  // Cache multiple agents
  cacheBatch(agents: Array<{
    id: string;
    chain: ChainPrefix;
    rawId: string;
    name: string;
    owner: string;
    trustTier?: number;
    qualityScore?: number;
  }>): void {
    const insertMany = this.db.transaction((items) => {
      for (const agent of items) {
        this.cache(agent);
      }
    });
    insertMany(agents);
  }

  // Get cached agent (returns null if expired)
  get(id: string): ISlimAgent | null {
    const row = this.db.prepare(
      'SELECT * FROM agents WHERE id = ? AND expires_at > ?'
    ).get(id, Date.now()) as ISlimAgent | undefined;

    return row ?? null;
  }

  // Search by name using FTS5
  search(query: string, options?: {
    chain?: string;
    limit?: number;
    offset?: number;
  }): ISearchResult {
    const limit = Math.min(options?.limit ?? 20, 100);
    const offset = options?.offset ?? 0;
    const now = Date.now();

    // Escape query for FTS5
    const ftsQuery = `"${query.replace(/"/g, '""')}"`;

    let sql: string;
    let countSql: string;
    const params: (string | number)[] = [];

    if (options?.chain) {
      sql = `
        SELECT a.* FROM agents a
        INNER JOIN agents_fts fts ON fts.id = a.id
        WHERE agents_fts MATCH ? AND a.chain = ? AND a.expires_at > ?
        ORDER BY bm25(agents_fts)
        LIMIT ? OFFSET ?
      `;
      countSql = `
        SELECT COUNT(*) as count FROM agents a
        INNER JOIN agents_fts fts ON fts.id = a.id
        WHERE agents_fts MATCH ? AND a.chain = ? AND a.expires_at > ?
      `;
      params.push(ftsQuery, options.chain, now, limit, offset);
    } else {
      sql = `
        SELECT a.* FROM agents a
        INNER JOIN agents_fts fts ON fts.id = a.id
        WHERE agents_fts MATCH ? AND a.expires_at > ?
        ORDER BY bm25(agents_fts)
        LIMIT ? OFFSET ?
      `;
      countSql = `
        SELECT COUNT(*) as count FROM agents a
        INNER JOIN agents_fts fts ON fts.id = a.id
        WHERE agents_fts MATCH ? AND a.expires_at > ?
      `;
      params.push(ftsQuery, now, limit, offset);
    }

    try {
      const rows = this.db.prepare(sql).all(...params) as ISlimAgent[];
      const countParams = options?.chain
        ? [ftsQuery, options.chain, now]
        : [ftsQuery, now];
      const countResult = this.db.prepare(countSql).get(...countParams) as { count: number };

      return {
        results: rows.map(row => this.toSummary(row)),
        total: countResult.count,
        hasMore: offset + rows.length < countResult.count,
        offset,
        limit,
      };
    } catch {
      // FTS query failed (e.g., syntax error), fallback to LIKE
      return this.searchLike(query, options);
    }
  }

  // Fallback search using LIKE
  private searchLike(query: string, options?: {
    chain?: string;
    limit?: number;
    offset?: number;
  }): ISearchResult {
    const limit = Math.min(options?.limit ?? 20, 100);
    const offset = options?.offset ?? 0;
    const now = Date.now();
    const pattern = `%${query}%`;

    let sql: string;
    let countSql: string;
    const params: (string | number)[] = [];

    if (options?.chain) {
      sql = `SELECT * FROM agents WHERE name LIKE ? AND chain = ? AND expires_at > ? LIMIT ? OFFSET ?`;
      countSql = `SELECT COUNT(*) as count FROM agents WHERE name LIKE ? AND chain = ? AND expires_at > ?`;
      params.push(pattern, options.chain, now, limit, offset);
    } else {
      sql = `SELECT * FROM agents WHERE name LIKE ? AND expires_at > ? LIMIT ? OFFSET ?`;
      countSql = `SELECT COUNT(*) as count FROM agents WHERE name LIKE ? AND expires_at > ?`;
      params.push(pattern, now, limit, offset);
    }

    const rows = this.db.prepare(sql).all(...params) as ISlimAgent[];
    const countParams = options?.chain ? [pattern, options.chain, now] : [pattern, now];
    const countResult = this.db.prepare(countSql).get(...countParams) as { count: number };

    return {
      results: rows.map(row => this.toSummary(row)),
      total: countResult.count,
      hasMore: offset + rows.length < countResult.count,
      offset,
      limit,
    };
  }

  // List all cached agents for a chain
  list(chain?: string, options?: { limit?: number; offset?: number }): ISearchResult {
    const limit = Math.min(options?.limit ?? 20, 100);
    const offset = options?.offset ?? 0;
    const now = Date.now();

    let sql: string;
    let countSql: string;
    const params: (string | number)[] = [];

    if (chain) {
      sql = `SELECT * FROM agents WHERE chain = ? AND expires_at > ? ORDER BY quality_score DESC NULLS LAST LIMIT ? OFFSET ?`;
      countSql = `SELECT COUNT(*) as count FROM agents WHERE chain = ? AND expires_at > ?`;
      params.push(chain, now, limit, offset);
    } else {
      sql = `SELECT * FROM agents WHERE expires_at > ? ORDER BY quality_score DESC NULLS LAST LIMIT ? OFFSET ?`;
      countSql = `SELECT COUNT(*) as count FROM agents WHERE expires_at > ?`;
      params.push(now, limit, offset);
    }

    const rows = this.db.prepare(sql).all(...params) as ISlimAgent[];
    const countParams = chain ? [chain, now] : [now];
    const countResult = this.db.prepare(countSql).get(...countParams) as { count: number };

    return {
      results: rows.map(row => this.toSummary(row)),
      total: countResult.count,
      hasMore: offset + rows.length < countResult.count,
      offset,
      limit,
    };
  }

  // Evict expired entries
  evictExpired(): number {
    const result = this.db.prepare('DELETE FROM agents WHERE expires_at < ?').run(Date.now());
    return result.changes;
  }

  // Evict oldest entries if over limit
  private evictIfNeeded(): void {
    this.db.prepare(`
      DELETE FROM agents WHERE rowid IN (
        SELECT rowid FROM agents ORDER BY expires_at ASC
        LIMIT MAX(0, (SELECT COUNT(*) FROM agents) - ?)
      )
    `).run(this.maxEntries);
  }

  // Stats
  getStats(): { total: number; byChain: Record<string, number>; dbSize: string; expired: number } {
    const now = Date.now();

    const total = (this.db.prepare('SELECT COUNT(*) as c FROM agents WHERE expires_at > ?').get(now) as { c: number }).c;
    const expired = (this.db.prepare('SELECT COUNT(*) as c FROM agents WHERE expires_at <= ?').get(now) as { c: number }).c;

    const byChainRows = this.db.prepare(
      'SELECT chain, COUNT(*) as count FROM agents WHERE expires_at > ? GROUP BY chain'
    ).all(now) as { chain: string; count: number }[];

    const byChain: Record<string, number> = {};
    for (const row of byChainRows) {
      byChain[row.chain] = row.count;
    }

    // Get database file size
    const sizeStmt = this.db.prepare("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()");
    const sizeResult = sizeStmt.get() as { size: number } | undefined;
    const sizeBytes = sizeResult?.size ?? 0;
    const dbSize = this.formatBytes(sizeBytes);

    return { total, byChain, dbSize, expired };
  }

  // Clear all cache
  clear(): void {
    this.db.exec('DELETE FROM agents');
  }

  close(): void {
    this.db.close();
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  private toSummary(row: ISlimAgent): IAgentSummary {
    return {
      id: row.raw_id,
      globalId: row.id,
      chainType: (row.chain === 'sol' ? 'solana' : 'evm') as ChainType,
      chainPrefix: row.chain as ChainPrefix,
      name: row.name,
      owner: row.owner,
      trustTier: row.trust_tier ?? undefined,
      qualityScore: row.quality_score ?? undefined,
    };
  }
}
