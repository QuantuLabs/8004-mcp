/**
 * ERC-8004 standardized tags for feedback
 */

// Tag values (case-insensitive storage)
export const Tag = {
  // Category tags (what metric)
  starred: 'starred',
  reachable: 'reachable',
  ownerVerified: 'ownerverified',
  uptime: 'uptime',
  successRate: 'successrate',
  responseTime: 'responsetime',
  blocktimeFreshness: 'blocktimefreshness',
  revenues: 'revenues',
  tradingYield: 'tradingyield',

  // Period tags (time window)
  day: 'day',
  week: 'week',
  month: 'month',
  year: 'year',

  // x402 protocol tags
  x402ResourceDelivered: 'x402-resource-delivered',
  x402DeliveryFailed: 'x402-delivery-failed',
  x402DeliveryTimeout: 'x402-delivery-timeout',
  x402QualityIssue: 'x402-quality-issue',
  x402GoodPayer: 'x402-good-payer',
  x402PaymentFailed: 'x402-payment-failed',
  x402InsufficientFunds: 'x402-insufficient-funds',
  x402InvalidSignature: 'x402-invalid-signature',
  x402Evm: 'exact-evm',
  x402Svm: 'exact-svm',
} as const;

export type TagValue = typeof Tag[keyof typeof Tag];

// Tag descriptions
const tagDescriptions: Record<string, string> = {
  // Category tags
  [Tag.starred]: 'User starred/favorited this agent',
  [Tag.reachable]: 'Agent endpoint is reachable (binary: 0 or 100)',
  [Tag.ownerVerified]: 'Owner identity verified (binary: 0 or 100)',
  [Tag.uptime]: 'Uptime percentage over the period (0-100)',
  [Tag.successRate]: 'Success rate percentage (0-100)',
  [Tag.responseTime]: 'Response time in milliseconds (lower is better)',
  [Tag.blocktimeFreshness]: 'Block time freshness in seconds (lower is better)',
  [Tag.revenues]: 'Revenues generated in USD (scaled by decimals)',
  [Tag.tradingYield]: 'Trading yield percentage (-100 to +100+)',

  // Period tags
  [Tag.day]: '24-hour period',
  [Tag.week]: '7-day period',
  [Tag.month]: '30-day period',
  [Tag.year]: '365-day period',

  // x402 tags
  [Tag.x402ResourceDelivered]: 'x402: Resource successfully delivered after payment',
  [Tag.x402DeliveryFailed]: 'x402: Delivery failed after payment',
  [Tag.x402DeliveryTimeout]: 'x402: Delivery timed out after payment',
  [Tag.x402QualityIssue]: 'x402: Quality issue with delivered resource',
  [Tag.x402GoodPayer]: 'x402: Client paid successfully (agent perspective)',
  [Tag.x402PaymentFailed]: 'x402: Client payment failed',
  [Tag.x402InsufficientFunds]: 'x402: Client had insufficient funds',
  [Tag.x402InvalidSignature]: 'x402: Invalid payment signature',
  [Tag.x402Evm]: 'x402: Payment on EVM chain (Base, Ethereum, etc.)',
  [Tag.x402Svm]: 'x402: Payment on Solana (SVM)',
};

// All known tag values for validation
const allKnownTags = new Set<string>(Object.values(Tag));

/**
 * Check if a tag is a known standardized tag
 */
export function isKnownTag(tag: string): boolean {
  return allKnownTags.has(tag.toLowerCase());
}

/**
 * Get description for a tag
 */
export function getTagDescription(tag: string): string | null {
  const normalized = tag.toLowerCase();
  return tagDescriptions[normalized] ?? null;
}
