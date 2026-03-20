#!/usr/bin/env node
import { spawn } from 'node:child_process';

const vitestArgs = process.argv.slice(2);
const bunCmd = process.platform === 'win32' ? 'bun.exe' : 'bun';
const bunxCmd = process.platform === 'win32' ? 'bunx.cmd' : 'bunx';

const run = spawn(bunxCmd, ['vitest', ...vitestArgs], {
  env: process.env,
  stdio: 'inherit',
  shell: false,
});

let stopping = false;
function stopVitest(signal = 'SIGTERM') {
  if (stopping || run.killed) return;
  stopping = true;
  try {
    run.kill(signal);
  } catch {
    // No-op: process may have already exited
  }
}

process.on('SIGINT', () => stopVitest('SIGINT'));
process.on('SIGTERM', () => stopVitest('SIGTERM'));
process.on('exit', () => stopVitest('SIGTERM'));

run.on('error', (err) => {
  console.error(`[vitest] failed to start: ${err.message}`);
  process.exit(1);
});

run.on('exit', (code, signal) => {
  if (signal) {
    console.error(`[vitest] exited due to signal ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
