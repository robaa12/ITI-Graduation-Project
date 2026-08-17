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
import {
  WorkflowAccountingStatus,
  WorkflowExecutionKind,
  WorkflowRunStatus,
} from '@prisma/client';

export const ADMIN_WORKFLOW_EXECUTION_SORT_FIELDS = [
  'kind',
  'status',
  'totalTokens',
  'estimatedCost',
  'startedAt',
  'finishedAt',
  'createdAt',
  'updatedAt',
] as const;

export type AdminWorkflowExecutionSortField =
  (typeof ADMIN_WORKFLOW_EXECUTION_SORT_FIELDS)[number];

export const ADMIN_WORKFLOW_EXECUTION_SORT_DIRECTIONS = [
  'ASC',
  'DESC',
] as const;

export type AdminWorkflowExecutionSortDirection =
  (typeof ADMIN_WORKFLOW_EXECUTION_SORT_DIRECTIONS)[number];

export class AdminWorkflowExecutionsQueryDto {
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
  @IsIn(ADMIN_WORKFLOW_EXECUTION_SORT_FIELDS)
  sortBy?: AdminWorkflowExecutionSortField;

  @IsOptional()
  @IsIn(ADMIN_WORKFLOW_EXECUTION_SORT_DIRECTIONS)
  sortOrder?: AdminWorkflowExecutionSortDirection;

  @IsOptional()
  @IsEnum(WorkflowExecutionKind)
  kind?: WorkflowExecutionKind;

  @IsOptional()
  @IsEnum(WorkflowRunStatus)
  status?: WorkflowRunStatus;

  @IsOptional()
  @IsEnum(WorkflowAccountingStatus)
  accountingStatus?: WorkflowAccountingStatus;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsUUID()
  campaignId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}
