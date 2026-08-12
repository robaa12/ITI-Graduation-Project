import {
  Body,
  Controller,
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
import { CreateCheckoutDto } from './dto/create-checkout.dto';

@Controller('subscriptions')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

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

  /** Upgrades or downgrades with immediate invoicing and pending payment. */
  @Post('plan/preview')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  previewPlanChange(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePlanDto,
  ) {
    return this.billingService.previewPlanChange(user.id, dto);
  }

  /** Upgrades or downgrades with immediate invoicing and pending payment. */
  @Patch('plan')
  @UseGuards(AuthGuard)
  async changePlan(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePlanDto,
  ) {
    return this.billingService.changePlan(user.id, dto);
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
