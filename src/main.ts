import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

/**
 * Stated explicitly rather than inherited from body-parser's 100kb default:
 * per-field caps in the DTOs only run *after* the body is parsed into memory,
 * so this is the limit that decides how much a single request can cost us.
 * Large enough for the biggest valid content update, and no larger.
 */
const MAX_REQUEST_BODY = '256kb';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Every browser-facing application endpoint lives below `/api`. The Mastra
  // service remains a private dependency of this process rather than a second
  // public API the browser can call directly.
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: config.get<string[]>('auth.trustedOrigins') ?? [],
    credentials: true,
  });

  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
  });

  app.use(json({ limit: MAX_REQUEST_BODY }));
  app.use(urlencoded({ extended: true, limit: MAX_REQUEST_BODY }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
