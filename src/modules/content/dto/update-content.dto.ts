import { ContentFormat } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateContentDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  body?: string;

  @IsOptional()
  @IsEnum(ContentFormat)
  format?: ContentFormat;

  /** Structured output. Accepts any JSON shape the agent produced. */
  @IsOptional()
  payload?: unknown;
}
