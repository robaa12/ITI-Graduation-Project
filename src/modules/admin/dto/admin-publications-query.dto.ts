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
import { SocialPlatform, SocialPublicationStatus } from '@prisma/client';

export const ADMIN_PUBLICATION_SORT_FIELDS = [
  'createdAt',
  'scheduledFor',
  'publishedAt',
] as const;

export type AdminPublicationSortField =
  (typeof ADMIN_PUBLICATION_SORT_FIELDS)[number];

export const ADMIN_PUBLICATION_SORT_DIRECTIONS = ['ASC', 'DESC'] as const;

export type AdminPublicationSortDirection =
  (typeof ADMIN_PUBLICATION_SORT_DIRECTIONS)[number];

export class AdminPublicationsQueryDto {
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
  @IsIn(Object.values(SocialPublicationStatus))
  status?: SocialPublicationStatus;

  @IsOptional()
  @IsIn(Object.values(SocialPlatform))
  platform?: SocialPlatform;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(ADMIN_PUBLICATION_SORT_FIELDS)
  sortBy?: AdminPublicationSortField;

  @IsOptional()
  @IsIn(ADMIN_PUBLICATION_SORT_DIRECTIONS)
  sortOrder?: AdminPublicationSortDirection;
}