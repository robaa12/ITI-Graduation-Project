import { StrategyApprovalStatus } from '@prisma/client';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class ReviewStrategyDto {
  @IsEnum(StrategyApprovalStatus)
  action!: StrategyApprovalStatus;

  @IsOptional()
  @IsString()
  @MaxLength(4_000)
  note?: string;

  /** The reviewed draft. Required for approval so edits are not lost. */
  @IsOptional()
  @IsObject()
  output?: Record<string, unknown>;
}
