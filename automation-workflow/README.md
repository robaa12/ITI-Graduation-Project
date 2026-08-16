# Facebook Ads Campaign Automation Workflow

Automated pipeline that takes outputs from **Content Creation Workflow** and **Strategy Workflow**, filters for Facebook content, and creates a live Facebook Ads campaign via Pipeboard's Meta Ads MCP.

---

## Architecture Overview

```
┌─────────────────────┐     ┌─────────────────────┐
│  Content Workflow   │     │  Strategy Workflow  │
│  (calendar.json)    │     │  (MarketingStrategy │
│                     │     │   Output)           │
└─────────┬───────────┘     └─────────┬───────────┘
          │                           │
          └───────────┬───────────────┘
                      ▼
          ┌───────────────────────┐
          │   Auto-Run Script     │
          │ (auto-run-campaign.ts)│
          └───────────┬───────────┘
                      ▼
          ┌───────────────────────┐
          │   Launch Agent        │
          │ (Nemotron 3 Nano      │
          │  free model)          │
          └───────────┬───────────┘
                      ▼
          ┌───────────────────────┐
          │   Pipeboard MCP       │
          │   (Meta Ads API)      │
          └───────────┬───────────┘
                      ▼
          ┌───────────────────────┐
          │   Facebook Ads        │
          │   Campaign Created    │
          └───────────────────────┘
```

---

## Input Data Sources

### 1. Content Creation Workflow Output
**File:** `scripts/sample-content-output.json`

```json
{
  "calendar": [
    {
      "date": "2024-01-15",
      "platform": "facebook",
      "caption": "Ready to transform your mornings? ☕ Our new productivity planner helps you focus on what matters most.",
      "hashtags": ["#productivity", "#morningroutine", "#plannerlife"],
      "visualPrompt": "Clean flat-lay of a minimalist planner open to a weekly spread, coffee cup beside it",
      "imageUrl": "https://cdn.example.com/generated/facebook-planner-morning.jpg",
      "cta": "Shop Now"
    },
    {
      "date": "2024-01-22",
      "platform": "facebook",
      "caption": "Stop optimizing your to-do list. Start optimizing your energy.",
      "hashtags": ["#productivitytips", "#deepwork"],
      "visualPrompt": "Split screen: chaotic desk vs clean planner workflow",
      "imageUrl": "https://cdn.example.com/generated/facebook-energy-optimization.jpg",
      "cta": "Learn More"
    },
    {
      "date": "2024-01-29",
      "platform": "instagram",
      "caption": "POV: You finally found a planner that doesn't make you feel guilty 😌",
      "hashtags": ["#plannertok", "#productivityhacks"],
      "visualPrompt": "Fast-paced 15s video: person flips through planner",
      "imageUrl": "https://cdn.example.com/generated/instagram-planner-demo.mp4",
      "cta": "Link in bio"
    }
  ]
}
```

**Filtering:** Only entries with `"platform": "facebook"` are used (2 of 3 above). Instagram/TikTok/LinkedIn/X entries are ignored.

### 2. Strategy Workflow Output (MarketingStrategyOutput)
**File:** `scripts/sample-strategy-output.json`

Contains 6 fields:
- `product` — What you're advertising (FocusPlanner Pro)
- `stp` — Segmentation, targeting, positioning
- `personas[]` — Target audience profiles (Sarah Chen, SaaS Founder)
- `buyerJourney[]` — Per-persona journey stages
- `smartObjectives[]` — Measurable goals ($50k revenue in Q1)
- `campaignStrategy` — Execution plan (channels, budget, creatives, audiences)

---

## Why Pipeboard MCP (Non-Official)

Meta's official Ads MCP (`https://mcp.facebook.com/ads`) requires:
- Verified Business Manager with identity verification
- Ad account enrolled in Meta's gradual Ads MCP rollout
- Facebook App with approved OAuth redirect URIs

**Pipeboard's MCP** (`https://meta-ads.mcp.pipeboard.co/`) provides:
- Immediate access without Meta approval waitlist
- 115+ Meta Ads tools (create campaign, ad set, creative, ad, upload images, targeting, insights)
- Token-based auth via URL parameter
- Works with any Meta ad account

**Configuration in `src/mastra/mcp/meta-oauth.mjs`:**
```javascript
const META_ADS_SERVER_URL = 'https://meta-ads.mcp.pipeboard.co/';
const PIPEBOARD_TOKEN = 'pipeboard_yCH53uX1SvjiLQKDbZlsbzgdb9AQVp0Q3a0P';

// Token passed as query param on every request
url.searchParams.set('token', PIPEBOARD_TOKEN);
```

