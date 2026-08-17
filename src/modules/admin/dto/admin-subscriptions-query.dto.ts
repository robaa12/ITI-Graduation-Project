import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { SubscriptionStatus } from '@prisma/client';

export const ADMIN_SUBSCRIPTION_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'currentPeriodEnd',
] as const;

export type AdminSubscriptionSortField =
  (typeof ADMIN_SUBSCRIPTION_SORT_FIELDS)[number];

export const ADMIN_SUBSCRIPTION_SORT_DIRECTIONS = ['ASC', 'DESC'] as const;

export type AdminSubscriptionSortDirection =
  (typeof ADMIN_SUBSCRIPTION_SORT_DIRECTIONS)[number];

export class AdminSubscriptionsQueryDto {
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
  @IsIn(Object.values(SubscriptionStatus))
  status?: SubscriptionStatus;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(ADMIN_SUBSCRIPTION_SORT_FIELDS)
  sortBy?: AdminSubscriptionSortField;

  @IsOptional()
  @IsIn(ADMIN_SUBSCRIPTION_SORT_DIRECTIONS)
  sortOrder?: AdminSubscriptionSortDirection;
}