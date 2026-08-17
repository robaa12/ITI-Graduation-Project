import {
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Admin-editable knowledge source fields. `name` is a display-only change.
 * `url` is only valid for website sources and triggers a re-crawl/re-index.
 */
export class AdminUpdateKnowledgeSourceDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  url?: string;
}
