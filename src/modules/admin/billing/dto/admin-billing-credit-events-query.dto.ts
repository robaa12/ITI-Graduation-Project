import { Type } from 'class-transformer';
import {
  IsBooleanString,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { GenerationCreditKind } from '@prisma/client';

export const ADMIN_BILLING_CREDIT_EVENT_SORT_FIELDS = [
  'kind',
  'amount',
  'periodStart',
  'createdAt',
] as const;

export type AdminBillingCreditEventSortField =
  (typeof ADMIN_BILLING_CREDIT_EVENT_SORT_FIELDS)[number];

export const ADMIN_BILLING_SORT_DIRECTIONS = ['ASC', 'DESC'] as const;

export type AdminBillingSortDirection =
  (typeof ADMIN_BILLING_SORT_DIRECTIONS)[number];

export class AdminBillingCreditEventsQueryDto {
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
  @IsIn(ADMIN_BILLING_CREDIT_EVENT_SORT_FIELDS)
  sortBy?: AdminBillingCreditEventSortField;

  @IsOptional()
  @IsIn(ADMIN_BILLING_SORT_DIRECTIONS)
  sortOrder?: AdminBillingSortDirection;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsEnum(GenerationCreditKind)
  kind?: GenerationCreditKind;

  @IsOptional()
  @IsBooleanString()
  refunded?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
