import { IsEnum, IsOptional } from 'class-validator';

export enum ExportFormat {
  JSON = 'json',
  MARKDOWN = 'markdown',
  CSV = 'csv',
}

export class ExportContentDto {
  /** Defaults to JSON, which always carries the agent's output in full. */
  @IsOptional()
  @IsEnum(ExportFormat)
  format: ExportFormat = ExportFormat.JSON;
}
