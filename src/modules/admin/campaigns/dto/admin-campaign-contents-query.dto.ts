import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ContentFormat, GeneratedContentStatus } from '@prisma/client';

export class AdminCampaignContentsQueryDto {
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
  @IsEnum(GeneratedContentStatus)
  status?: GeneratedContentStatus;

  @IsOptional()
  @IsEnum(ContentFormat)
  format?: ContentFormat;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  type?: string;
}
