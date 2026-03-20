import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const RUN_E2E = process.env.RUN_E2E === 'true';
const PACKAGE_VERSION = JSON.parse(
  readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')
) as { version: string };

type TextContent = { type: string; text?: string };
type MpcResult = { content?: TextContent[] };
type ToolListResult = { tools: Array<{ name: string }> };

function extractMcpText(result: unknown): string {
  if (result && typeof result === 'object' && 'content' in result) {
    const content = (result as MpcResult).content;
    if (Array.isArray(content) && content[0]?.text) {
      return content[0].text;
    }
  }
  return JSON.stringify(result);
}

function parseMcpJson<T>(result: unknown): T {
  return JSON.parse(extractMcpText(result)) as T;
}

function getChainPrefix(globalId: string): string {
  return globalId.split(':', 1)[0] ?? '';
}

describe.skipIf(!RUN_E2E)('Installed package MCP E2E - conversation style', () => {
  let tempDir = '';
  let npmCacheDir = '';
  let homeDir = '';
  let tarballPath = '';
  let client: Client;

  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), '8004-mcp-installed-'));
    npmCacheDir = join(tempDir, 'npm-cache');
    homeDir = join(tempDir, 'home');

    const tarballName = execFileSync(
      'npm',
      ['pack', '--silent', '--pack-destination', tempDir],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: { ...process.env, npm_config_cache: npmCacheDir },
      }
    )
      .trim()
      .split('\n')
      .at(-1);

    if (!tarballName) {
      throw new Error('npm pack did not produce a tarball name');
    }

    tarballPath = join(tempDir, tarballName);

    const transport = new StdioClientTransport({
      command: 'npm',
      args: [
        'exec',
        '--yes',
        '--cache',
        npmCacheDir,
        '--package',
        tarballPath,
        '8004-mcp',
      ],
      env: {
        ...process.env,
        HOME: homeDir,
        NETWORK_MODE: 'testnet',
        SOLANA_CLUSTER: 'devnet',
      },
    });

    client = new Client(
      { name: 'installed-package-e2e', version: '1.0.0' },
      { capabilities: {} }
    );

    await client.connect(transport);
  }, 120000);

  afterAll(async () => {
    try {
      await client?.close();
    } finally {
      if (tempDir) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });

  it('si je t installe, tu exposes bien la surface MCP attendue', async () => {
    const tools = await client.listTools() as ToolListResult;
    const names = tools.tools.map(tool => tool.name);

    expect(names.length).toBeGreaterThanOrEqual(90);
    expect(names).toContain('health_check');
    expect(names).toContain('config_get');
    expect(names).toContain('agent_search');
    expect(names).toContain('wallet_store_status');
    expect(names).toContain('x402_identity_build');
  }, 60000);

  it('quand je demande l état du serveur, la version et le setup vierge sont cohérents', async () => {
    const health = parseMcpJson<{
      server: string;
      version: string;
      networkMode: string;
      walletStore: string;
      chains: Record<string, { status: string }>;
    }>(await client.callTool({ name: 'health_check', arguments: {} }));

    expect(health.server).toBe('ok');
    expect(health.version).toBe(PACKAGE_VERSION.version);
    expect(health.networkMode).toBe('testnet');
    expect(health.walletStore).toBe('not_initialized');
    expect(health.chains.sol?.status).toBe('ok');
    expect(health.chains.base?.status).toBe('ok');
    expect(health.chains.bsc?.status).toBe('ok');
    expect(health.chains.monad?.status).toBe('ok');
  }, 60000);

  it('quand je demande quelles chaines sont live en testnet, polygon amoy reste bien hors jeu', async () => {
    const network = parseMcpJson<{
      mode: string;
      deployedChains: string[];
      chainStatus: Record<string, { deployed: boolean; chainId: number | string; hasSubgraph: boolean }>;
    }>(await client.callTool({ name: 'network_get', arguments: {} }));

    expect(network.mode).toBe('testnet');
    expect(network.deployedChains).toEqual(expect.arrayContaining(['sol', 'eth', 'base', 'bsc', 'monad']));
    expect(network.chainStatus.poly?.deployed).toBe(false);
    expect(network.chainStatus.poly?.hasSubgraph).toBe(false);
  }, 60000);

  it('quand je ne precise pas de chaine en testnet, agent_search fait bien une discovery cross-chain par defaut', async () => {
    const network = parseMcpJson<{
      deployedChains: string[];
      chainStatus: Record<string, { deployed: boolean }>;
    }>(await client.callTool({ name: 'network_get', arguments: {} }));

    const deployedChains = network.deployedChains.filter((chain) => network.chainStatus[chain]?.deployed);
    const perChainLimit = 10;
    const perChainTotals: number[] = [];

    for (const chain of deployedChains) {
      const scoped = parseMcpJson<{
        total: number;
      }>(
        await client.callTool({
          name: 'agent_search',
          arguments: { chain, limit: perChainLimit },
        })
      );
      perChainTotals.push(scoped.total);
    }

    const nonEmptyTotals = perChainTotals.filter((total) => total > 0);
    expect(nonEmptyTotals.length).toBeGreaterThan(1);

    const search = parseMcpJson<{
      results: Array<{ globalId: string }>;
      total: number;
      hasMore: boolean;
    }>(
      await client.callTool({
        name: 'agent_search',
        arguments: { limit: perChainLimit },
      })
    );

    const resultPrefixes = new Set(search.results.map((agent) => getChainPrefix(agent.globalId)));
    expect(search.total).toBeGreaterThan(Math.max(...nonEmptyTotals));
    expect(resultPrefixes.size).toBeGreaterThan(1);
    expect([...resultPrefixes].every((prefix) => deployedChains.includes(prefix))).toBe(true);
    expect(typeof search.hasMore).toBe('boolean');
  }, 60000);

  it.each([
    ['base', 'base:84532:'],
    ['bsc', 'bsc:97:'],
    ['monad', 'monad:10143:'],
  ])(
    'quand je dis "trouve-moi 2 agents sur %s", la recherche reste bien scopee a la bonne chaine',
    async (chain, expectedPrefix) => {
      const search = parseMcpJson<{
        results: Array<{ id: string; globalId: string; name?: string }>;
        total: number;
        hasMore: boolean;
      }>(
        await client.callTool({
          name: 'agent_search',
          arguments: { chain, limit: 2, hasMcp: false },
        })
      );

      expect(search.results.length).toBeGreaterThan(0);
      expect(search.results.every(agent => agent.globalId.startsWith(expectedPrefix))).toBe(true);
      expect(search.total).toBeGreaterThanOrEqual(search.results.length);
      expect(typeof search.hasMore).toBe('boolean');
    },
    60000
  );

  it('quand je passe la chaine par defaut sur base, un agent_get brut se resout bien sur base', async () => {
    await client.callTool({ name: 'config_set', arguments: { chain: 'base' } });

    const search = parseMcpJson<{
      results: Array<{ id: string; globalId: string }>;
    }>(
      await client.callTool({
        name: 'agent_search',
        arguments: { chain: 'base', limit: 1 },
      })
    );

    expect(search.results.length).toBeGreaterThan(0);

    const first = search.results[0];
    const detail = parseMcpJson<{
      id?: string;
      owner?: string;
      name?: string | null;
    }>(
      await client.callTool({
        name: 'agent_get',
        arguments: { id: first.id },
      })
    );

    expect(detail.id).toBe(first.id);
    expect(typeof detail.owner).toBe('string');
  }, 60000);

  it('quand je bascule en mainnet, polygon devient lisible et renvoie des agents', async () => {
    await client.callTool({ name: 'network_set', arguments: { mode: 'mainnet' } });

    const network = parseMcpJson<{
      mode: string;
      deployedChains: string[];
      chainStatus: Record<string, { deployed: boolean; chainId: number | string }>;
    }>(await client.callTool({ name: 'network_get', arguments: {} }));

    expect(network.mode).toBe('mainnet');
    expect(network.deployedChains).toContain('poly');
    expect(network.chainStatus.poly?.deployed).toBe(true);
    expect(network.chainStatus.poly?.chainId).toBe(137);

    const search = parseMcpJson<{
      results: Array<{ globalId: string }>;
      total: number;
    }>(
      await client.callTool({
        name: 'agent_search',
        arguments: { chain: 'poly', limit: 2 },
      })
    );

    expect(search.results.length).toBeGreaterThan(0);
    expect(search.results.every(agent => agent.globalId.startsWith('poly:137:'))).toBe(true);
    expect(search.total).toBeGreaterThanOrEqual(search.results.length);
  }, 60000);

  it('quand je ne precise pas de chaine en mainnet, agent_search fait bien une discovery cross-chain par defaut', async () => {
    const network = parseMcpJson<{
      deployedChains: string[];
      chainStatus: Record<string, { deployed: boolean }>;
    }>(await client.callTool({ name: 'network_get', arguments: {} }));

    const deployedChains = network.deployedChains.filter((chain) => network.chainStatus[chain]?.deployed);
    const perChainLimit = 10;
    const perChainTotals: number[] = [];

    for (const chain of deployedChains) {
      const scoped = parseMcpJson<{
        total: number;
      }>(
        await client.callTool({
          name: 'agent_search',
          arguments: { chain, limit: perChainLimit },
        })
      );
      perChainTotals.push(scoped.total);
    }

    const nonEmptyTotals = perChainTotals.filter((total) => total > 0);
    expect(nonEmptyTotals.length).toBeGreaterThan(1);

    const search = parseMcpJson<{
      results: Array<{ globalId: string }>;
      total: number;
      hasMore: boolean;
    }>(
      await client.callTool({
        name: 'agent_search',
        arguments: { limit: perChainLimit },
      })
    );

    const resultPrefixes = new Set(search.results.map((agent) => getChainPrefix(agent.globalId)));
    expect(search.total).toBeGreaterThan(Math.max(...nonEmptyTotals));
    expect(resultPrefixes.size).toBeGreaterThan(1);
    expect([...resultPrefixes].every((prefix) => deployedChains.includes(prefix))).toBe(true);
    expect(typeof search.hasMore).toBe('boolean');
  }, 60000);

  it('quand je demande le statut du wallet sur une install propre, rien n est preconfigure', async () => {
    const walletStatus = parseMcpJson<{
      initialized: boolean;
      unlocked: boolean;
      walletCount: number;
      wallets: unknown[];
      hint: string | null;
    }>(await client.callTool({ name: 'wallet_store_status', arguments: {} }));

    expect(walletStatus.initialized).toBe(false);
    expect(walletStatus.unlocked).toBe(false);
    expect(walletStatus.walletCount).toBe(0);
    expect(walletStatus.wallets).toEqual([]);
    expect(walletStatus.hint).toContain('wallet_store_init');
  }, 60000);
});
