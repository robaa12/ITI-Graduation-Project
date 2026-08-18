import {
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateWebsiteSourceDto {
  @IsUrl({ require_tld: false })
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;
}

export class CreateDocumentSourceDto {
  @IsString()
  @MaxLength(160)
  name!: string;

  @IsString()
  @MaxLength(250_000)
  content!: string;
}

export class CreateSocialSourceDto {
  @IsIn(['facebook', 'instagram'])
  platform!: 'facebook' | 'instagram';

  @IsString()
  @MaxLength(160)
  accountName!: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  profileUrl?: string;

  /** Official API posts supplied by the connector worker, newest first. */
  posts!: string[];
}

export class AskKnowledgeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(1_000)
  query!: string;
}
