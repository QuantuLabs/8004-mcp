// Unified OASF validation tools

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getArgs, readString } from '../../core/parsers/common.js';
import { successResponse } from '../../core/serializers/common.js';
import { validateSkill, validateDomain, getAllSkills, getAllDomains } from '8004-solana';

export const oasfTools: Tool[] = [
  {
    name: 'oasf_validate_skill',
    description: 'Validate an OASF skill slug format',
    inputSchema: {
      type: 'object',
      properties: {
        skill: {
          type: 'string',
          description: 'Skill slug to validate (e.g., "web-search")',
        },
      },
      required: ['skill'],
    },
  },
  {
    name: 'oasf_validate_domain',
    description: 'Validate an OASF domain slug format',
    inputSchema: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          description: 'Domain slug to validate (e.g., "finance")',
        },
      },
      required: ['domain'],
    },
  },
  {
    name: 'oasf_list_skills',
    description: 'List all valid OASF skill slugs',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'oasf_list_domains',
    description: 'List all valid OASF domain slugs',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

export const oasfHandlers: Record<string, (args: unknown) => Promise<unknown>> = {
  oasf_validate_skill: async (args: unknown) => {
    const input = getArgs(args);
    const skill = readString(input, 'skill', true);

    const isValid = validateSkill(skill);

    return successResponse({
      skill,
      valid: isValid,
      message: isValid ? 'Valid OASF skill' : 'Invalid OASF skill slug',
    });
  },

  oasf_validate_domain: async (args: unknown) => {
    const input = getArgs(args);
    const domain = readString(input, 'domain', true);

    const isValid = validateDomain(domain);

    return successResponse({
      domain,
      valid: isValid,
      message: isValid ? 'Valid OASF domain' : 'Invalid OASF domain slug',
    });
  },

  oasf_list_skills: async () => {
    const skills = getAllSkills();
    return successResponse({
      skills,
      count: skills.length,
    });
  },

  oasf_list_domains: async () => {
    const domains = getAllDomains();
    return successResponse({
      domains,
      count: domains.length,
    });
  },
};

// No aliases needed - same names
export const oasfAliases: Record<string, string> = {};
