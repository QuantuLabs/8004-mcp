import { appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const LOG_DIR = join(homedir(), '.8004-mcp', 'logs');
const LOG_FILE = join(LOG_DIR, 'audit.log');

let initialized = false;

function ensureLogDir(): void {
  if (initialized) return;
  try {
    mkdirSync(LOG_DIR, { recursive: true, mode: 0o700 });
    initialized = true;
  } catch {
    // Ignore errors - logging is best-effort
  }
}

function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = '';
    parsed.username = '';
    parsed.password = '';
    return parsed.toString();
  } catch {
    return '[invalid-url]';
  }
}

function sanitizeDetails(details: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (typeof value === 'string' && (key.toLowerCase().includes('url') || key.toLowerCase().includes('uri'))) {
      sanitized[key] = sanitizeUrl(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export function auditLog(
  operation: string,
  details: Record<string, unknown> = {}
): void {
  ensureLogDir();
  const entry = {
    timestamp: new Date().toISOString(),
    operation,
    ...sanitizeDetails(details),
  };
  try {
    appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', { mode: 0o600 });
  } catch {
    // Logging is best-effort
  }
}
