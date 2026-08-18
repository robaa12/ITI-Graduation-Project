import { APIError, betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { emailOTP } from 'better-auth/plugins';

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

import { EmailService } from '../../email/email.service';

const authEmailLogger = new Logger('AuthEmail');

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
    trustedOrigins: configService.get<string[]>('auth.trustedOrigins')?.length
      ? configService.get<string[]>('auth.trustedOrigins')
      : [configService.getOrThrow<string>('app.frontendUrl')],

    database: prismaAdapter(prisma, {
      provider: 'postgresql',
    }),

    // Keep authorization data in the public session user payload. The value is
    // read from Prisma and cannot be supplied by sign-up requests.
    user: {
      additionalFields: {
        role: {
          type: 'string',
          required: false,
          defaultValue: 'USER',
          input: false,
        },
        active: {
          type: 'boolean',
          required: false,
          defaultValue: true,
          input: false,
        },
      },
    },

    databaseHooks: {
      session: {
        create: {
          async before(session) {
            const user = await prisma.user.findUnique({
              where: { id: session.userId },
              select: { active: true },
            });

            if (!user?.active) {
              throw new APIError('FORBIDDEN', {
                message: 'This account is inactive. Contact an administrator.',
                code: 'ACCOUNT_INACTIVE',
              });
            }
          },
        },
      },
    },

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
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
        sendVerificationOTP({ email, otp, type }) {
          const isPasswordReset = type === 'forget-password';
          const isSignIn = type === 'sign-in';
          const subject = isPasswordReset
            ? 'Reset your Sada password'
            : isSignIn
              ? 'Your Sada sign-in code'
              : 'Verify your Sada email';
          const heading = isPasswordReset
            ? 'Reset your password'
            : isSignIn
              ? 'Confirm your sign-in'
              : 'Verify your email';
          const description = isPasswordReset
            ? 'Use this code to continue creating a new password for your Sada account.'
            : isSignIn
              ? 'Use this code to securely sign in to your Sada workspace.'
              : 'Use this code to confirm your email and finish setting up your Sada account.';

          void emailService
            .sendMail({
              to: email,
              subject,
              html: `
                <div style="margin:0;background:#fef7ff;padding:32px 16px;font-family:Arial,sans-serif;color:#1d1b20;">
                  <div style="max-width:520px;margin:0 auto;border:1px solid #ddd4e2;border-radius:20px;background:#ffffff;padding:32px;box-shadow:0 12px 36px rgba(79,55,138,.10);">
                    <div style="display:inline-block;border-radius:999px;background:#4f378a;color:#ffffff;padding:10px 14px;font-weight:700;letter-spacing:.08em;">SADA</div>
                    <h1 style="margin:24px 0 8px;font-size:28px;line-height:1.2;">${heading}</h1>
                    <p style="margin:0;color:#5f5865;line-height:1.6;">${description}</p>
                    <div style="margin:28px 0;border-radius:16px;background:#f3eef9;padding:22px;text-align:center;font-size:34px;font-weight:700;letter-spacing:10px;color:#4f378a;">${otp}</div>
                    <p style="margin:0;color:#5f5865;line-height:1.6;">This code expires in 5 minutes and can be tried up to 3 times.</p>
                    <p style="margin:18px 0 0;color:#837a88;font-size:13px;line-height:1.5;">If you did not request this, you can safely ignore this email. Never share this code with anyone.</p>
                  </div>
                </div>
              `,
            })
            .catch((error: unknown) => {
              authEmailLogger.error(
                'Failed to deliver an authentication OTP email',
                error instanceof Error ? error.stack : undefined,
              );
            });

          return Promise.resolve();
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
