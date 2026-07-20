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

  auth: {
    secret: process.env.BETTER_AUTH_SECRET,
    url: process.env.BETTER_AUTH_URL,
  },
});