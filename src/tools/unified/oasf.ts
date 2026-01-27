// Unified OASF validation tools

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getArgs, readString } from '../../core/parsers/common.js';
import { successResponse } from '../../core/serializers/common.js';
import {
  validateSkill,
  validateDomain,
  getAllSkills,
  getAllDomains,
} from '8004-solana';
import { Tag, isKnownTag, getTagDescription } from '../../core/utils/tags.js';

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
  {
    name: 'oasf_list_tags',
    description: 'List all 8004 standardized tags for feedback (category and period tags)',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'oasf_validate_tag',
    description: 'Check if a tag is a known 8004 standardized tag',
    inputSchema: {
      type: 'object',
      properties: {
        tag: {
          type: 'string',
          description: 'Tag to validate (e.g., "uptime", "day", "x402-resource-delivered")',
        },
      },
      required: ['tag'],
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

  oasf_list_tags: async () => {
    // Build structured tag list from Tag constant
    const categoryTags = [
      { key: 'starred', value: Tag.starred, description: getTagDescription(Tag.starred) },
      { key: 'reachable', value: Tag.reachable, description: getTagDescription(Tag.reachable) },
      { key: 'ownerVerified', value: Tag.ownerVerified, description: getTagDescription(Tag.ownerVerified) },
      { key: 'uptime', value: Tag.uptime, description: getTagDescription(Tag.uptime) },
      { key: 'successRate', value: Tag.successRate, description: getTagDescription(Tag.successRate) },
      { key: 'responseTime', value: Tag.responseTime, description: getTagDescription(Tag.responseTime) },
      { key: 'blocktimeFreshness', value: Tag.blocktimeFreshness, description: getTagDescription(Tag.blocktimeFreshness) },
      { key: 'revenues', value: Tag.revenues, description: getTagDescription(Tag.revenues) },
      { key: 'tradingYield', value: Tag.tradingYield, description: getTagDescription(Tag.tradingYield) },
    ];

    const periodTags = [
      { key: 'day', value: Tag.day, description: getTagDescription(Tag.day) },
      { key: 'week', value: Tag.week, description: getTagDescription(Tag.week) },
      { key: 'month', value: Tag.month, description: getTagDescription(Tag.month) },
      { key: 'year', value: Tag.year, description: getTagDescription(Tag.year) },
    ];

    const x402Tags = [
      { key: 'x402ResourceDelivered', value: Tag.x402ResourceDelivered, description: getTagDescription(Tag.x402ResourceDelivered) },
      { key: 'x402DeliveryFailed', value: Tag.x402DeliveryFailed, description: getTagDescription(Tag.x402DeliveryFailed) },
      { key: 'x402DeliveryTimeout', value: Tag.x402DeliveryTimeout, description: getTagDescription(Tag.x402DeliveryTimeout) },
      { key: 'x402QualityIssue', value: Tag.x402QualityIssue, description: getTagDescription(Tag.x402QualityIssue) },
      { key: 'x402GoodPayer', value: Tag.x402GoodPayer, description: getTagDescription(Tag.x402GoodPayer) },
      { key: 'x402PaymentFailed', value: Tag.x402PaymentFailed, description: getTagDescription(Tag.x402PaymentFailed) },
      { key: 'x402InsufficientFunds', value: Tag.x402InsufficientFunds, description: getTagDescription(Tag.x402InsufficientFunds) },
      { key: 'x402InvalidSignature', value: Tag.x402InvalidSignature, description: getTagDescription(Tag.x402InvalidSignature) },
      { key: 'x402Evm', value: Tag.x402Evm, description: getTagDescription(Tag.x402Evm) },
      { key: 'x402Svm', value: Tag.x402Svm, description: getTagDescription(Tag.x402Svm) },
    ];

    return successResponse({
      categoryTags,
      periodTags,
      x402Tags,
      usage: {
        tag1: 'Category tag (what metric)',
        tag2: 'Period tag (time window) or x402 network tag',
      },
    });
  },

  oasf_validate_tag: async (args: unknown) => {
    const input = getArgs(args);
    const tag = readString(input, 'tag', true);

    const isKnown = isKnownTag(tag);
    const description = getTagDescription(tag);

    return successResponse({
      tag,
      known: isKnown,
      description: description ?? (isKnown ? undefined : 'Custom tag (not standardized)'),
      message: isKnown
        ? `"${tag}" is a known 8004 standardized tag`
        : `"${tag}" is a custom tag (will work but not standardized)`,
    });
  },
};

// No aliases needed - same names
export const oasfAliases: Record<string, string> = {};
