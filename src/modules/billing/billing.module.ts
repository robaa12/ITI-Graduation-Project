import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { GenerationCreditsModule } from '../generation-credits/generation-credits.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { StripeWebhookController } from './stripe-webhook.controller';
import { StripeWebhookService } from './stripe-webhook.service';
import { stripeClientProvider } from './stripe.provider';

@Module({
  imports: [AuthModule, GenerationCreditsModule],
  controllers: [BillingController, StripeWebhookController],
  providers: [BillingService, StripeWebhookService, stripeClientProvider],
  exports: [BillingService, StripeWebhookService],
})
export class BillingModule {}
