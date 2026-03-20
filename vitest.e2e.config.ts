import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

const e2eWorkers = Number.parseInt(process.env.VITEST_E2E_MAX_WORKERS ?? '1', 10);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    test: {
      env,
      globals: true,
      environment: 'node',
      include: ['tests/e2e/**/*.test.ts'],
      setupFiles: ['tests/e2e/setup-env.ts'],
      exclude: ['node_modules', 'dist'],
      pool: 'forks',
      maxWorkers: Number.isNaN(e2eWorkers) ? 1 : Math.max(1, e2eWorkers),
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        reportsDirectory: './coverage/e2e',
        include: ['src/**/*.ts'],
        exclude: ['src/**/*.d.ts', 'src/**/index.ts'],
      },
      testTimeout: 30000,
      hookTimeout: 30000,
    },
    resolve: {
      alias: {
        '@': '/src',
      },
    },
  };
});
