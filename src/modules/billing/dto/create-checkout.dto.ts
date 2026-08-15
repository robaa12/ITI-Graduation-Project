import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateCheckoutDto {
  /** Application plan code (e.g. "starter" | "pro"), resolved server-side. */
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  planCode!: string;

  /** Billing interval. The matching Stripe Price is looked up from the plan. */
  @IsIn(['month', 'year'])
  interval!: 'month' | 'year';

  /**
   * Custom sessions expose a client secret for Stripe Elements. Hosted remains
   * the default so older clients and plan-change flows keep working.
   */
  @IsOptional()
  @IsIn(['hosted', 'custom'])
  uiMode?: 'hosted' | 'custom';
}
