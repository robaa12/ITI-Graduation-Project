import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';

import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

export const createAuth = (
  prisma: PrismaClient,
  configService: ConfigService,
) => {
  const isProduction = configService.get<string>('NODE_ENV') === 'production';

  return betterAuth({
    secret: configService.getOrThrow<string>('BETTER_AUTH_SECRET'),
    baseURL: configService.getOrThrow<string>('BETTER_AUTH_URL'),
    basePath: '/api/auth',

    database: prismaAdapter(prisma, {
      provider: 'postgresql',
    }),

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },

    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: {
        enabled: false,
      },
    },

    advanced: {
      useSecureCookies: isProduction,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'lax',
        secure: isProduction,
        path: '/',
      },
    },
  });
};

export type Auth = ReturnType<typeof createAuth>;
