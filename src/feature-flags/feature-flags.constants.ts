/**
 * The catalogue of KNOWN feature flags + their default state.
 *
 * A flag not explicitly set for an org falls back to its `default` here. Keeping
 * a central registry (rather than free-form strings) means typos are caught and
 * the UI can list every available toggle with a description.
 */
export interface FlagDefinition {
  key: string;
  description: string;
  default: boolean;
}

export const KNOWN_FLAGS: Record<string, FlagDefinition> = {
  advanced_analytics: {
    key: 'advanced_analytics',
    description: 'Advanced analytics dashboards (latency percentiles, trends).',
    default: false,
  },
  api_marketplace: {
    key: 'api_marketplace',
    description: 'Publish APIs to, and subscribe via, the marketplace.',
    default: false,
  },
  webhooks: {
    key: 'webhooks',
    description: 'Outbound webhook deliveries.',
    default: true,
  },
  custom_branding: {
    key: 'custom_branding',
    description: 'Custom logo/colors on the developer portal.',
    default: false,
  },
};

export const isKnownFlag = (key: string): boolean => key in KNOWN_FLAGS;
