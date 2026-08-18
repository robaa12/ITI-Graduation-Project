import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { SocialPlatform, SocialPublicationStatus } from '@prisma/client';

export class AdminCampaignPublicationsQueryDto {
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
  @IsEnum(SocialPublicationStatus)
  status?: SocialPublicationStatus;

  @IsOptional()
  @IsEnum(SocialPlatform)
  platform?: SocialPlatform;
}
