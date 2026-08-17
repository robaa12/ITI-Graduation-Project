import { Type } from 'class-transformer';
import {
  IsBooleanString,
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
import { SocialPlatform } from '@prisma/client';

export const ADMIN_SOCIAL_ACCOUNT_SORT_FIELDS = [
  'platform',
  'name',
  'createdAt',
  'updatedAt',
] as const;

export type AdminSocialAccountSortField =
  (typeof ADMIN_SOCIAL_ACCOUNT_SORT_FIELDS)[number];

export const ADMIN_SOCIAL_ACCOUNT_SORT_DIRECTIONS = ['ASC', 'DESC'] as const;

export type AdminSocialAccountSortDirection =
  (typeof ADMIN_SOCIAL_ACCOUNT_SORT_DIRECTIONS)[number];

export class AdminSocialAccountsQueryDto {
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
  @IsIn(ADMIN_SOCIAL_ACCOUNT_SORT_FIELDS)
  sortBy?: AdminSocialAccountSortField;

  @IsOptional()
  @IsIn(ADMIN_SOCIAL_ACCOUNT_SORT_DIRECTIONS)
  sortOrder?: AdminSocialAccountSortDirection;

  @IsOptional()
  @IsEnum(SocialPlatform)
  platform?: SocialPlatform;

  @IsOptional()
  @IsBooleanString()
  available?: string;

  @IsOptional()
  @IsBooleanString()
  selected?: string;

  @IsOptional()
  @IsUUID()
  connectionId?: string;

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
