import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AdminGuard } from '../admin.guard';
import { AdminBillingService } from './admin-billing.service';
import { AdminBillingSubscriptionsQueryDto } from './dto/admin-billing-subscriptions-query.dto';
import { AdminBillingPlansQueryDto } from './dto/admin-billing-plans-query.dto';
import { AdminBillingQuotesQueryDto } from './dto/admin-billing-quotes-query.dto';
import { AdminBillingEventsQueryDto } from './dto/admin-billing-events-query.dto';
import { AdminBillingCreditEventsQueryDto } from './dto/admin-billing-credit-events-query.dto';

@Controller('admin/billing')
@UseGuards(AdminGuard)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class AdminBillingController {
  constructor(private readonly adminBilling: AdminBillingService) {}

  @Get('subscriptions')
  listSubscriptions(@Query() query: AdminBillingSubscriptionsQueryDto) {
    return this.adminBilling.listSubscriptions(query);
  }

  @Get('subscriptions/:id')
  getSubscription(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminBilling.getSubscription(id);
  }

  @Get('plans')
  listPlans(@Query() query: AdminBillingPlansQueryDto) {
    return this.adminBilling.listPlans(query);
  }

  @Get('plans/:id')
  getPlan(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminBilling.getPlan(id);
  }

  @Get('quotes')
  listQuotes(@Query() query: AdminBillingQuotesQueryDto) {
    return this.adminBilling.listQuotes(query);
  }

  @Get('quotes/:id')
  getQuote(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminBilling.getQuote(id);
  }

  @Get('events')
  listEvents(@Query() query: AdminBillingEventsQueryDto) {
    return this.adminBilling.listEvents(query);
  }

  @Get('events/:id')
  getEvent(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminBilling.getEvent(id);
  }

  @Get('credit-events')
  listCreditEvents(@Query() query: AdminBillingCreditEventsQueryDto) {
    return this.adminBilling.listCreditEvents(query);
  }

  @Get('credit-events/:id')
  getCreditEvent(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminBilling.getCreditEvent(id);
  }

  @Get('overview')
  overview() {
    return this.adminBilling.getOverview();
  }
}
