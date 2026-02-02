# Changelog

## [0.2.2] - 2026-02-01

### Security
- SQL injection prevention via column whitelist in cache queries
- Session tokens for password-less wallet operations after unlock
- Wallet export writes to file instead of returning encrypted data

### Added
- Advanced SDK search filters: `mcpTools`, `a2aSkills`, `active`, `x402support`, `hasMcp`, `hasA2a`
- Multi-chain agent search with parallel queries
- Full-text search via SQLite FTS5 cache
- Cursor-based pagination for EVM chains

### Documentation
- Profile-specific workflows (Beginners, Developers, Agent Owners, AI Agents)
- Search behavior tips (cache_search for fuzzy, agent_search for exact)
- Write operation prerequisites and error handling guide
- Transaction preview examples with skipSend parameter
- Wallet password security warnings

### Fixed
- Use viem `formatUnits()` for decimal precision
- Preserve error stack traces in logging
- Wallet import now correctly generates session token
- Test cleanup scripts to kill orphan vitest processes

### Changed
- Removed tracked scripts with hardcoded test credentials

## [0.1.0] - 2026-01-20

### Added
- Initial release
- Multi-chain support (Solana, Ethereum, Base, Polygon)
- Agent search, get, register operations
- Feedback operations (give, list, revoke)
- Wallet management (create, import, unlock, export)
- x402 protocol integration
- Solana hash-chain integrity verification
- SQLite local cache with lazy sync
