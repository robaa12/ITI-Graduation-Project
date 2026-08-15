// Seeds the `plan` table from trusted environment variables, so Stripe test IDs
// live only in local .env and never in committed code.
//
// Expected vars per plan code (monthly/yearly prices optional):
//   STRIPE_PLAN_<CODE>_PRODUCT_ID        required
//   STRIPE_PLAN_<CODE>_MONTHLY_PRICE_ID  optional
//   STRIPE_PLAN_<CODE>_YEARLY_PRICE_ID   optional
//
// e.g. STRIPE_PLAN_PRO_PRODUCT_ID=prod_xxx STRIPE_PLAN_PRO_MONTHLY_PRICE_ID=price_xxx
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { expand } from 'dotenv-expand';

expand(dotenv.config());

type PlanSeed = {
  code: string;
  name: string;
  description: string;
  sortOrder: number;
  priceMonthlyCents?: number;
  priceYearlyCents?: number;
  generationCredits: number;
};

const PLANS: PlanSeed[] = [
  {
    code: 'free',
    name: 'Free',
    description: 'Explore the platform with basic limits.',
    sortOrder: 1,
    priceMonthlyCents: 0,
    priceYearlyCents: 0,
    generationCredits: 6,
  },
  {
    code: 'pro',
    name: 'Pro',
    description: 'For individual professionals who need more.',
    sortOrder: 2,
    priceMonthlyCents: 1500,
    priceYearlyCents: 15000,
    generationCredits: 60,
  },
  {
    code: 'business',
    name: 'Business',
    description: 'For growing teams.',
    sortOrder: 3,
    priceMonthlyCents: 4000,
    priceYearlyCents: 40000,
    generationCredits: 240,
  },
];

async function main() {
  const prisma = new PrismaClient();
  try {
    for (const plan of PLANS) {
      const productId = process.env[
        `STRIPE_PLAN_${plan.code.toUpperCase()}_PRODUCT_ID`
      ] as string | undefined;

      const monthlyPriceId = process.env[
        `STRIPE_PLAN_${plan.code.toUpperCase()}_MONTHLY_PRICE_ID`
      ] as string | undefined;

      const yearlyPriceId = process.env[
        `STRIPE_PLAN_${plan.code.toUpperCase()}_YEARLY_PRICE_ID`
      ] as string | undefined;

      if (!productId) {
        throw new Error(
          `Missing STRIPE_PLAN_${plan.code.toUpperCase()}_PRODUCT_ID for seeded plan "${plan.code}"`,
        );
      }

      await prisma.plan.upsert({
        where: { code: plan.code },
        update: {
          name: plan.name,
          description: plan.description,
          sortOrder: plan.sortOrder,
          active: true,
          stripeProductId: productId,
          stripeMonthlyPriceId: monthlyPriceId ?? null,
          stripeYearlyPriceId: yearlyPriceId ?? null,
          priceMonthlyCents: plan.priceMonthlyCents ?? null,
          priceYearlyCents: plan.priceYearlyCents ?? null,
          generationCredits: plan.generationCredits,
        },
        create: {
          code: plan.code,
          name: plan.name,
          description: plan.description,
          sortOrder: plan.sortOrder,
          active: true,
          stripeProductId: productId,
          stripeMonthlyPriceId: monthlyPriceId ?? null,
          stripeYearlyPriceId: yearlyPriceId ?? null,
          priceMonthlyCents: plan.priceMonthlyCents ?? null,
          priceYearlyCents: plan.priceYearlyCents ?? null,
          generationCredits: plan.generationCredits,
        },
      });
      console.log(`Seeded plan "${plan.code}"`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
