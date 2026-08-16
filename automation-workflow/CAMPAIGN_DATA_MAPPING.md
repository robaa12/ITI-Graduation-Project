# Campaign Data Mapping: From Two Workflows → Meta Ads

This document maps the outputs of **Content Creation Workflow** and **Strategy Workflow** to Meta Ads campaign fields, with suggested defaults for missing data.

---

## Input Sources

### 1. Content Creation Workflow Output
```json
{
  "calendar": [
    {
      "date": "2024-01-15",
      "platform": "instagram",
      "caption": "...",
      "hashtags": [...],
      "visualPrompt": "...",
      "imageUrl": "https://cdn.example.com/...",
      "cta": "Shop Now"
    }
  ]
}
```

### 2. Strategy Workflow Output (MarketingStrategyOutput)
```json
{
  "product": { ... },
  "stp": { ... },
  "personas": [ ... ],
  "buyerJourney": [ ... ],
  "smartObjectives": [ ... ],
  "campaignStrategy": { ... }
}
```

---

## Field Mapping Table

### Campaign Level

| Meta Ads Field | Source | Path | Required | Default if Missing |
|----------------|--------|------|----------|-------------------|
| Campaign name | Strategy | `campaignStrategy.campaignRecommendations[0].name` | ✅ | — |
| Buying type | — | — | ✅ | `AUCTION` |
| Campaign objective | Strategy | `campaignStrategy.campaignRecommendations[0].type` → map via `META_OBJECTIVES` | ✅ | — |
| Special Ad Categories | — | — | ⚠️ | `NONE` |
| Campaign budget strategy | — | — | ⚠️ | `AD_SET_BUDGET` |
| Daily campaign budget | — | — | ⚠️ | **5000** (cents = EGP 50) |
| Campaign spending limit | — | — | ❌ | `NULL` |
| A/B test | — | — | ❌ | `FALSE` |
| Advantage campaign budget | — | — | ❌ | `FALSE` |

### Ad Set Level

| Meta Ads Field | Source | Path | Required | Default if Missing |
|----------------|--------|------|----------|-------------------|
| Ad set name | Strategy | `campaignStrategy.campaignRecommendations[0].name + " Ad Set"` | ✅ | — |
| Conversion location | Strategy | `campaignStrategy.campaignRecommendations[0].channels` → if `meta`/`instagram`/`facebook` → `WEBSITE` | ✅ | `WEBSITE` |
| Performance goal | Strategy | `smartObjectives[0].kpi` → map: `LEAD`→`LEADS`, `REACH`→`REACH`, `LANDING_PAGE_VIEW`→`LANDING_PAGE_VIEWS` | ✅ | `LEADS` |
| Cost per result goal | — | — | ❌ | `NULL` |
| Value rules | — | — | ❌ | `DISABLED` |
| Attribution model | — | — | ✅/default | `DEFAULT` |
| Dynamic creative | — | — | ❌ | `FALSE` |
| Budget strategy | — | — | ✅ | `AD_SET_BUDGET` |
| Ad set daily budget | — | — | ⚠️ | **5000** (cents = EGP 50) |
| Start date | Content | `calendar[0].date` (earliest) | ✅ | Today |
| End date | Content | `calendar[last].date` (latest) | ❌ | Start + 30 days |
| Timezone | — | — | ✅ | `Africa/Cairo` (or account timezone) |
| Advantage+ Audience | — | — | ❌/default | `TRUE` |
| Saved audience | Strategy | `campaignStrategy.audienceStrategy.retargetingAudiences[]` | ❌ | `NULL` |
| Locations | Strategy | `stp.targetedSegments[0].segmentId` → `stp.segments[].geography[]` | ✅ | `["United States"]` |
| Minimum age | Strategy | `personas[].demographics` → extract min | ✅ | `18` |
| Maximum age | Strategy | `personas[].demographics` → extract max | ❌ | `65` |
| Gender | — | — | ❌ | `ALL` |
| Languages | Strategy | `stp.segments[].geography` → map to languages | ❌ | `ALL` |
| Custom audiences include | Strategy | `campaignStrategy.audienceStrategy.retargetingAudiences[]` | ❌ | `NULL` |
| Custom audiences exclude | — | — | ❌ | `NULL` |
| Detailed targeting | Strategy | `personas[].painPoints`, `goals`, `interests` → map to Meta interests/behaviors | ❌ | `NULL` |
| Placement mode | — | — | ✅ | `ADVANTAGE_PLUS` |
| Manual placements | Strategy | `campaignStrategy.primaryChannels[].channel` → map to placements | ❌ | Auto |