---

## Sample Input Data (Embedded in Markdown)

The `CAMPAIGN_DATA_MAPPING.md` file contains **complete sample outputs** from both workflows:

- **Content Workflow**: 3 calendar entries (2 Facebook, 1 Instagram)
- **Strategy Workflow**: Full MarketingStrategyOutput for FocusPlanner Pro

These are also available as separate JSON files:
- `scripts/sample-content-output.json`
- `scripts/sample-strategy-output.json`

The auto-run script loads these automatically — no manual input needed.

---

## How to Run

### Prerequisites
1. **OpenRouter API key** — Add to `.env`:
   ```bash
   OPENROUTER_API_KEY=sk-or-v1-xxxxx
   ```
2. **Pipeboard token** — Already configured in `meta-oauth.mjs`
3. **Meta ad account ID** — Set in `system-prompt.ts`: `act_1860390718288386`
4. **Add $10 credits at OpenRouter** — Required to unlock 1000 free model requests/day (free tier = 50/day)

### Option 1: Fully Automatic (`npm run dev:auto`)

```bash
npm run dev:auto
```

**What happens:**
1. Loads sample data from both JSON files
2. Filters content calendar → Facebook-only entries
3. Creates launch agent with **Nemotron 3 Nano free model** (`nvidia/nemotron-3-nano-30b-a3b:free`)
4. Invokes agent with combined prompt
5. Agent executes 6-step posting sequence via Pipeboard MCP:
   - `metaAds_get_account_pages` → gets page ID
   - `metaAds_upload_ad_image` → uploads creatives (placeholder URLs fail, use real URLs)
   - `metaAds_create_campaign` → creates PAUSED campaign
   - `metaAds_create_adset` → creates ad set with targeting
   - `metaAds_create_ad_creative` → creates creatives with copy/images
   - `metaAds_create_ad` → binds ad set + creative
6. Outputs real Meta IDs for all created entities

**Expected output:**
```
🚀 Auto-running Facebook campaign creation from sample data...
📅 Content entries: 3 total, 2 Facebook-only
🎯 Strategy campaign: FocusPlanner Pro - Founder Conversion
💰 Budget allocation: Facebook 100%

[LIVE] Calling metaAds_get_account_pages...
[LIVE] Calling metaAds_upload_ad_image...
[LIVE] Calling metaAds_create_campaign...
  → Campaign ID: 120250231403880468
[LIVE] Calling metaAds_create_adset...
  → Ad Set ID: 120250231403880469
[LIVE] Calling metaAds_create_ad_creative...
  → Creative IDs: 120250231403880470, 120250231403880471
[LIVE] Calling metaAds_create_ad...
  → Ad IDs: 120250231403880472, 120250231403880473

✅ Campaign creation complete!
```

### Option 2: Manual via Mastra Studio (if rate limited)

If `dev:auto` hits free model daily limit (50 req/day):

```bash
npm run dev
```

1. Open **http://localhost:4111** (Mastra Studio)
2. Select **Agent** in the sidebar
3. Paste this prompt in chat:

```
Here is the market strategy from our planning workflow. Build the Meta Ads structure from it as PAUSED drafts:

STRATEGY WORKFLOW OUTPUT (MarketingStrategyOutput):
[PASTE CONTENTS OF scripts/sample-strategy-output.json]

CONTENT WORKFLOW OUTPUT (filtered to Facebook only):
[PASTE CONTENTS OF scripts/sample-content-output.json, KEEP ONLY facebook ENTRIES]

Create a Facebook conversion campaign using the above data. Use the Facebook platform entries from the content calendar for ad creatives (primary text, CTA, images). All entities should be created as PAUSED.
```

4. In Studio model selector, pick any available model (Claude, GPT, etc.)
5. Agent will execute the same 6-step sequence interactively

---

## Tools Used (Pipeboard MCP)

| Tool | Purpose | Called By Agent |
|------|---------|-----------------|
| `metaAds_get_account_pages` | List ad account's Facebook pages | Step 1 |
| `metaAds_upload_ad_image` | Upload image, return image_hash | Step 2 |
| `metaAds_upload_ad_video_file` | Upload video, return video_id | Step 2 (if video) |
| `metaAds_create_campaign` | Create PAUSED campaign | Step 3 |
| `metaAds_create_adset` | Create ad set with targeting/budget | Step 4 |
| `metaAds_create_ad_creative` | Create creative (copy + media + CTA) | Step 5 |
| `metaAds_create_ad` | Bind ad set + creative | Step 6 |

