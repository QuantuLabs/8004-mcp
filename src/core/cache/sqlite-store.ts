// SQLite store with FTS5 for agent cache

import Database from 'better-sqlite3';
import { homedir } from 'os';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import type { IAgentSummary, ISearchParams, ISearchResult, ChainPrefix, ChainType } from '../interfaces/agent.js';
import { McpError, McpErrorCode } from '../errors/mcp-error.js';

export interface ICachedAgent {
  id: string;
  chain_prefix: string;
  chain_type: string;
  chain_id: string | null;
  raw_id: string;
  name: string;
  name_lower: string;
  description: string | null;
  image: string | null;
  owner: string;
  collection: string | null;
  metadata: string | null;
  endpoints: string | null;
  trust_tier: number | null;
  quality_score: number | null;
  total_feedbacks: number;
  average_score: number;
  created_at: number;
  updated_at: number;
  synced_at: number;
}

export interface ISyncState {
  source_id: string;
  chain_prefix: string;
  last_cursor: string | null;
  last_timestamp: number | null;
  total_agents: number | null;
  status: 'idle' | 'syncing' | 'error';
  error_message: string | null;
  updated_at: number;
}

export interface IChainRecord {
  prefix: string;
  chain_type: string;
  chain_id: string | null;
  display_name: string;
  rpc_url: string | null;
  indexer_url: string | null;
  is_default: boolean;
  priority: number;
}

export interface ICacheStats {
  total: number;
  byChain: Record<string, number>;
  dbSize: string;
  lastSync: Record<string, number | null>;
}

export interface IUpsertAgent {
  id: string;
  chainPrefix: ChainPrefix;
  chainType: ChainType;
  chainId?: string;
  rawId: string;
  name: string;
  description?: string;
  image?: string;
  owner: string;
  collection?: string;
  metadata?: Record<string, unknown>;
  endpoints?: unknown[];
  trustTier?: number;
  qualityScore?: number;
  totalFeedbacks?: number;
  averageScore?: number;
  createdAt: number;
  updatedAt: number;
}

const DEFAULT_CACHE_DIR = join(homedir(), '.8004-mcp');
const DEFAULT_DB_NAME = 'cache.db';

export class SqliteStore {
  private db: Database.Database;
  private readonly dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath ?? join(DEFAULT_CACHE_DIR, DEFAULT_DB_NAME);

