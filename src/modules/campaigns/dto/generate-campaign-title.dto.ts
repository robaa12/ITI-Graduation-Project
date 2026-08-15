import { IsString, MaxLength, MinLength } from 'class-validator';

export class GenerateCampaignTitleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  brandName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  product!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  industry!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  businessType!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  campaignGoal!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  targetAudience!: string;
}
