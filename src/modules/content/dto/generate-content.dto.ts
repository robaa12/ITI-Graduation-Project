import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class GenerateContentDto {
  /** Kind of output to produce, e.g. "social_post", "email", "ad_copy". */
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  type!: string;

  /** Extra direction passed straight through to the generation agent. */
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  instructions?: string;
}
