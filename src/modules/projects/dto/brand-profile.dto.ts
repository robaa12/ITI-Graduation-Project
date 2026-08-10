import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class BrandProfileDto {
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  voice!: string;

  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(180, { each: true })
  preferredTerms!: string[];

  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(180, { each: true })
  prohibitedTerms!: string[];

  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(180, { each: true })
  writingRules!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  ctaGuidance?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  languageGuidance?: string;
}
