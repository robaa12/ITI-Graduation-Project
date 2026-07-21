import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { emailOTP } from 'better-auth/plugins';

import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

import { EmailService } from '../../email/email.service';

export const createAuth = (
  prisma: PrismaClient,
  configService: ConfigService,
  emailService: EmailService,
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
      requireEmailVerification: true,
    },

    emailVerification: {
      autoSignInAfterVerification: true,
    },

    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: {
        enabled: false,
      },
    },

    plugins: [
      emailOTP({
        async sendVerificationOTP({ email, otp }) {
          await emailService.sendMail({
            to: email,
            subject: 'Your verification code',
            html: `
              <h1>Email Verification</h1>
              <p>Your verification code is:</p>
              <h2 style="font-size: 32px; letter-spacing: 8px; text-align: center; background: #f4f4f4; padding: 20px; border-radius: 8px;">${otp}</h2>
              <p>This code expires in 5 minutes.</p>
              <p>If you did not request this code, please ignore this email.</p>
            `,
          });
        },
        sendVerificationOnSignUp: true,
        overrideDefaultEmailVerification: true,
        storeOTP: 'hashed',
        allowedAttempts: 3,
      }),
    ],

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
