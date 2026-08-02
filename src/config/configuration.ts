export default () => ({
  app: {
    port: Number(process.env.PORT ?? 3000),
    nodeEnv: process.env.NODE_ENV ?? 'development',
  },

  database: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    url: process.env.DATABASE_URL,
  },

  /** Mastra service hosting the marketing strategy and content workflows. */
  mastra: {
    baseUrl: process.env.MASTRA_BASE_URL,
    /** Per-request ceiling. Workflow runs chain 6-7 agents and are slow. */
    timeoutMs: Number(process.env.MASTRA_TIMEOUT_MS ?? 600_000),
  },

  /** Backing store for the BullMQ generation queue. */
  redis: {
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD,
  },

  auth: {
    secret: process.env.BETTER_AUTH_SECRET,
    url: process.env.BETTER_AUTH_URL,
  },

  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    fromEmail: process.env.SMTP_FROM_EMAIL,
  },
});