    // Ensure directory exists
    const dir = this.dbPath.substring(0, this.dbPath.lastIndexOf('/'));
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    try {
      this.db = new Database(this.dbPath);
      this.initialize();
    } catch (error) {
      throw new McpError(
        McpErrorCode.CACHE_INIT_FAILED,
        `Failed to initialize SQLite store: ${error instanceof Error ? error.message : String(error)}`,
        { dbPath: this.dbPath }
      );
    }
  }

  private initialize(): void {
    // Enable WAL mode for better concurrent read performance
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('mmap_size = 268435456'); // 256MB
    this.db.pragma('cache_size = -64000'); // 64MB

    // Create tables
    this.db.exec(`
      -- Agents table
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        chain_prefix TEXT NOT NULL,
        chain_type TEXT NOT NULL,
        chain_id TEXT,
        raw_id TEXT NOT NULL,
        name TEXT NOT NULL,
        name_lower TEXT NOT NULL,
        description TEXT,
        image TEXT,
        owner TEXT NOT NULL,
        collection TEXT,
        metadata TEXT,
        endpoints TEXT,
        trust_tier INTEGER,
        quality_score REAL,
        total_feedbacks INTEGER DEFAULT 0,
        average_score REAL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        synced_at INTEGER NOT NULL
      );

      -- Indexes for efficient queries
      CREATE INDEX IF NOT EXISTS idx_agents_chain_prefix ON agents(chain_prefix);
      CREATE INDEX IF NOT EXISTS idx_agents_chain_type ON agents(chain_type);
      CREATE INDEX IF NOT EXISTS idx_agents_owner ON agents(owner);
      CREATE INDEX IF NOT EXISTS idx_agents_collection ON agents(collection);
      CREATE INDEX IF NOT EXISTS idx_agents_updated ON agents(updated_at);
      CREATE INDEX IF NOT EXISTS idx_agents_quality ON agents(quality_score DESC);
      CREATE INDEX IF NOT EXISTS idx_agents_name_lower ON agents(name_lower);

      -- Sync state per chain source
      CREATE TABLE IF NOT EXISTS sync_state (
        source_id TEXT PRIMARY KEY,
        chain_prefix TEXT NOT NULL,
        last_cursor TEXT,
        last_timestamp INTEGER,
        total_agents INTEGER,
        status TEXT DEFAULT 'idle',
        error_message TEXT,
        updated_at INTEGER NOT NULL
      );

      -- Chain registry
      CREATE TABLE IF NOT EXISTS chains (
        prefix TEXT PRIMARY KEY,
        chain_type TEXT NOT NULL,
        chain_id TEXT,
        display_name TEXT NOT NULL,
        rpc_url TEXT,
        indexer_url TEXT,
        is_default INTEGER DEFAULT 0,
        priority INTEGER DEFAULT 99
      );
    `);

    // Create FTS5 virtual table if not exists
    const ftsExists = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agents_fts'")
      .get();

    if (!ftsExists) {
      this.db.exec(`
        -- FTS5 Virtual Table for fast name search
        CREATE VIRTUAL TABLE agents_fts USING fts5(
          id,
          name,
          description,
          content='agents',
          content_rowid='rowid',
          tokenize='unicode61 remove_diacritics 2'
        );

        -- Triggers to keep FTS in sync
        CREATE TRIGGER agents_ai AFTER INSERT ON agents BEGIN
          INSERT INTO agents_fts(rowid, id, name, description)
          VALUES (NEW.rowid, NEW.id, NEW.name, NEW.description);
        END;

        CREATE TRIGGER agents_ad AFTER DELETE ON agents BEGIN
          INSERT INTO agents_fts(agents_fts, rowid, id, name, description)
          VALUES ('delete', OLD.rowid, OLD.id, OLD.name, OLD.description);
        END;

        CREATE TRIGGER agents_au AFTER UPDATE ON agents BEGIN
          INSERT INTO agents_fts(agents_fts, rowid, id, name, description)
          VALUES ('delete', OLD.rowid, OLD.id, OLD.name, OLD.description);
          INSERT INTO agents_fts(rowid, id, name, description)
          VALUES (NEW.rowid, NEW.id, NEW.name, NEW.description);
        END;
      `);
    }

    // Insert default chains if not exist
    const insertChain = this.db.prepare(`
      INSERT OR IGNORE INTO chains (prefix, chain_type, chain_id, display_name, is_default, priority)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    insertChain.run('sol', 'solana', null, 'Solana', 1, 1);
    insertChain.run('base', 'evm', '8453', 'Base', 0, 2);
    insertChain.run('eth', 'evm', '1', 'Ethereum', 0, 3);
    insertChain.run('arb', 'evm', '42161', 'Arbitrum', 0, 4);
    insertChain.run('poly', 'evm', '137', 'Polygon', 0, 5);
    insertChain.run('op', 'evm', '10', 'Optimism', 0, 6);
  }

  // Agent operations
  upsertAgent(agent: IUpsertAgent): void {
    const stmt = this.db.prepare(`
      INSERT INTO agents (
        id, chain_prefix, chain_type, chain_id, raw_id, name, name_lower,
        description, image, owner, collection, metadata, endpoints,
        trust_tier, quality_score, total_feedbacks, average_score,
        created_at, updated_at, synced_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        name_lower = excluded.name_lower,
        description = excluded.description,
        image = excluded.image,
        owner = excluded.owner,
        collection = excluded.collection,
        metadata = excluded.metadata,
        endpoints = excluded.endpoints,
        trust_tier = excluded.trust_tier,
        quality_score = excluded.quality_score,
        total_feedbacks = excluded.total_feedbacks,
        average_score = excluded.average_score,
        updated_at = excluded.updated_at,
        synced_at = excluded.synced_at
      WHERE excluded.updated_at > agents.updated_at OR agents.updated_at IS NULL
    `);

    const now = Date.now();
    stmt.run(
      agent.id,
      agent.chainPrefix,
      agent.chainType,
      agent.chainId ?? null,
      agent.rawId,
      agent.name,
      agent.name.toLowerCase(),
      agent.description ?? null,
      agent.image ?? null,
      agent.owner,
      agent.collection ?? null,
      agent.metadata ? JSON.stringify(agent.metadata) : null,
      agent.endpoints ? JSON.stringify(agent.endpoints) : null,
      agent.trustTier ?? null,
      agent.qualityScore ?? null,
      agent.totalFeedbacks ?? 0,
      agent.averageScore ?? 0,
      agent.createdAt,
      agent.updatedAt,
      now
    );
  }

  upsertAgentsBatch(agents: IUpsertAgent[]): void {
    const insertMany = this.db.transaction((items: IUpsertAgent[]) => {
      for (const agent of items) {
        this.upsertAgent(agent);
      }
    });
    insertMany(agents);
  }

  getAgent(id: string): ICachedAgent | null {
    const stmt = this.db.prepare('SELECT * FROM agents WHERE id = ?');
    return stmt.get(id) as ICachedAgent | null;
  }

  deleteAgent(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM agents WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  // Search operations
  searchByName(query: string, options?: {
    chainPrefix?: string;
    limit?: number;
    offset?: number;
  }): ISearchResult {
    const limit = Math.min(options?.limit ?? 20, 100);
    const offset = options?.offset ?? 0;

    // Use FTS5 for search
    let sql: string;
    let countSql: string;
    const params: (string | number)[] = [];

    if (options?.chainPrefix) {
      sql = `
        SELECT a.* FROM agents a
        INNER JOIN agents_fts fts ON fts.id = a.id
        WHERE agents_fts MATCH ? AND a.chain_prefix = ?
        ORDER BY bm25(agents_fts)
        LIMIT ? OFFSET ?
      `;
      countSql = `
        SELECT COUNT(*) as count FROM agents a
        INNER JOIN agents_fts fts ON fts.id = a.id
        WHERE agents_fts MATCH ? AND a.chain_prefix = ?
      `;
      params.push(this.escapeFtsQuery(query), options.chainPrefix, limit, offset);
    } else {
      sql = `
        SELECT a.* FROM agents a
        INNER JOIN agents_fts fts ON fts.id = a.id
        WHERE agents_fts MATCH ?
        ORDER BY bm25(agents_fts)
        LIMIT ? OFFSET ?
      `;
      countSql = `
        SELECT COUNT(*) as count FROM agents a
        INNER JOIN agents_fts fts ON fts.id = a.id
        WHERE agents_fts MATCH ?
      `;
      params.push(this.escapeFtsQuery(query), limit, offset);
    }

    const rows = this.db.prepare(sql).all(...params) as ICachedAgent[];
    const countParams = options?.chainPrefix
      ? [this.escapeFtsQuery(query), options.chainPrefix]
      : [this.escapeFtsQuery(query)];
    const countResult = this.db.prepare(countSql).get(...countParams) as { count: number };

    return {
      results: rows.map(row => this.toAgentSummary(row)),
      total: countResult.count,
      hasMore: offset + rows.length < countResult.count,
      offset,
      limit,
    };
  }

  searchAgents(params: ISearchParams): ISearchResult {
    const limit = Math.min(params.limit ?? 20, 100);
    const offset = params.offset ?? 0;

    const conditions: string[] = [];
    const sqlParams: (string | number)[] = [];

    if (params.query) {
      // Use LIKE for simple substring search (FTS for more complex)
      conditions.push('name_lower LIKE ?');
      sqlParams.push(`%${params.query.toLowerCase()}%`);
    }
    if (params.owner) {
      conditions.push('owner = ?');
      sqlParams.push(params.owner);
    }
    if (params.collection) {
      conditions.push('collection = ?');
      sqlParams.push(params.collection);
    }
    if (params.chainType) {
      conditions.push('chain_type = ?');
      sqlParams.push(params.chainType);
    }
    if (params.chainPrefix) {
      conditions.push('chain_prefix = ?');
      sqlParams.push(params.chainPrefix);
    }
    if (params.minQualityScore !== undefined) {
      conditions.push('quality_score >= ?');
      sqlParams.push(params.minQualityScore);
    }
    if (params.minTrustTier !== undefined) {
      conditions.push('trust_tier >= ?');
      sqlParams.push(params.minTrustTier);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Build ORDER BY (whitelist columns to prevent SQL injection)
    const VALID_ORDER_COLUMNS = ['updated_at', 'created_at', 'name', 'quality_score', 'trust_tier', 'id'] as const;
    const VALID_ORDER_DIRS = ['asc', 'desc'] as const;
    const orderColumn = VALID_ORDER_COLUMNS.includes(params.orderBy as typeof VALID_ORDER_COLUMNS[number])
      ? params.orderBy
      : 'updated_at';
    const orderDir = VALID_ORDER_DIRS.includes(params.orderDir?.toLowerCase() as typeof VALID_ORDER_DIRS[number])
      ? params.orderDir!.toLowerCase()
      : 'desc';
    const orderClause = `ORDER BY ${orderColumn} ${orderDir.toUpperCase()}`;

    const sql = `SELECT * FROM agents ${whereClause} ${orderClause} LIMIT ? OFFSET ?`;
    const countSql = `SELECT COUNT(*) as count FROM agents ${whereClause}`;

    const rows = this.db.prepare(sql).all(...sqlParams, limit, offset) as ICachedAgent[];
    const countResult = this.db.prepare(countSql).get(...sqlParams) as { count: number };

    return {
      results: rows.map(row => this.toAgentSummary(row)),
      total: countResult.count,
      hasMore: offset + rows.length < countResult.count,
      offset,
      limit,
    };
  }

  // Sync state operations
  getSyncState(sourceId: string): ISyncState | null {
    const stmt = this.db.prepare('SELECT * FROM sync_state WHERE source_id = ?');
    return stmt.get(sourceId) as ISyncState | null;
  }

  updateSyncState(sourceId: string, updates: Partial<Omit<ISyncState, 'source_id' | 'updated_at'>>): void {
    const existing = this.getSyncState(sourceId);
    const now = Date.now();

    if (existing) {
      const fields: string[] = ['updated_at = ?'];
      const values: (string | number | null)[] = [now];

      if (updates.chain_prefix !== undefined) {
        fields.push('chain_prefix = ?');
        values.push(updates.chain_prefix);
      }
      if (updates.last_cursor !== undefined) {
        fields.push('last_cursor = ?');
        values.push(updates.last_cursor);
      }
      if (updates.last_timestamp !== undefined) {
        fields.push('last_timestamp = ?');
        values.push(updates.last_timestamp);
      }
      if (updates.total_agents !== undefined) {
        fields.push('total_agents = ?');
        values.push(updates.total_agents);
      }
      if (updates.status !== undefined) {
        fields.push('status = ?');
        values.push(updates.status);
      }
      if (updates.error_message !== undefined) {
        fields.push('error_message = ?');
        values.push(updates.error_message);
      }

      values.push(sourceId);
      const sql = `UPDATE sync_state SET ${fields.join(', ')} WHERE source_id = ?`;
      this.db.prepare(sql).run(...values);
    } else {
      const stmt = this.db.prepare(`
        INSERT INTO sync_state (source_id, chain_prefix, last_cursor, last_timestamp, total_agents, status, error_message, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        sourceId,
        updates.chain_prefix ?? '',
        updates.last_cursor ?? null,
        updates.last_timestamp ?? null,
        updates.total_agents ?? null,
        updates.status ?? 'idle',
        updates.error_message ?? null,
        now
      );
    }
  }

  // Chain operations
  getChain(prefix: string): IChainRecord | null {
    const stmt = this.db.prepare('SELECT * FROM chains WHERE prefix = ?');
    const row = stmt.get(prefix) as { is_default: number; [key: string]: unknown } | undefined;
    if (!row) return null;
    return {
      ...row,
      is_default: row.is_default === 1,
    } as unknown as IChainRecord;
  }

  getDefaultChain(): IChainRecord | null {
    const stmt = this.db.prepare('SELECT * FROM chains WHERE is_default = 1');
    const row = stmt.get() as { is_default: number; [key: string]: unknown } | undefined;
    if (!row) return null;
    return {
      ...row,
      is_default: row.is_default === 1,
    } as unknown as IChainRecord;
  }

  getAllChains(): IChainRecord[] {
    const stmt = this.db.prepare('SELECT * FROM chains ORDER BY priority');
    const rows = stmt.all() as { is_default: number; [key: string]: unknown }[];
    return rows.map(row => ({
      ...row,
      is_default: row.is_default === 1,
    })) as unknown as IChainRecord[];
  }

  updateChain(prefix: string, updates: Partial<Omit<IChainRecord, 'prefix'>>): void {
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (updates.chain_type !== undefined) {
      fields.push('chain_type = ?');
      values.push(updates.chain_type);
    }
    if (updates.chain_id !== undefined) {
      fields.push('chain_id = ?');
      values.push(updates.chain_id);
    }
    if (updates.display_name !== undefined) {
      fields.push('display_name = ?');
      values.push(updates.display_name);
    }
    if (updates.rpc_url !== undefined) {
      fields.push('rpc_url = ?');
      values.push(updates.rpc_url);
    }
    if (updates.indexer_url !== undefined) {
      fields.push('indexer_url = ?');
      values.push(updates.indexer_url);
    }
    if (updates.is_default !== undefined) {
      fields.push('is_default = ?');
      values.push(updates.is_default ? 1 : 0);
    }
    if (updates.priority !== undefined) {
      fields.push('priority = ?');
      values.push(updates.priority);
    }

    if (fields.length === 0) return;

    values.push(prefix);
    const sql = `UPDATE chains SET ${fields.join(', ')} WHERE prefix = ?`;
    this.db.prepare(sql).run(...values);
  }

  // Stats
  getStats(): ICacheStats {
    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM agents');
    const total = (totalStmt.get() as { count: number }).count;

    const byChainStmt = this.db.prepare(`
      SELECT chain_prefix, COUNT(*) as count FROM agents GROUP BY chain_prefix
    `);
    const byChainRows = byChainStmt.all() as { chain_prefix: string; count: number }[];
    const byChain: Record<string, number> = {};
    for (const row of byChainRows) {
      byChain[row.chain_prefix] = row.count;
    }

    const syncStmt = this.db.prepare('SELECT source_id, last_timestamp FROM sync_state');
    const syncRows = syncStmt.all() as { source_id: string; last_timestamp: number | null }[];
    const lastSync: Record<string, number | null> = {};
    for (const row of syncRows) {
      lastSync[row.source_id] = row.last_timestamp;
    }

    // Get database file size
    const sizeStmt = this.db.prepare("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()");
    const sizeResult = sizeStmt.get() as { size: number } | undefined;
    const sizeBytes = sizeResult?.size ?? 0;
    const dbSize = this.formatBytes(sizeBytes);

    return { total, byChain, dbSize, lastSync };
  }

  // Utilities
  optimizeFts(): void {
    this.db.exec("INSERT INTO agents_fts(agents_fts) VALUES('optimize')");
  }

  vacuum(): void {
    this.db.exec('VACUUM');
  }

  close(): void {
    this.db.close();
  }

  private escapeFtsQuery(query: string): string {
    // Escape special FTS5 characters and wrap in quotes for phrase search
    const escaped = query.replace(/["]/g, '""');
    return `"${escaped}"`;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  private toAgentSummary(row: ICachedAgent): IAgentSummary {
    return {
      id: row.raw_id,
      globalId: row.id,
      chainType: row.chain_type as ChainType,
      chainPrefix: row.chain_prefix as ChainPrefix,
      name: row.name,
      description: row.description ?? undefined,
      image: row.image ?? undefined,
      owner: row.owner,
      collection: row.collection ?? undefined,
      trustTier: row.trust_tier ?? undefined,
      qualityScore: row.quality_score ?? undefined,
      totalFeedbacks: row.total_feedbacks ?? undefined,
    };
  }
}