### Ad Level

| Meta Ads Field | Source | Path | Required | Default if Missing |
|----------------|--------|------|----------|-------------------|
| Ad name | Strategy | `campaignStrategy.campaignRecommendations[0].name + " Ad " + index` | ✅ | — |
| Facebook Page | Tool call | `metaAds_get_account_pages` → pick first with `leadgen_tos_accepted=true` | ✅ | — |
| Instagram account | Tool call | From page mapping | ❌ | `NULL` |
| Ad format | Content | `calendar[].visualPrompt` exists → `VIDEO`, else `SINGLE_IMAGE` | ✅ | `SINGLE_IMAGE` |
| Primary text | Content | `calendar[].caption` | ✅ | — |
| Headline | Strategy | `campaignStrategy.creativeDirection.keyMessages[0]` | ⚠️ | First keyMessage |
| Description | — | — | ❌ | `NULL` |
| Media | Content | `calendar[].imageUrl` → download → `metaAds_upload_ad_image` | ✅ | — |
| Destination URL | — | — | ✅ for Website | **REQUIRED: Add to config** |
| Display URL | — | — | ❌ | `NULL` |
| Call-to-action | Content | `calendar[].cta` → map to Meta CTA types | ✅ | `LEARN_MORE` |
| Tracking parameters | — | — | ❌ | Auto UTM from campaign |
| Pixel/dataset | — | — | ⚠️ | **REQUIRED: Add to config** |
| Conversion event | — | — | ⚠️ | `LEAD` |

---

## Missing Data: Required Config Values

**Add these to a config file or .env:**

```bash
# .env additions
META_LANDING_PAGE_URL=https://yourdomain.com/landing
META_PIXEL_ID=1234567890
META_DEFAULT_DAILY_BUDGET=5000  # cents (EGP 50)
META_DEFAULT_CURRENCY=EGP
META_TIMEZONE=Africa/Cairo
META_DEFAULT_BID_STRATEGY=LOWEST_COST_WITHOUT_CAP
META_DEFAULT_CONVERSION_EVENT=LEAD
```

**Or create `config/campaign-defaults.json`:**
```json
{
  "landingPageUrl": "https://yourdomain.com/landing",
  "pixelId": "1234567890",
  "dailyBudgetCents": 5000,
  "currency": "EGP",
  "timezone": "Africa/Cairo",
  "bidStrategy": "LOWEST_COST_WITHOUT_CAP",
  "conversionEvent": "LEAD"
}
```

---

## Data Flow Summary

```
Content Workflow (calendar[])
    ├─→ captions → Ad.primary_text
    ├─→ cta → Ad.call_to_action
    ├─→ imageUrl → Ad.media (upload via MCP)
    ├─→ visualPrompt → Ad.format (video vs image)
    └─→ dates → AdSet.start_date / end_date

Strategy Workflow (MarketingStrategyOutput)
    ├─→ campaignRecommendations[] → Campaign.name, objective, AdSet.name
    ├─→ primaryChannels[] → Budget split, Placements
    ├─→ creativeDirection.keyMessages[] → Ad.headline, Ad.description
    ├─→ ctaStrategy → Ad.call_to_action fallback
    ├─→ audienceStrategy → AdSet targeting (locations, custom audiences)
    ├─→ personas[] → AdSet demographics, interests
    ├─→ stp.segments[].geography → AdSet.locations
    └─→ smartObjectives[].kpi → AdSet.performance_goal

Config/Defaults
    ├─→ Budget, Bidding, Timezone
    ├─→ Pixel, Conversion Event
    ├─→ Landing Page URL
    └─→ Default CTA, Format
```

---

## Agent Logic for Gap-Filling

1. **Always call `metaAds_get_account_pages`** → get real Page ID
2. **Upload each `imageUrl`** via `metaAds_upload_ad_image` → get `image_hash`
3. **Map Content CTA to Meta CTA**:
   - "Shop Now" → `SHOP_NOW`
   - "Learn More" → `LEARN_MORE`
   - "Sign Up" → `SIGN_UP`
   - "Book a Demo" → `CONTACT_US`
   - "Get Started" → `SIGN_UP`
4. **Derive budget** from `campaignStrategy.budgetAllocation` Meta share %
5. **Use config defaults** for any field not in either workflow
6. **Flag placeholders** in final summary for user to review
---

## Platform Filtering Logic (Agent Implementation)

The agent will filter `calendar[]` entries to **Facebook only**:

