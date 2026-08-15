import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ConfirmCheckoutDto {
  /** Stripe's server-generated Checkout Session id from the success URL. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  sessionId?: string;

  /** Expected application plan; checked against trusted Stripe metadata. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  planCode?: string;

  @IsOptional()
  @IsIn(['month', 'year'])
  interval?: 'month' | 'year';
}
