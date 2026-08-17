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
import { KnowledgeSourceStatus, KnowledgeSourceType } from '@prisma/client';

export const ADMIN_KNOWLEDGE_SOURCE_SORT_FIELDS = [
  'name',
  'type',
  'status',
  'url',
  'createdAt',
  'updatedAt',
  'indexedAt',
] as const;

export type AdminKnowledgeSourceSortField =
  (typeof ADMIN_KNOWLEDGE_SOURCE_SORT_FIELDS)[number];

export const ADMIN_KNOWLEDGE_SORT_DIRECTIONS = ['ASC', 'DESC'] as const;

export type AdminKnowledgeSortDirection =
  (typeof ADMIN_KNOWLEDGE_SORT_DIRECTIONS)[number];

export class AdminKnowledgeSourcesQueryDto {
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
  @IsIn(ADMIN_KNOWLEDGE_SOURCE_SORT_FIELDS)
  sortBy?: AdminKnowledgeSourceSortField;

  @IsOptional()
  @IsIn(ADMIN_KNOWLEDGE_SORT_DIRECTIONS)
  sortOrder?: AdminKnowledgeSortDirection;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsEnum(KnowledgeSourceType)
  type?: KnowledgeSourceType;

  @IsOptional()
  @IsEnum(KnowledgeSourceStatus)
  status?: KnowledgeSourceStatus;

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
