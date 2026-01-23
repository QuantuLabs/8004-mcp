/**
 * Basic MCP Client Setup Example
 *
 * This example shows how to connect to the 8004-mcp server
 * and make basic tool calls.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn, type ChildProcess } from 'child_process';

/**
 * Create an MCP client connected to 8004-mcp
 */
async function createMcpClient(): Promise<{
  client: Client;
  server: ChildProcess;
  cleanup: () => void;
}> {
  // Start the MCP server as a child process
  const server = spawn('npx', ['@quantulabs/8004-mcp'], {
    stdio: ['pipe', 'pipe', 'inherit'], // stdin, stdout, stderr
    env: {
      ...process.env,
      // Optional: Configure via environment variables
      // NETWORK_MODE: 'testnet',
      // DEFAULT_CHAIN: 'sol',
      // PINATA_JWT: 'your-jwt-here',
    },
  });

  // Create transport using stdin/stdout
  const transport = new StdioClientTransport({
    reader: server.stdout!,
    writer: server.stdin!,
  });

  // Create MCP client
  const client = new Client(
    { name: 'basic-example', version: '1.0.0' },
    { capabilities: {} }
  );

  // Connect to the server
  await client.connect(transport);

  // Cleanup function
  const cleanup = () => {
    client.close();
    server.kill();
  };

  return { client, server, cleanup };
}

/**
 * Helper to call a tool and parse JSON response
 */
async function callTool<T>(
  client: Client,
  name: string,
  args: Record<string, unknown>
): Promise<T> {
  const result = await client.callTool({ name, arguments: args });
  const content = result.content as Array<{ type: string; text: string }>;
  return JSON.parse(content[0].text) as T;
}

async function main() {
  console.log('Connecting to 8004-mcp...');
  const { client, cleanup } = await createMcpClient();

  try {
    // ============================================
    // Example 1: Get configuration
    // ============================================
    console.log('\n--- Get Configuration ---');

    const config = await callTool<{
      chain: string;
      networkMode: string;
      solana: { cluster: string };
    }>(client, 'config_get', {});

    console.log('Current config:');
    console.log(`  Chain: ${config.chain}`);
    console.log(`  Network: ${config.networkMode}`);
    console.log(`  Solana Cluster: ${config.solana?.cluster ?? 'N/A'}`);

    // ============================================
    // Example 2: Search for agents
    // ============================================
    console.log('\n--- Search Agents ---');

    const searchResult = await callTool<{
      results: Array<{ name: string; globalId: string }>;
      total: number;
    }>(client, 'cache_search', {
      query: 'trading',
      limit: 5,
    });

    console.log(`Found ${searchResult.total} agents:`);
    for (const agent of searchResult.results) {
      console.log(`  - ${agent.name} (${agent.globalId})`);
    }

    // ============================================
    // Example 3: Get network status
    // ============================================
    console.log('\n--- Network Status ---');

    const networkStatus = await callTool<{
      mode: string;
      chains: Record<string, { deployed: boolean; chainId: string | number }>;
    }>(client, 'network_get', {});

    console.log(`Network Mode: ${networkStatus.mode}`);
    for (const [chain, status] of Object.entries(networkStatus.chains)) {
      console.log(
        `  ${chain}: ${status.deployed ? 'deployed' : 'not deployed'} (${status.chainId})`
      );
    }

    // ============================================
    // Example 4: List wallets
    // ============================================
    console.log('\n--- Wallets ---');

    const wallets = await callTool<{
      wallets: Array<{ name: string; address: string; chainType: string }>;
    }>(client, 'wallet_list', {});

    if (wallets.wallets.length === 0) {
      console.log('No wallets configured');
      console.log('Create one with: wallet_create');
    } else {
      for (const wallet of wallets.wallets) {
        console.log(`  - ${wallet.name}: ${wallet.address} (${wallet.chainType})`);
      }
    }

    // ============================================
    // Example 5: List available tools
    // ============================================
    console.log('\n--- Available Tools ---');

    const tools = await client.listTools();
    console.log(`Total tools available: ${tools.tools.length}`);

    // Group by category
    const categories: Record<string, number> = {};
    for (const tool of tools.tools) {
      const prefix = tool.name.split('_')[0];
      categories[prefix] = (categories[prefix] ?? 0) + 1;
    }

    console.log('By category:');
    for (const [category, count] of Object.entries(categories).sort(
      (a, b) => b[1] - a[1]
    )) {
      console.log(`  ${category}: ${count} tools`);
    }

    console.log('\n--- Done ---');
  } finally {
    cleanup();
  }
}

main().catch(console.error);
