import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { toNodeHandler } from 'better-auth/node';
import type { Request, Response } from 'express';

import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { Auth, createAuth } from './lib/auth';

@Injectable()
export class AuthService {
  private readonly auth: Auth;
  private readonly handler: ReturnType<typeof toNodeHandler>;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {
    this.auth = createAuth(
      this.prismaService,
      this.configService,
      this.emailService,
    );
    this.handler = toNodeHandler(this.auth);
  }

  async handle(
    req: Request,
    res: Response,
    targetPath?: string,
  ): Promise<void> {
    if (!targetPath) {
      await this.handler(req, res);
      return;
    }

    await this.handleWithRewrittenPath(req, res, targetPath);
  }

  private async handleWithRewrittenPath(
    req: Request,
    res: Response,
    targetPath: string,
  ): Promise<void> {
    const originalUrl = req.url;
    const originalOriginalUrl = req.originalUrl;

    this.rewriteRequestPath(req, targetPath);

    try {
      await this.handler(req, res);
    } finally {
      req.url = originalUrl;
      req.originalUrl = originalOriginalUrl;
    }
  }

  private rewriteRequestPath(req: Request, targetPath: string): void {
    const queryString = this.getQueryString(req.originalUrl || req.url);
    const targetUrl = `${targetPath}${queryString}`;
    const baseUrl = req.baseUrl || '';

    req.originalUrl = targetUrl;
    req.url =
      baseUrl && targetPath.startsWith(baseUrl)
        ? `${targetPath.slice(baseUrl.length) || '/'}${queryString}`
        : targetUrl;
  }

  private getQueryString(url: string): string {
    const queryStart = url.indexOf('?');

    return queryStart === -1 ? '' : url.slice(queryStart);
  }
}
