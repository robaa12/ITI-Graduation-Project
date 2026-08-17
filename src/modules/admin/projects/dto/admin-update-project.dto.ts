import { Type } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ProjectStatus } from '@prisma/client';
import { BrandProfileDto } from '../../../projects/dto/brand-profile.dto';

export class AdminUpdateProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => BrandProfileDto)
  brandProfile?: BrandProfileDto;

  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;
}
