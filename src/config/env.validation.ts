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
  MASTRA_TIMEOUT_MS: Joi.number().default(600000),

  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),

  BETTER_AUTH_SECRET: Joi.string().min(32).required(),

  BETTER_AUTH_URL: Joi.string().uri().required(),

  SMTP_HOST: Joi.string().required(),
  SMTP_PORT: Joi.number().default(587),
  SMTP_USER: Joi.string().required(),
  SMTP_PASSWORD: Joi.string().required(),
  SMTP_FROM_EMAIL: Joi.string().email().required(),
});
