import {
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
} from 'class-validator';

/** Admin-created website knowledge source (same rules as the user flow). */
export class AdminCreateKnowledgeSourceDto {
  @IsUUID()
  projectId!: string;

  @IsUrl({ require_tld: false })
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;
}
