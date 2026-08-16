export default () => ({
  app: {
    port: Number(process.env.PORT ?? 3000),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
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
    timeoutMs: Number(process.env.MASTRA_TIMEOUT_MS ?? 900_000),
    internalToken: process.env.MASTRA_INTERNAL_TOKEN,
  },

  knowledge: {
    enabled: process.env.RAG_ENABLED === 'true',
  },

  productAssets: {
    endpoint: process.env.PRODUCT_ASSETS_S3_ENDPOINT,
    region: process.env.PRODUCT_ASSETS_S3_REGION ?? 'us-east-1',
    bucket: process.env.PRODUCT_ASSETS_S3_BUCKET,
    accessKeyId: process.env.PRODUCT_ASSETS_S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.PRODUCT_ASSETS_S3_SECRET_ACCESS_KEY,
    forcePathStyle: process.env.PRODUCT_ASSETS_S3_FORCE_PATH_STYLE !== 'false',
  },

  /** Meta OAuth, account discovery, and Graph API publishing. Optional until configured. */
  meta: {
    appId: process.env.META_APP_ID,
    appSecret: process.env.META_APP_SECRET,
    loginConfigId: process.env.META_LOGIN_CONFIG_ID,
    redirectUri: process.env.META_REDIRECT_URI,
    frontendRedirectUrl:
      process.env.META_FRONTEND_REDIRECT_URL ??
      `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/connectors`,
    graphVersion: process.env.META_GRAPH_API_VERSION ?? 'v25.0',
    tokenEncryptionKey: process.env.META_TOKEN_ENCRYPTION_KEY,
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
    trustedOrigins: (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  },

  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    fromEmail: process.env.SMTP_FROM_EMAIL,
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    successUrl: process.env.STRIPE_SUCCESS_URL,
    cancelUrl: process.env.STRIPE_CANCEL_URL,
  },
});
