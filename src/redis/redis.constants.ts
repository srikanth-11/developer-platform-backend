/**
 * DI token for the shared ioredis client. We inject it with
 * `@Inject(REDIS_CLIENT)` wherever we need Redis.
 */
export const REDIS_CLIENT = 'REDIS_CLIENT';
