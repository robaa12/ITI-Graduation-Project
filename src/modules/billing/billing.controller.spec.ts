import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AuthGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { StripeWebhookController } from './stripe-webhook.controller';
import { StripeWebhookService } from './stripe-webhook.service';

// AuthService wires Better Auth (ESM). Mock the module so loading the guard in
// a CommonJS Jest run does not pull Better Auth's ESM entry in; the control
// flow in these tests exercises the guard/session boundary, not Better Auth.
jest.mock('../auth/auth.service', () => ({
  AuthService: class AuthService {},
}));

describe('BillingController (auth routing)', () => {
  let app: INestApplication;
  let authService: { getSession: jest.Mock };
  let billingService: {
    cancelSubscription: jest.Mock;
    changePlan: jest.Mock;
    createCheckoutSession: jest.Mock;
    getSubscription: jest.Mock;
    listPlans: jest.Mock;
  };
  let webhookService: { handle: jest.Mock };

  const USER = { id: 'user-1', email: 'user@example.com', name: 'User' };

  const sessionForCookie = (request: { headers?: { cookie?: string } }) =>
    request?.headers?.cookie === 'session=valid' ? { user: USER } : null;

  beforeEach(async () => {
    authService = {
      getSession: jest.fn().mockImplementation(sessionForCookie),
    };
    billingService = {
      cancelSubscription: jest.fn(),
      changePlan: jest.fn(),
      createCheckoutSession: jest.fn(),
      getSubscription: jest.fn(),
      listPlans: jest.fn(),
    };
    webhookService = { handle: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [BillingController, StripeWebhookController],
      providers: [
        AuthGuard,
        { provide: AuthService, useValue: authService },
        { provide: BillingService, useValue: billingService },
        { provide: StripeWebhookService, useValue: webhookService },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const unauthServer = () => request(app.getHttpServer());

  describe('authentication gate', () => {
    it('leaves plan listing public (visited by the landing page before login)', async () => {
      billingService.listPlans.mockResolvedValue([
        { code: 'pro', name: 'Pro', description: '', sortOrder: 2 },
      ]);

      await request(app.getHttpServer())
        .get('/api/subscriptions/plans')
        .expect(200)
        .expect([{ code: 'pro', name: 'Pro', description: '', sortOrder: 2 }]);
    });

    it('blocks every authenticated subscription route without a session', async () => {
      const http = unauthServer();
      await http.get('/api/subscriptions/me').expect(401);
      await http
        .post('/api/subscriptions/checkout')
        .send({ planCode: 'pro', interval: 'month' })
        .expect(401);
      await http
        .patch('/api/subscriptions/plan')
        .send({ planCode: 'pro', interval: 'month' })
        .expect(401);
      await http.post('/api/subscriptions/cancel').expect(401);
      expect(billingService.createCheckoutSession).not.toHaveBeenCalled();
      expect(billingService.changePlan).not.toHaveBeenCalled();
    });

    it('routes the checkout to the service with the authenticated user id', async () => {
      billingService.createCheckoutSession.mockResolvedValue({
        url: 'https://checkout.stripe.com/123',
      });

      await request(app.getHttpServer())
        .post('/api/subscriptions/checkout')
        .set('Cookie', 'session=valid')
        .send({ planCode: 'pro', interval: 'month' })
        .expect(201)
        .expect(({ body }) => body.url);

      expect(billingService.createCheckoutSession).toHaveBeenCalledWith(
        'user-1',
        { planCode: 'pro', interval: 'month' },
      );
    });

    it('never lets the client choose which subscription to change', async () => {
      billingService.changePlan.mockResolvedValue({});

      await request(app.getHttpServer())
        .patch('/api/subscriptions/plan')
        .set('Cookie', 'session=valid')
        .send({ planCode: 'pro', interval: 'month' })
        .expect(200);

      expect(billingService.changePlan).toHaveBeenCalledWith('user-1', {
        planCode: 'pro',
        interval: 'month',
      });
    });

    it('cancels only the authenticated user subscription', async () => {
      billingService.cancelSubscription.mockResolvedValue({});

      await request(app.getHttpServer())
        .post('/api/subscriptions/cancel')
        .set('Cookie', 'session=valid')
        .expect(200);

      expect(billingService.cancelSubscription).toHaveBeenCalledWith('user-1');
    });
  });

  describe('webhook endpoint', () => {
    it('is public and forwards the event to the webhook service', async () => {
      webhookService.handle.mockResolvedValue({ received: true });

      await request(app.getHttpServer())
        .post('/api/stripe/webhook')
        .set('stripe-signature', 'sig_123')
        .send({ id: 'evt_1' })
        .expect(200)
        .expect({ received: true });

      expect(webhookService.handle).toHaveBeenCalled();
    });
  });
});
