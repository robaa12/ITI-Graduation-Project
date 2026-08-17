import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const ADMIN_KNOWLEDGE_PAGE_SORT_FIELDS = [
  'title',
  'url',
  'crawledAt',
  'createdAt',
  'updatedAt',
] as const;

export type AdminKnowledgePageSortField =
  (typeof ADMIN_KNOWLEDGE_PAGE_SORT_FIELDS)[number];

export const ADMIN_KNOWLEDGE_PAGE_SORT_DIRECTIONS = ['ASC', 'DESC'] as const;

export type AdminKnowledgePageSortDirection =
  (typeof ADMIN_KNOWLEDGE_PAGE_SORT_DIRECTIONS)[number];

export class AdminKnowledgePagesQueryDto {
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
  @IsIn(ADMIN_KNOWLEDGE_PAGE_SORT_FIELDS)
  sortBy?: AdminKnowledgePageSortField;

  @IsOptional()
  @IsIn(ADMIN_KNOWLEDGE_PAGE_SORT_DIRECTIONS)
  sortOrder?: AdminKnowledgePageSortDirection;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsUUID()
  sourceId?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;
}
