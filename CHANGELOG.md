# Changelog

## [0.2.0] - 2026-01-31

### Security
- SQL injection prevention via column whitelist in cache queries
- Session tokens for password-less wallet operations after unlock
- Wallet export writes to file instead of returning encrypted data

### Added
- Advanced SDK search filters: `mcpTools`, `a2aSkills`, `active`, `x402support`, `hasMcp`, `hasA2a`
- Multi-chain agent search with parallel queries
- Full-text search via SQLite FTS5 cache

### Fixed
- Use viem `formatUnits()` for decimal precision
- Preserve error stack traces in logging
- Wallet import now correctly generates session token

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
