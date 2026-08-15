import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

/** DI token for the configured Stripe SDK client. */
export const STRIPE_CLIENT = Symbol('STRIPE_CLIENT');

export const stripeClientProvider: Provider = {
  provide: STRIPE_CLIENT,
  useFactory: (configService: ConfigService): Stripe => {
    return new Stripe(configService.getOrThrow<string>('STRIPE_SECRET_KEY'));
  },
  inject: [ConfigService],
};
