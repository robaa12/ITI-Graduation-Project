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
import { PlanChangeKind } from '@prisma/client';

export const ADMIN_BILLING_QUOTE_SORT_FIELDS = [
  'kind',
  'amountDueCents',
  'effectiveAt',
  'expiresAt',
  'consumedAt',
  'createdAt',
] as const;

export type AdminBillingQuoteSortField =
  (typeof ADMIN_BILLING_QUOTE_SORT_FIELDS)[number];

export const ADMIN_BILLING_SORT_DIRECTIONS = ['ASC', 'DESC'] as const;

export type AdminBillingSortDirection =
  (typeof ADMIN_BILLING_SORT_DIRECTIONS)[number];

export class AdminBillingQuotesQueryDto {
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
  @IsIn(ADMIN_BILLING_QUOTE_SORT_FIELDS)
  sortBy?: AdminBillingQuoteSortField;

  @IsOptional()
  @IsIn(ADMIN_BILLING_SORT_DIRECTIONS)
  sortOrder?: AdminBillingSortDirection;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  planId?: string;

  @IsOptional()
  @IsEnum(PlanChangeKind)
  kind?: PlanChangeKind;

  @IsOptional()
  @IsBooleanString()
  consumed?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
