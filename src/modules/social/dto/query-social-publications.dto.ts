import { SocialPublicationStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export class QuerySocialPublicationsDto {
  @IsOptional()
  @IsEnum(SocialPublicationStatus)
  status?: SocialPublicationStatus;

  @IsOptional()
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50;
}
