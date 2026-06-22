import * as Joi from 'joi';

/**
 * Environment-variable validation schema.
 *
 * The app should FAIL FAST at startup if a required variable is missing or
 * malformed — much better than crashing later with a confusing error deep in a
 * database call. NestJS's ConfigModule runs this Joi schema against
 * `process.env` the moment the app boots.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().default(3000),
  GLOBAL_PREFIX: Joi.string().default('api'),

  // Database
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  DB_SYNCHRONIZE: Joi.boolean().default(false),
  DB_LOGGING: Joi.boolean().default(false),

  // Redis (used from Phase 3 onward; validated now so infra is ready)
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().default(6379),

  // JWT
  JWT_SECRET: Joi.string().min(16).required(),
  JWT_EXPIRES_IN: Joi.string().default('1d'),

  // Security
  CORS_ORIGINS: Joi.string().default('*'),
  AUTH_THROTTLE_TTL_MS: Joi.number().default(60000),
  AUTH_THROTTLE_LIMIT: Joi.number().default(15),
  BODY_LIMIT: Joi.string().default('1mb'),

  // Frontend URL for Stripe Checkout return links.
  FRONTEND_URL: Joi.string().default('http://localhost:5173'),
  // Stripe (optional — billing falls back to metering-only if unset).
  STRIPE_SECRET_KEY: Joi.string().allow('').default(''),
  STRIPE_WEBHOOK_SECRET: Joi.string().allow('').default(''),
});