```typescript
const FACEBOOK_PLATFORMS = ['facebook'];

const facebookEntries = calendar.filter(entry => 
  entry.platform && FACEBOOK_PLATFORMS.includes(entry.platform.toLowerCase())
);

// Use facebookEntries for:
// - Ad primary_text (caption)
// - Ad call_to_action (cta)  
// - Ad media (imageUrl)
// - Ad format (visualPrompt → VIDEO/SINGLE_IMAGE)
// - AdSet schedule (dates)
```

| Input Platform | Used for Facebook Ads? |
|----------------|------------------------|
| `facebook` | ✅ Yes |
| `meta` | ❌ No (generic) |
| `instagram` | ❌ No |
| `messenger` | ❌ No |
| `linkedin` | ❌ No |
| `x` / `twitter` | ❌ No |
| `tiktok` | ❌ No |
| `youtube_shorts` | ❌ No |

**Only `platform: "facebook"` entries from the content calendar are used.**

---

## Sample Input Data (Embedded for Auto-Run)

### Content Workflow Output Sample
```json
{
  "calendar": [
    {
      "date": "2024-01-15",
      "platform": "facebook",
      "caption": "Ready to transform your mornings? ☕ Our new productivity planner helps you focus on what matters most. Link in bio to grab yours!",
      "hashtags": ["#productivity", "#morningroutine", "#plannerlife", "#goalsetting"],
      "visualPrompt": "Clean flat-lay of a minimalist planner open to a weekly spread, coffee cup beside it, natural morning light, soft shadows",
      "imageUrl": "https://cdn.example.com/generated/facebook-planner-morning.jpg",
      "cta": "Shop Now"
    },
    {
      "date": "2024-01-22",
      "platform": "facebook",
      "caption": "Stop optimizing your to-do list. Start optimizing your energy. 🧵\n\n1/ Your peak focus window is 2-3 hrs max.\n2/ Protect it like revenue.\n3/ Everything else? Delegate, defer, or delete.\n\nThe planner that enforces this: [link]",
      "hashtags": ["#productivitytips", "#deeppwork", "#founderlife"],
      "visualPrompt": "Split screen: chaotic desk vs clean planner workflow, warm lighting",
      "imageUrl": "https://cdn.example.com/generated/facebook-energy-optimization.jpg",
      "cta": "Learn More"
    },
    {
      "date": "2024-01-29",
      "platform": "instagram",
      "caption": "POV: You finally found a planner that doesn't make you feel guilty 😌 #plannertok #productivityhacks",
      "hashtags": ["#plannertok", "#productivityhacks", "#adhdorganization"],
      "visualPrompt": "Fast-paced 15s video: person flips through planner, taps checkboxes",
      "imageUrl": "https://cdn.example.com/generated/instagram-planner-demo.mp4",
      "cta": "Link in bio"
    }
  ]
}
```
**Note:** Only the 2 `facebook` entries will be used. The `instagram` entry is filtered out.

