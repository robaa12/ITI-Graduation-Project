import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ChangePlanDto {
  /** Application plan code (e.g. "pro" | "business"), resolved server-side. */
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  planCode!: string;

  /** Billing interval. The matching Stripe Price is looked up from the plan. */
  @IsIn(['month', 'year'])
  interval!: 'month' | 'year';

  /**
   * The quote the customer actually confirmed, from `POST /plan/preview`.
   * Optional so a client can still switch in one call, but when it is present
   * the stored amount is charged instead of a freshly recomputed one — that is
   * what guarantees the figure on the confirmation screen is the figure billed.
   */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  quoteId?: string;

  /** Use Stripe Elements in our checkout page instead of Stripe's hosted UI. */
  @IsOptional()
  @IsIn(['hosted', 'custom'])
  uiMode?: 'hosted' | 'custom';
}
