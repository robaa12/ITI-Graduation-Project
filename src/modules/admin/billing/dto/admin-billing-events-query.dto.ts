import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const ADMIN_BILLING_EVENT_SORT_FIELDS = [
  'type',
  'processedAt',
  'createdAt',
] as const;

export type AdminBillingEventSortField =
  (typeof ADMIN_BILLING_EVENT_SORT_FIELDS)[number];

export const ADMIN_BILLING_SORT_DIRECTIONS = ['ASC', 'DESC'] as const;

export type AdminBillingSortDirection =
  (typeof ADMIN_BILLING_SORT_DIRECTIONS)[number];

export class AdminBillingEventsQueryDto {
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
  @IsIn(ADMIN_BILLING_EVENT_SORT_FIELDS)
  sortBy?: AdminBillingEventSortField;

  @IsOptional()
  @IsIn(ADMIN_BILLING_SORT_DIRECTIONS)
  sortOrder?: AdminBillingSortDirection;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  type?: string;

  @IsOptional()
  @IsUUID()
  subscriptionId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
