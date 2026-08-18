import { IsDateString, IsOptional } from 'class-validator';

/**
 * Optional date window for the dashboard statistics. Both are ISO-8601 date
 * strings (`YYYY-MM-DD` or a full timestamp). When omitted, a sensible default
 * window is used (see AdminDashboardService).
 */
export class DashboardQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
