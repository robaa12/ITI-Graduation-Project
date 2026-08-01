import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Paginates the campaigns nested in the project detail response. */
export class FindProjectDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  campaignsPage: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  campaignsLimit: number = 20;
}
