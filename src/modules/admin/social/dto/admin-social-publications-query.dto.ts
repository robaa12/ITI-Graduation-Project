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
import { SocialPlatform, SocialPublicationStatus } from '@prisma/client';

export const ADMIN_SOCIAL_PUBLICATION_SORT_FIELDS = [
  'status',
  'platform',
  'scheduledFor',
  'publishedAt',
  'createdAt',
  'updatedAt',
] as const;

export type AdminSocialPublicationSortField =
  (typeof ADMIN_SOCIAL_PUBLICATION_SORT_FIELDS)[number];

export const ADMIN_SOCIAL_PUBLICATION_SORT_DIRECTIONS = [
  'ASC',
  'DESC',
] as const;

export type AdminSocialPublicationSortDirection =
  (typeof ADMIN_SOCIAL_PUBLICATION_SORT_DIRECTIONS)[number];

export class AdminSocialPublicationsQueryDto {
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
  @IsIn(ADMIN_SOCIAL_PUBLICATION_SORT_FIELDS)
  sortBy?: AdminSocialPublicationSortField;

  @IsOptional()
  @IsIn(ADMIN_SOCIAL_PUBLICATION_SORT_DIRECTIONS)
  sortOrder?: AdminSocialPublicationSortDirection;

  @IsOptional()
  @IsEnum(SocialPublicationStatus)
  status?: SocialPublicationStatus;

  @IsOptional()
  @IsEnum(SocialPlatform)
  platform?: SocialPlatform;

  @IsOptional()
  @IsUUID()
  socialAccountId?: string;

  @IsOptional()
  @IsUUID()
  campaignId?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

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
