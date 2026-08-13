import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  PORT: Joi.number().default(3000),

  FRONTEND_URL: Joi.string().uri().default('http://localhost:5173'),

  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().required(),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_DATABASE: Joi.string().required(),

  DATABASE_URL: Joi.string().required(),

  MASTRA_BASE_URL: Joi.string().uri().required(),
  MASTRA_TIMEOUT_MS: Joi.number().default(900000),
  RAG_ENABLED: Joi.boolean().default(false),
  MASTRA_INTERNAL_TOKEN: Joi.string().min(24).required(),
  WORKFLOW_TIME_ZONE: Joi.string().default('Africa/Cairo'),

  META_APP_ID: Joi.string().optional(),
  META_APP_SECRET: Joi.string().optional(),
  META_LOGIN_CONFIG_ID: Joi.string().optional(),
  META_REDIRECT_URI: Joi.string().uri().optional(),
  META_FRONTEND_REDIRECT_URL: Joi.string().uri().optional(),
  META_GRAPH_API_VERSION: Joi.string()
    .pattern(/^v\d+\.\d+$/)
    .default('v25.0'),
  META_TOKEN_ENCRYPTION_KEY: Joi.string().optional(),

  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),

  BETTER_AUTH_SECRET: Joi.string().min(32).required(),

  BETTER_AUTH_URL: Joi.string().uri().required(),
  BETTER_AUTH_TRUSTED_ORIGINS: Joi.string().optional(),

  SMTP_HOST: Joi.string().required(),
  SMTP_PORT: Joi.number().default(587),
  SMTP_USER: Joi.string().required(),
  SMTP_PASSWORD: Joi.string().required(),
  SMTP_FROM_EMAIL: Joi.string().email().required(),

  STRIPE_SECRET_KEY: Joi.string().required(),
  STRIPE_WEBHOOK_SECRET: Joi.string().required(),
  STRIPE_SUCCESS_URL: Joi.string().uri().required(),
  STRIPE_CANCEL_URL: Joi.string().uri().required(),
});
