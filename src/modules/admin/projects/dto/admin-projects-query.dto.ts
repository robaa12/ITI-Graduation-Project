import { Type } from 'class-transformer';
import {
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
import { ProjectStatus } from '@prisma/client';

export const ADMIN_PROJECT_SORT_FIELDS = [
  'name',
  'createdAt',
  'updatedAt',
] as const;

export type AdminProjectSortField = (typeof ADMIN_PROJECT_SORT_FIELDS)[number];

export const ADMIN_PROJECT_SORT_DIRECTIONS = ['ASC', 'DESC'] as const;

export type AdminProjectSortDirection =
  (typeof ADMIN_PROJECT_SORT_DIRECTIONS)[number];

export class AdminProjectsQueryDto {
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
  @IsIn(ADMIN_PROJECT_SORT_FIELDS)
  sortBy?: AdminProjectSortField;

  @IsOptional()
  @IsIn(ADMIN_PROJECT_SORT_DIRECTIONS)
  sortOrder?: AdminProjectSortDirection;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  @IsOptional()
  @IsUUID()
  ownerId?: string;
}
