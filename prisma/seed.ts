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
import { hashPassword } from 'better-auth/crypto';
import { randomUUID } from 'node:crypto';
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
  maxCampaignWeeks?: number;
  maxPostsPerWeek?: number;
};

const PLANS: PlanSeed[] = [
  {
    code: 'free',
    name: 'Free',
    description: 'Explore the platform with basic limits.',
    sortOrder: 1,
    priceMonthlyCents: 0,
    priceYearlyCents: 0,
    generationCredits: 4,
    maxCampaignWeeks: 1,
    maxPostsPerWeek: 3,
  },
  {
    code: 'pro',
    name: 'Pro',
    description: 'For individual professionals who need more.',
    sortOrder: 2,
    priceMonthlyCents: 2500,
    priceYearlyCents: 25000,
    generationCredits: 40,
    maxCampaignWeeks: 3,
    maxPostsPerWeek: 6,
  },
  {
    code: 'business',
    name: 'Business',
    description: 'For growing teams.',
    sortOrder: 3,
    priceMonthlyCents: 5000,
    priceYearlyCents: 50000,
    generationCredits: 100,
  },
];

const ADMIN_EMAIL = 'admin@mail.com';
const ADMIN_PASSWORD = 'yazz2003';

async function seedAdmin(prisma: PrismaClient) {
  const password = await hashPassword(ADMIN_PASSWORD);
  const user = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      name: 'Sada Admin',
      emailVerified: true,
      role: 'ADMIN',
    },
    create: {
      id: randomUUID(),
      name: 'Sada Admin',
      email: ADMIN_EMAIL,
      emailVerified: true,
      role: 'ADMIN',
    },
  });

  const credentialAccount = await prisma.account.findFirst({
    where: { userId: user.id, providerId: 'credential' },
    select: { id: true },
  });

  if (credentialAccount) {
    await prisma.account.update({
      where: { id: credentialAccount.id },
      data: { accountId: user.id, password },
    });
  } else {
    await prisma.account.create({
      data: {
        id: randomUUID(),
        accountId: user.id,
        providerId: 'credential',
        userId: user.id,
        password,
      },
    });
  }

  console.log(`Seeded admin "${ADMIN_EMAIL}"`);
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await seedAdmin(prisma);

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
          maxCampaignWeeks: plan.maxCampaignWeeks ?? null,
          maxPostsPerWeek: plan.maxPostsPerWeek ?? null,
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
          maxCampaignWeeks: plan.maxCampaignWeeks ?? null,
          maxPostsPerWeek: plan.maxPostsPerWeek ?? null,
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
