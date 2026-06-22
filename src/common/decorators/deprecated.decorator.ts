import { SetMetadata } from '@nestjs/common';

export const DEPRECATION_KEY = 'deprecation';

export interface DeprecationOptions {
  /** HTTP-date when the version stops working (the `Sunset` header). */
  sunset?: string;
  /** URL of the migration guide (advertised via the `Link` header). */
  link?: string;
  /** Human-readable warning message. */
  message?: string;
}

/**
 * `@Deprecated({...})` — mark a controller/route as deprecated.
 *
 * Attaches metadata that DeprecationInterceptor turns into standard response
 * headers (`Deprecation`, `Sunset`, `Link`, `Warning`) so clients are told —
 * programmatically — that they should migrate, and by when.
 */
export const Deprecated = (options: DeprecationOptions = {}) =>
  SetMetadata(DEPRECATION_KEY, options);
