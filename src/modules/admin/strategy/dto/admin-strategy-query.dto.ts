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
import { StrategyApprovalStatus, WorkflowRunStatus } from '@prisma/client';

export const ADMIN_STRATEGY_SORT_FIELDS = [
  'status',
  'approvalStatus',
  'createdAt',
  'updatedAt',
  'reviewedAt',
] as const;

export type AdminStrategySortField =
  (typeof ADMIN_STRATEGY_SORT_FIELDS)[number];

export const ADMIN_STRATEGY_SORT_DIRECTIONS = ['ASC', 'DESC'] as const;

export type AdminStrategySortDirection =
  (typeof ADMIN_STRATEGY_SORT_DIRECTIONS)[number];

export class AdminStrategyQueryDto {
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
  @IsIn(ADMIN_STRATEGY_SORT_FIELDS)
  sortBy?: AdminStrategySortField;

  @IsOptional()
  @IsIn(ADMIN_STRATEGY_SORT_DIRECTIONS)
  sortOrder?: AdminStrategySortDirection;

  @IsOptional()
  @IsEnum(WorkflowRunStatus)
  status?: WorkflowRunStatus;

  @IsOptional()
  @IsEnum(StrategyApprovalStatus)
  approvalStatus?: StrategyApprovalStatus;

  @IsOptional()
  @IsUUID()
  campaignId?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

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
