import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join as pathJoin } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const pkg = JSON.parse(
  readFileSync(pathJoin(__dirname, '..', '..', 'package.json'), 'utf-8')
) as { version?: string };

export const SERVER_VERSION = pkg.version ?? '0.0.0';
