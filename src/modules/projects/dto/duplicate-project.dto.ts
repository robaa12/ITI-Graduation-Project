import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class DuplicateProjectDto {
  /** Defaults to `"<original name> (Copy)"` when omitted. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  /** Copy the generated content of every campaign as well. Defaults to false. */
  @IsOptional()
  @IsBoolean()
  includeGeneratedContent?: boolean;
}
