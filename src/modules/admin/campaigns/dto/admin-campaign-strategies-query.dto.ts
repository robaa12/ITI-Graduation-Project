import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { StrategyApprovalStatus, WorkflowRunStatus } from '@prisma/client';

export class AdminCampaignStrategiesQueryDto {
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
  @IsEnum(WorkflowRunStatus)
  status?: WorkflowRunStatus;

  @IsOptional()
  @IsEnum(StrategyApprovalStatus)
  approvalStatus?: StrategyApprovalStatus;
}
