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
import { UserRole } from '@prisma/client';

export const ADMIN_USER_SORT_FIELDS = [
  'name',
  'email',
  'createdAt',
  'updatedAt',
] as const;

export type AdminUserSortField = (typeof ADMIN_USER_SORT_FIELDS)[number];

export const ADMIN_USER_SORT_DIRECTIONS = ['ASC', 'DESC'] as const;

export type AdminUserSortDirection =
  (typeof ADMIN_USER_SORT_DIRECTIONS)[number];

export class AdminUsersQueryDto {
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
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(Object.values(UserRole))
  role?: UserRole;

  @IsOptional()
  @IsIn(ADMIN_USER_SORT_FIELDS)
  sortBy?: AdminUserSortField;

  @IsOptional()
  @IsIn(ADMIN_USER_SORT_DIRECTIONS)
  sortOrder?: AdminUserSortDirection;
}