### Strategy Workflow Output Sample (MarketingStrategyOutput)
```json
{
  "product": {
    "name": "FocusPlanner Pro",
    "type": "Physical productivity planner",
    "industry": "Stationery / Productivity",
    "businessModel": "ecommerce",
    "productMaturity": "growth",
    "pricingModel": "one-time",
    "pricingNotes": "$39.99 per planner, bulk discounts available",
    "coreFeatures": [
      "Daily/weekly/monthly spreads",
      "Energy-based task scheduling",
      "Habit tracker",
      "Reflection prompts",
      "Premium paper, lay-flat binding"
    ],
    "customerProblems": [
      "Digital tools add screen time",
      "Generic planners don't match energy levels",
      "No accountability system"
    ],
    "valueProposition": "The only planner designed around your energy, not just your time.",
    "uniqueSellingPoints": [
      "Energy-based scheduling method",
      "Science-backed productivity framework",
      "Premium tactile experience"
    ],
    "differentiators": [
      "Not just dates — energy zones",
      "Built-in weekly review system"
    ],
    "constraints": ["Physical inventory", "Shipping logistics"],
    "assumptions": ["Customers prefer physical over digital", "Willing to pay premium for quality"]
  },
  "stp": {
    "segments": [
      {
        "id": "founders-creators",
        "label": "Founders, creators, knowledge workers",
        "demographics": ["25-45", "Urban", "Income $75k+"],
        "geography": ["US", "CA", "UK", "AU"],
        "psychographics": ["High agency", "Self-optimizers", "Value deep work"],
        "behavior": ["Buy productivity tools", "Follow productivity content"],
        "companySize": ["1-50", "Solo"],
        "industry": ["Tech", "Creative", "Consulting"],
        "budget": "$20-100 per tool",
        "estimatedSize": "2M"
      }
    ],
    "targetedSegments": [
      { "segmentId": "founders-creators", "priority": "primary", "justification": "Highest pain/value fit" }
    ],
    "positioning": {
      "positioningStatement": "For founders and creators who do deep work, FocusPlanner Pro is the physical planner that schedules around your energy, not the clock, because your best work happens in flow, not by the hour.",
      "valueProposition": "The only planner designed around your energy, not just your time.",
      "brandPromise": "Do less, but better.",
      "keyDifferentiators": ["Energy zones", "Weekly review", "Premium materials"],
      "messagingPillars": [
        { "pillar": "Energy > Time", "description": "Match tasks to your natural energy cycles" },
        { "pillar": "Tactile focus", "description": "No screens, no notifications, just paper" },
        { "pillar": "Built-in accountability", "description": "Weekly review keeps you honest" }
      ],
      "toneOfVoice": "Calm, authoritative, minimal"
    }
  },
  "personas": [
    {
      "id": "sarah-founder",
      "name": "Sarah Chen",
      "role": "SaaS Founder",
      "segmentId": "founders-creators",
      "company": "FlowState.io (12 people)",
      "companySize": "12",
      "location": "Austin, TX",
      "goals": ["Ship product v2", "Reclaim 10hrs/week for deep work"],
      "frustrations": ["Context switching", "Endless meetings", "Digital fatigue"],
      "painPoints": ["Can't sustain focus", "Planner becomes a guilt journal"],
      "motivations": ["Build great product", "Work-life integration"],
      "buyingTriggers": ["Burnout scare", "New quarter planning", "Peer recommendation"],
      "objections": ["Another physical thing to carry", "Price vs apps"],
      "decisionCriteria": ["Paper quality", "Framework validity", "Peer reviews"],
      "preferredChannels": ["facebook", "linkedin", "newsletter", "podcast"],
      "preferredContent": ["long-form", "case-study", "video-demo"],
      "influenceMap": ["Twitter founder community", "Indie Hackers", "Newsletter writers"],
      "summary": "Sarah builds SaaS and drowns in shallow work. She needs a system that protects deep work time."
    }
  ],
  "buyerJourney": [
    {
      "personaId": "sarah-founder",
      "personaName": "Sarah Chen",
      "awareness": {
        "stage": "awareness",
        "problems": ["Digital tools increase screen time", "No energy-aware planning"],
        "questions": ["Is there a planner for energy management?"],
        "contentNeeds": [{ "type": "video", "topic": "Energy-based planning explained" }],
        "channels": ["facebook", "linkedin"],
        "kpis": ["Video views", "Landing page visits"]
      },
      "consideration": {
        "stage": "consideration",
        "problems": ["Comparing paper planners", "Skeptical of 'energy' claim"],
        "questions": ["Does the framework actually work?"],
        "contentNeeds": [{ "type": "case-study", "topic": "Founder reclaims 10hrs/week" }],
        "channels": ["facebook", "newsletter"],
        "kpis": ["Case study reads", "Email signups"]
      },
      "decision": {
        "stage": "decision",
        "objections": ["Price", "Shipping time"],
        "purchaseTriggers": ["Q2 planning", "Free shipping offer"],
        "cta": "Get your FocusPlanner",
        "channels": ["facebook", "email"],
        "kpis": ["Purchases", "ROAS"]
      },
      "retention": { "stage": "retention", "followUp": ["Onboarding email series", "Weekly tip"], "channels": ["email"] },
      "advocacy": { "stage": "advocacy", "referralOpportunities": ["Affiliate program"], "channels": ["email"] }
    }
  ],
  "smartObjectives": [
    {
      "id": "obj-sales-q1",
      "objective": "Generate $50k revenue from Facebook ads in Q1",
      "specific": "Sell 1,250 planners at $40 avg order value",
      "measurable": "Meta Ads Manager purchase conversion value",
      "achievable": "3% conversion rate at $2 CPC = $2.67 CPA, 1,250 sales = $3,333 ad spend",
      "relevant": "Direct revenue growth",
      "timeBound": "90 days",
      "kpi": "Revenue",
      "targetValue": "50000",
      "deadline": "2024-03-31",
      "funnelStage": "decision",
      "measurementMethod": "Meta Ads Manager + Shopify"
    }
  ],
  "campaignStrategy": {
    "summary": "Facebook conversion campaign targeting founders/creators with energy-based planning message. Single campaign, single ad set, multiple creatives from content calendar.",
    "primaryChannels": [
      { "channel": "facebook", "rationale": "Primary channel for founder demographic", "estimatedShare": 100, "primaryFunnelStage": "decision", "expectedKpis": ["Purchases", "ROAS", "CPA"] }
    ],
    "campaignRecommendations": [
      {
        "id": "fb-conversion-founders",
        "name": "FocusPlanner Pro - Founder Conversion",
        "type": "conversion",
        "primaryFunnelStage": "decision",
        "objective": "Drive planner purchases from founders/creators via Facebook",
        "targetPersonaIds": ["sarah-founder"],
        "channels": ["facebook"],
        "contentMix": [
          { "type": "image", "topic": "Morning planner ritual", "goal": "Desire" },
          { "type": "image", "topic": "Energy optimization split", "goal": "Proof" }
        ],
        "primaryKpi": "Purchases",
        "secondaryKpis": ["ROAS", "CPA", "CTR"],
        "duration": "8 weeks"
      }
    ],
    "audienceStrategy": {
      "primaryAudience": "Founders, creators, knowledge workers 25-45 in US/CA/UK/AU interested in productivity, entrepreneurship, SaaS",
      "secondaryAudiences": [],
      "retargetingAudiences": [
        "Website visitors 30d",
        "Video viewers 50%+",
        "Add-to-cart abandoners"
      ],
      "lookalikeSeeds": ["Purchasers", "High-value visitors"]
    },
    "creativeDirection": {
      "keyMessages": [
        "Plan by energy, not hours.",
        "Your best work happens in flow.",
        "The planner that protects deep work."
      ],
      "visualStyle": "Clean, warm, tactile product photography. Morning light. Minimal props.",
      "storytellingApproach": "Show the problem (chaos) → the method (energy zones) → the result (calm focus)",
      "doList": ["Show real product", "Energy zone close-ups", "Morning context"],
      "dontList": ["No stock photos", "No generic 'hustle' messaging", "No fake reviews"]
    },
    "ctaStrategy": {
      "primaryCta": "Shop Now",
      "secondaryCtas": ["Learn More", "See How It Works"],
      "ctaHierarchy": "Shop Now on all conversion ads"
    },
    "budgetAllocation": [
      { "bucket": "Facebook (conversion)", "percentage": 100, "rationale": "Single channel, single objective" }
    ],
    "kpis": [
      { "name": "Purchases", "target": "1250", "measurementCadence": "Weekly", "owner": "Growth" },
      { "name": "ROAS", "target": ">3.0", "measurementCadence": "Weekly", "owner": "Growth" },
      { "name": "CPA", "target": "<$15", "measurementCadence": "Weekly", "owner": "Growth" }
    ],
    "experiments": [],
    "risks": [
      { "risk": "High CPA in competitive niche", "mitigation": "Test broad targeting, optimize creative hook" }
    ]
  }
}
```

