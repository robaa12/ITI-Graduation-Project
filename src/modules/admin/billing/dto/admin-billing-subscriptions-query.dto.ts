import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { SubscriptionStatus } from '@prisma/client';

export const ADMIN_BILLING_SUBSCRIPTION_SORT_FIELDS = [
  'status',
  'planId',
  'currentPeriodEnd',
  'createdAt',
  'updatedAt',
] as const;

export type AdminBillingSubscriptionSortField =
  (typeof ADMIN_BILLING_SUBSCRIPTION_SORT_FIELDS)[number];

export const ADMIN_BILLING_SORT_DIRECTIONS = ['ASC', 'DESC'] as const;

export type AdminBillingSortDirection =
  (typeof ADMIN_BILLING_SORT_DIRECTIONS)[number];

export class AdminBillingSubscriptionsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @IsOptional()
  @IsIn(ADMIN_BILLING_SUBSCRIPTION_SORT_FIELDS)
  sortBy?: AdminBillingSubscriptionSortField;

  @IsOptional()
  @IsIn(ADMIN_BILLING_SORT_DIRECTIONS)
  sortOrder?: AdminBillingSortDirection;

  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @IsOptional()
  @IsUUID()
  planId?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
