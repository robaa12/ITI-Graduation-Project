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
  SocialConnectionProvider,
  SocialConnectionStatus,
} from '@prisma/client';

export const ADMIN_SOCIAL_CONNECTION_SORT_FIELDS = [
  'provider',
  'status',
  'lastSyncedAt',
  'createdAt',
  'updatedAt',
] as const;

export type AdminSocialConnectionSortField =
  (typeof ADMIN_SOCIAL_CONNECTION_SORT_FIELDS)[number];

export const ADMIN_SOCIAL_CONNECTION_SORT_DIRECTIONS = ['ASC', 'DESC'] as const;

export type AdminSocialConnectionSortDirection =
  (typeof ADMIN_SOCIAL_CONNECTION_SORT_DIRECTIONS)[number];

export class AdminSocialConnectionsQueryDto {
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
  @IsIn(ADMIN_SOCIAL_CONNECTION_SORT_FIELDS)
  sortBy?: AdminSocialConnectionSortField;

  @IsOptional()
  @IsIn(ADMIN_SOCIAL_CONNECTION_SORT_DIRECTIONS)
  sortOrder?: AdminSocialConnectionSortDirection;

  @IsOptional()
  @IsEnum(SocialConnectionProvider)
  provider?: SocialConnectionProvider;

  @IsOptional()
  @IsEnum(SocialConnectionStatus)
  status?: SocialConnectionStatus;

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
