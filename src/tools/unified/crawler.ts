// Unified crawler tools for MCP/A2A endpoint discovery

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getArgs, readString, readNumber } from '../../core/parsers/common.js';
import { successResponse } from '../../core/serializers/common.js';
import { globalState } from '../../state/global-state.js';
import { EndpointCrawler } from '8004-solana';

// SSRF Protection: Validate URLs to prevent internal network scanning
const PRIVATE_IP_PATTERNS = [
  /^127\./,                           // Loopback 127.0.0.0/8
  /^10\./,                            // Private 10.0.0.0/8
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,   // Private 172.16.0.0/12
  /^192\.168\./,                      // Private 192.168.0.0/16
  /^169\.254\./,                      // Link-local 169.254.0.0/16
  /^0\./,                             // Reserved 0.0.0.0/8
  /^::1$/,                            // IPv6 loopback
  /^fc00:/i,                          // IPv6 unique local
  /^fe80:/i,                          // IPv6 link-local
];

const BLOCKED_HOSTNAMES = [
  'localhost',
  'localhost.localdomain',
  '127.0.0.1',
  '::1',
  '0.0.0.0',
  'metadata.google.internal',         // GCP metadata
  '169.254.169.254',                   // AWS/GCP/Azure metadata
];

function validateCrawlerUrl(urlString: string): { valid: boolean; error?: string } {
  try {
    const url = new URL(urlString);

    // Only allow http/https schemes
    if (!['http:', 'https:'].includes(url.protocol)) {
      return { valid: false, error: `Invalid scheme: ${url.protocol}. Only http/https allowed.` };
    }

    const hostname = url.hostname.toLowerCase();

    // Block known internal hostnames
    if (BLOCKED_HOSTNAMES.includes(hostname)) {
      return { valid: false, error: `Blocked hostname: ${hostname}` };
    }

    // Block private IP addresses
    for (const pattern of PRIVATE_IP_PATTERNS) {
      if (pattern.test(hostname)) {
        return { valid: false, error: `Private IP address not allowed: ${hostname}` };
      }
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

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

    // SSRF protection: validate URL before making request
    const validation = validateCrawlerUrl(url);
    if (!validation.valid) {
      return successResponse({
        success: false,
        url,
        error: validation.error,
      });
    }

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

    // SSRF protection: validate URL before making request
    const validation = validateCrawlerUrl(url);
    if (!validation.valid) {
      return successResponse({
        success: false,
        url,
        error: validation.error,
      });
    }

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

    // SSRF protection: validate URL before making request
    const validation = validateCrawlerUrl(url);
    if (!validation.valid) {
      return successResponse({
        alive: false,
        url,
        error: validation.error,
      });
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        redirect: 'manual', // Don't follow redirects to prevent SSRF via redirect
      });

      clearTimeout(timeoutId);

      return successResponse({
        alive: response.ok || (response.status >= 300 && response.status < 400),
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
