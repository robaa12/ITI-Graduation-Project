import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateCampaignDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** What the campaign is meant to achieve — fed to the generation agent. */
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

  /** Distribution channels, e.g. ["instagram", "email"]. */
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