**All 7 tools** are filtered from Pipeboard's 115 tools and wrapped for live execution (no dry-run).

---

## Configuration Files

| File | Purpose |
|------|---------|
| `.env` | `OPENROUTER_API_KEY` |
| `src/mastra/mcp/meta-oauth.mjs` | Pipeboard MCP URL + token |
| `src/mastra/agents/system-prompt.ts` | Default ad account ID, posting sequence, Facebook-only filter |
| `src/mastra/agents/agent.ts` | Main chat agent (uses paid model) |
| `scripts/auto-run-campaign.ts` | Auto-run script (uses Nemotron 3 Nano free model) |
| `scripts/sample-content-output.json` | Content workflow sample output |
| `scripts/sample-strategy-output.json` | Strategy workflow sample output |
| `CAMPAIGN_DATA_MAPPING.md` | Full field mapping + embedded samples |
| `package.json` | Scripts: `dev`, `dev:auto`, `auth:meta` |

---

## Important Notes

### Image Placeholders
The sample content uses `https://cdn.example.com/...` URLs which **will fail** (host doesn't exist).

**For production:** Replace `imageUrl` in content workflow output with:
- Real publicly accessible image URLs (CDN, S3, Imgur)
- Or upload via Pipeboard Creatives UI → use returned image hash directly

### Page ID (Dynamic in Production)
Currently hardcoded in `system-prompt.ts`:
```typescript
export const DEFAULT_AD_ACCOUNT_ID = 'act_1860390718288386';
```

Agent calls `metaAds_get_account_pages` and picks the first page. In production:
- Allow user to select page via `ask_user` tool
- Or pass page_id in strategy input

### Budget Minimum
Meta requires minimum daily budget (EGP 50 for Egypt accounts). Auto-run handles this by retrying with higher budget.

### Free Model Limits
- **Nemotron 3 Nano free**: 50 requests/day
- **Error**: `Rate limit exceeded: free-models-per-day`
- **Fix**: Add $10 credits at OpenRouter → 1000 requests/day
- **Alternative**: Use Option 2 (Mastra Studio) with paid model

---

## Campaign Structure Created

For the FocusPlanner Pro sample:

```
Campaign: "FocusPlanner Pro - Founder Conversion" (PAUSED)
  └─ Objective: OUTCOME_SALES
  └─ Daily Budget: EGP 555 (55500 cents)
  └─ Ad Set: "FocusPlanner_Founder_Audience" (PAUSED)
        └─ Targeting: Age 25-45, Countries: US, CA, GB, AU
        └─ Optimization: OFFSITE_CONVERSIONS (Purchase)
        └─ Creative 1: "Morning planner ritual" (image + "Shop Now")
        └─ Creative 2: "Energy optimization split" (image + "Learn More")
        └─ Ad 1: Ad Set + Creative 1 (PAUSED)
        └─ Ad 2: Ad Set + Creative 2 (PAUSED)
```

All entities are **PAUSED** — activate manually in Ads Manager when ready.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `402 Payment Required` / `429 Rate Limit` | Add credits at openrouter.ai/settings/credits |
| `image download failed` | Use real image URLs or upload via Pipeboard Creatives |
| `Budget too small` | Increase daily_budget (min EGP 50 for EG accounts) |
| `Invalid country code` | Use ISO codes: `GB` not `UK`, `US`, `CA`, `AU` |
| `Billing event invalid` | Use `PURCHASE` not `PURCHASES` for OFFSITE_CONVERSIONS |
| `No page found` | Ensure ad account has connected Facebook page |
| `OAuth failed` | Verify Pipeboard token in meta-oauth.mjs |

---

## Extending for Production

1. **Dynamic inputs** — Replace sample JSON with actual workflow outputs
2. **Page selection** — Add `ask_user` tool to pick from `metaAds_get_account_pages` results
3. **Image handling** — Integrate with image generation/upload pipeline
4. **Multi-campaign** — Loop through `campaignRecommendations[]`
5. **Error recovery** — Add retry logic for transient MCP errors
5. **Monitoring** — Add observability via Mastra's built-in tracing