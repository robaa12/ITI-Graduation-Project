import { ContentFormat } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

import { MaxJsonSize } from '../../../common/validators/max-json-size.validator';

/** Serialised bytes allowed in a stored payload. Kept under the request body
 * limit in main.ts so an otherwise-valid payload is never rejected as a 413. */
export const MAX_PAYLOAD_BYTES = 64 * 1024;

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

  /**
   * Structured output. Accepts any JSON shape the agent produced, but it is
   * `unknown`, so nothing else here bounds it — the size cap is the only limit.
   */
  @IsOptional()
  @MaxJsonSize(MAX_PAYLOAD_BYTES)
  payload?: unknown;
}
