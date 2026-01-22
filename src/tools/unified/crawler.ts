// Unified crawler tools for MCP/A2A endpoint discovery

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getArgs, readString, readNumber } from '../../core/parsers/common.js';
import { successResponse } from '../../core/serializers/common.js';
import { globalState } from '../../state/global-state.js';
import { EndpointCrawler } from '8004-solana';

export const crawlerTools: Tool[] = [
  {
    name: 'crawler_fetch_mcp',
    description: 'Fetch MCP (Model Context Protocol) capabilities from an endpoint',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'MCP endpoint URL',
        },
        timeoutMs: {
          type: 'number',
          description: 'Request timeout in milliseconds (default: from config)',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'crawler_fetch_a2a',
    description: 'Fetch A2A (Agent-to-Agent) capabilities from an endpoint',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'A2A endpoint URL (base URL, will append /.well-known/agent.json)',
        },
        timeoutMs: {
          type: 'number',
          description: 'Request timeout in milliseconds (default: from config)',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'crawler_is_alive',
    description: 'Check if an endpoint is responding (health check)',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Endpoint URL to check',
        },
        timeoutMs: {
          type: 'number',
          description: 'Request timeout in milliseconds',
        },
      },
      required: ['url'],
    },
  },
];

export const crawlerHandlers: Record<string, (args: unknown) => Promise<unknown>> = {
  crawler_fetch_mcp: async (args: unknown) => {
    const input = getArgs(args);
    const url = readString(input, 'url', true);
    const timeoutMs = readNumber(input, 'timeoutMs') ?? globalState.crawlerTimeoutMs;

    try {
      const crawler = new EndpointCrawler(timeoutMs);
      const capabilities = await crawler.fetchMcpCapabilities(url);
      return successResponse({
        success: true,
        url,
        capabilities,
      });
    } catch (error) {
      return successResponse({
        success: false,
        url,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  crawler_fetch_a2a: async (args: unknown) => {
    const input = getArgs(args);
    const url = readString(input, 'url', true);
    const timeoutMs = readNumber(input, 'timeoutMs') ?? globalState.crawlerTimeoutMs;

    try {
      const crawler = new EndpointCrawler(timeoutMs);
      const capabilities = await crawler.fetchA2aCapabilities(url);
      return successResponse({
        success: true,
        url,
        capabilities,
      });
    } catch (error) {
      return successResponse({
        success: false,
        url,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  crawler_is_alive: async (args: unknown) => {
    const input = getArgs(args);
    const url = readString(input, 'url', true);
    const timeoutMs = readNumber(input, 'timeoutMs') ?? globalState.crawlerTimeoutMs;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      return successResponse({
        alive: response.ok,
        url,
        status: response.status,
        statusText: response.statusText,
      });
    } catch (error) {
      return successResponse({
        alive: false,
        url,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
};

// Backward compatibility aliases
export const crawlerAliases: Record<string, string> = {
  crawler_fetch_mcp_capabilities: 'crawler_fetch_mcp',
  crawler_fetch_a2a_capabilities: 'crawler_fetch_a2a',
  sdk_is_it_alive: 'crawler_is_alive',
};
