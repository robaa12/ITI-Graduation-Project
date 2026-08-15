# automation-workflow

Standalone demo for the **Meta Ads MCP campaign planner** — an agent that converts a `MarketingStrategyOutput` JSON into the exact sequence of Meta Ads MCP tool calls it would make to create campaigns, ad sets, creatives, and ads.

It runs in **DRY-RUN / planning mode**: every planned tool call is printed to the terminal (step number, tool name, one-sentence description, and the full input) and returns a fake `dryrun_*` id. **Nothing is created on Meta.**

## What's inside

```
automation-workflow/
├── package.json        # standalone package + scripts
├── tsconfig.json       # ES2022 + bundler module resolution for Mastra
├── .env.example        # copy to .env and fill in
├── src/mastra/
│   ├── index.ts        # Mastra app entry (agent + storage + observability)
│   ├── agents/         # agent, campaign rules, and system prompt
│   ├── mcp/            # shared MCP client and OAuth configuration
│   └── tools/          # schedule tools
├── scripts/            # connectivity checks, tool discovery, schema probes
├── docs/example-output.json  # fully-populated example input
└── tests/              # campaign mapping and channel tests
```

The 7 posting tools the agent plans with, always in this order:

1. `metaAds_ads_get_ad_account_pages` — list the ad account's Pages to pick a `page_id`.
2. `metaAds_ads_creative_upload_image` / `metaAds_ads_creative_upload_video` — upload an asset for the creative.
3. `metaAds_ads_create_campaign` — create a PAUSED campaign (name, objective, budget, schedule).
4. `metaAds_ads_create_ad_set` — define targeting, placements, budget and schedule.
5. `metaAds_ads_create_creative` — the ad copy, link, image and call-to-action.
6. `metaAds_ads_create_ad` — bind the ad set to the creative.

## Requirements

- A verified Facebook Business Manager account (identity verification + official documents upload).
- A Meta ad account (`act_…`) **enabled for the Ads MCP** (Meta is rolling it out gradually across ad accounts).
- Optionally, a pre-registered Facebook App (`META_APP_ID` / `META_APP_SECRET`) for OAuth. Without one, the MCP client uses dynamic client registration.
- Optionally, a User access token (`META_ACCESS_TOKEN`) from the [Graph API Explorer](https://developers.facebook.com/tools/explorer). When present, it is used instead of OAuth and expires after a couple of hours.
- An OpenRouter API key for the agent model.

## Run

```shell
npm install
cp .env.example .env     # fill in your credentials
npm run auth:meta        # authorize via OAuth, or verify META_ACCESS_TOKEN
npm run dev
```

Open [http://localhost:4111](http://localhost:4111), select the **Agent**, and paste a `MarketingStrategyOutput` JSON (see `docs/example-output.json` for a full example).

When `META_ACCESS_TOKEN` is empty, `auth:meta` opens the Meta authorization page, receives the callback on `http://localhost:5533/oauth/callback`, and stores tokens in the ignored `.mastra/oauth/` directory. The script prefers IPv4 for `localhost` so the browser and callback listener use the same loopback interface. Add that exact URL to the Meta app's Valid OAuth Redirect URIs and keep the app in Development mode while using a plain-HTTP local callback. When a bearer token is supplied, it simply verifies that connection.

You can re-run the connection check at any time:

```shell
npm run auth:meta       # expect: Connected to Meta Ads. MCP tools available: 95
```

## How it works

The agent reads the six-field `MarketingStrategyOutput` JSON (`product`, `stp`, `personas[]`, `buyerJourney[]`, `smartObjectives[]`, `campaignStrategy`), decides the campaign structure, and walks the posting sequence. Every tool is wrapped so a call prints:

```
[DRY-RUN] Step 3 — metaAds_ads_create_campaign
  desc: Create a Facebook ad campaign with the given name, objective, status and budget.
  input: { "advertiser_request": "...", "campaign_name": "...", "objective": "OUTCOME_LEADS", "status": "PAUSED", ... }
result: { "success": true, "dry_run": true, "campaign_id": "dryrun_campaign_1" }
```

Everything is planned as **PAUSED**; missing values (page ids, image hashes, custom-audience ids) are flagged as placeholders.

## Going live

To actually create ads on Meta instead of planning, remove the dry-run `execute` wrappers in `src/mastra/agents/agent.ts` so they call the underlying MCP tools, and confirm the ad account is enrolled in the Ads MCP.
