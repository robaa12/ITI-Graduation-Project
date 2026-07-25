import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class RegenerateContentDto {
  /** Overrides the instructions stored on the previous run when provided. */
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  instructions?: string;

  /**
   * Send the previous output to the agent so it can refine instead of starting
   * from scratch. Defaults to true.
   */
  @IsOptional()
  @IsBoolean()
  usePrevious?: boolean;
}
