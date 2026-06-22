import { SetMetadata } from '@nestjs/common';

export const FEATURE_KEY = 'required_feature';

/**
 * `@RequireFeature('api_marketplace')` — gate a route behind a feature flag.
 * FeatureGuard reads this and returns 403 if the org doesn't have it enabled.
 */
export const RequireFeature = (key: string) => SetMetadata(FEATURE_KEY, key);