---

## Auto-Run Configuration

### Enable Automatic Execution on `npm run dev`

Create `scripts/auto-run-campaign.ts`:

```typescript
import { mastra } from '../src/mastra/index.ts';
import { agent } from '../src/mastra/agents/agent.ts';

// Load sample data from this markdown file (or separate JSON files)
import contentWorkflowOutput from './sample-content-output.json' assert { type: 'json' };
import strategyWorkflowOutput from './sample-strategy-output.json' assert { type: 'json' };

async function runCampaign() {
  console.log('🚀 Auto-running campaign creation from sample data...');
  
  // Combine inputs as the agent expects
  const input = `
Here is the market strategy from our planning workflow. Build the Meta Ads structure from it as PAUSED drafts:

STRATEGY WORKFLOW OUTPUT:
${JSON.stringify(strategyWorkflowOutput, null, 2)}

CONTENT WORKFLOW OUTPUT:
${JSON.stringify(contentWorkflowOutput, null, 2)}
`;

  const result = await agent.generate([
    { role: 'user', content: input }
  ]);
  
  console.log('✅ Campaign creation complete:', result.text);
  process.exit(0);
}

// Run on startup
runCampaign().catch(err => {
  console.error('❌ Auto-run failed:', err);
  process.exit(1);
});
```

### Add to package.json scripts:
```json
{
  "scripts": {
    "dev": "mastra dev",
    "dev:auto": "node --experimental-strip-types scripts/auto-run-campaign.ts",
    "auth:meta": "node --env-file=.env scripts/auth-meta.mjs"
  }
}
```

### Run automatically:
```bash
npm run dev:auto
```

Or modify `mastra dev` startup hook to trigger the agent programmatically.
