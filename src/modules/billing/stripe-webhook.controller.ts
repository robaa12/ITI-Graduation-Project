import {
  BadRequestException,
  Controller,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { StripeWebhookService } from './stripe-webhook.service';

/**
 * Public endpoint Stripe calls with subscription events. The global JSON body
 * parser is bypassed for this route (see main.ts raw parser) so the exact
 * bytes Stripe signed are available for signature verification. Not guarded —
 * verification is the auth, not a user session.
 */
@Controller('stripe')
export class StripeWebhookController {
  constructor(private readonly webhookService: StripeWebhookService) {}

  @Post('webhook')
  @HttpCode(200)
  async handle(@Req() req: Request): Promise<{ received: true }> {
    const signature = req.headers['stripe-signature'];

    if (typeof signature !== 'string') {
      throw new BadRequestException('Missing Stripe signature');
    }

    // Stripe's raw parser sets the body to a Buffer; a double-parsed JSON body
    // (string object) is rejected defensively since verification needs bytes.
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(JSON.stringify(req.body ?? ''));

    return this.webhookService.handle(rawBody, signature);
  }
}
