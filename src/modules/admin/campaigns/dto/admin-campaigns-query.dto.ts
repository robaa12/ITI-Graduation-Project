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
import { CampaignStatus } from '@prisma/client';

export const ADMIN_CAMPAIGN_SORT_FIELDS = [
  'name',
  'status',
  'createdAt',
  'updatedAt',
  'startDate',
  'endDate',
  'publishedAt',
] as const;

export type AdminCampaignSortField =
  (typeof ADMIN_CAMPAIGN_SORT_FIELDS)[number];

export const ADMIN_CAMPAIGN_SORT_DIRECTIONS = ['ASC', 'DESC'] as const;

export type AdminCampaignSortDirection =
  (typeof ADMIN_CAMPAIGN_SORT_DIRECTIONS)[number];

export class AdminCampaignsQueryDto {
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
  @IsIn(ADMIN_CAMPAIGN_SORT_FIELDS)
  sortBy?: AdminCampaignSortField;

  @IsOptional()
  @IsIn(ADMIN_CAMPAIGN_SORT_DIRECTIONS)
  sortOrder?: AdminCampaignSortDirection;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsEnum(CampaignStatus)
  status?: CampaignStatus;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
