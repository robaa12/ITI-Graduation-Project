import { Type } from 'class-transformer';
import {
  IsBooleanString,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export const ADMIN_BILLING_PLAN_SORT_FIELDS = [
  'sortOrder',
  'name',
  'priceMonthlyCents',
  'generationCredits',
  'createdAt',
] as const;

export type AdminBillingPlanSortField =
  (typeof ADMIN_BILLING_PLAN_SORT_FIELDS)[number];

export const ADMIN_BILLING_SORT_DIRECTIONS = ['ASC', 'DESC'] as const;

export type AdminBillingSortDirection =
  (typeof ADMIN_BILLING_SORT_DIRECTIONS)[number];

export class AdminBillingPlansQueryDto {
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
  @IsIn(ADMIN_BILLING_PLAN_SORT_FIELDS)
  sortBy?: AdminBillingPlanSortField;

  @IsOptional()
  @IsIn(ADMIN_BILLING_SORT_DIRECTIONS)
  sortOrder?: AdminBillingSortDirection;

  @IsOptional()
  @IsBooleanString()
  active?: string;
}
