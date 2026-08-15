import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { BillingService } from './billing.service';
import { ChangePlanDto } from './dto/change-plan.dto';
import { ConfirmCheckoutDto } from './dto/confirm-checkout.dto';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { StripeWebhookService } from './stripe-webhook.service';

@Controller('subscriptions')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly webhookService: StripeWebhookService,
  ) {}

  /** Available SaaS plans. Prices are resolved server-side, never client-side. */
  @Get('plans')
  listPlans() {
    return this.billingService.listPlans();
  }

  /** The authenticated user's current subscription. */
  @Get('me')
  @UseGuards(AuthGuard)
  getSubscription(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.getSubscription(user.id);
  }

  /** Remaining workflow credits for the signed-in user's current entitlement. */
  @Get('usage')
  @UseGuards(AuthGuard)
  getCreditUsage(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.getCreditUsage(user.id);
  }

  /** Starts Stripe Checkout (subscription mode) for the given plan code. */
  @Post('checkout')
  @HttpCode(201)
  @UseGuards(AuthGuard)
  createCheckout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCheckoutDto,
  ) {
    return this.billingService.createCheckoutSession(user.id, dto);
  }

  /**
   * Authenticated fallback for a delayed webhook. Stripe is still queried and
   * ownership/payment are verified before any subscription state is changed.
   */
  @Post('checkout/confirm')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  confirmCheckout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConfirmCheckoutDto,
  ) {
    return this.webhookService.confirmCheckoutReturn(user.id, dto);
  }

  /**
   * Prices a plan switch without applying it, and holds that price so the
   * amount confirmed is the amount charged.
   */
  @Post('plan/preview')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  previewPlanChange(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePlanDto,
  ) {
    return this.billingService.previewPlanChange(user.id, dto);
  }

  /** Upgrades now against a confirmed quote, or schedules a downgrade. */
  @Patch('plan')
  @UseGuards(AuthGuard)
  async changePlan(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePlanDto,
  ) {
    return this.billingService.changePlan(user.id, dto);
  }

  /** Drops a scheduled downgrade, keeping the current plan. */
  @Delete('plan/pending')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  cancelPendingPlanChange(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.cancelPendingPlanChange(user.id);
  }

  /** Immediately cancels the current subscription. */
  @Post('cancel')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async cancel(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.cancelSubscription(user.id);
  }

  /** Opens Stripe's customer portal for payment methods and invoices. */
  @Post('portal')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  openPortal(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.createBillingPortal(user.id);
  }
}
