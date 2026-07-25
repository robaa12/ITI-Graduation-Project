import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateCampaignDto {
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
  @IsString()
  @MaxLength(1000)
  objective?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  audience?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  tone?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  @ArrayMaxSize(20)
  channels?: string[];

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
