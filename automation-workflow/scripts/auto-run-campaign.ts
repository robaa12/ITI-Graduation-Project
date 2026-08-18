import { mastra } from '../src/mastra/index.ts';
import { agent } from '../src/mastra/agents/agent.ts';
import { Agent } from '@mastra/core/agent';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { mcpClient } from '../src/mastra/mcp/client.ts';
import { buildSystemPrompt } from '../src/mastra/agents/system-prompt.ts';
import { createTool } from '@mastra/core/tools';
import { pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function loadSampleData() {
  const contentPath = join(__dirname, 'sample-content-output.json');
  const strategyPath = join(__dirname, 'sample-strategy-output.json');
  const configPath = join(__dirname, 'campaign-config.json');

  const [contentRaw, strategyRaw, configRaw] = await Promise.all([
    readFile(contentPath, 'utf-8'),
    readFile(strategyPath, 'utf-8'),
    readFile(configPath, 'utf-8'),
  ]);

  return {
    content: JSON.parse(contentRaw),
    strategy: JSON.parse(strategyRaw),
    config: JSON.parse(configRaw),
  };
}

function filterFacebookEntries(calendar: any[]) {
  return calendar.filter(entry =>
    entry.platform && entry.platform.toLowerCase() === 'facebook'
  );
}

// Create a separate agent with FREE model for ads launching workflow
async function createLaunchAgent() {
  const { tools: mcpTools, errors: mcpErrors } = await mcpClient.listToolsWithErrors();
  if (Object.keys(mcpErrors).length > 0) {
    console.warn('MCP tools unavailable:', JSON.stringify(mcpErrors, null, 2));
  }

  const META_ADS_TOOLS = [
    'metaAds_get_account_pages',
    'metaAds_upload_ad_image',
    'metaAds_upload_ad_video_file',
    'metaAds_create_campaign',
    'metaAds_create_adset',
    'metaAds_create_ad_creative',
    'metaAds_create_ad',
  ] as const;

  type McpTool = (typeof mcpTools)[string];

  const metaAdsTools = Object.fromEntries(
    Object.entries(mcpTools)
      .filter(([name]) => (META_ADS_TOOLS as readonly string[]).includes(name))
      .map(([name, tool]) => {
        const mcpTool = tool as McpTool;
        const id = (mcpTool.id as string) ?? name;
        return [
          name,
          createTool({
            id,
            description: mcpTool.description,
            inputSchema: mcpTool.inputSchema,
            execute: async (input) => {
              console.log(`\n[LIVE] Calling ${name} with:`, JSON.stringify(input, null, 2));
              const result = await mcpTool.execute(input ?? {});
              console.log(`[LIVE] ${name} result:`, JSON.stringify(result, null, 2));
              return result;
            },
          }),
        ];
      }),
  );

  const workspacePath = 'workspace';

  return new Agent({
    id: 'launch-agent',
    name: 'Launch Agent',
    description: 'Facebook Ads campaign launcher using free model',
    instructions: buildSystemPrompt(pathToFileURL(`${workspacePath}/`).href),
    model: 'openrouter/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
    defaultOptions: {
      maxSteps: 100,
      autoResumeSuspendedTools: true,
    },
    tools: {
      ...metaAdsTools,
    },
  });
}

async function runCampaign() {
  console.log('🚀 Auto-running Facebook campaign creation from sample data...\n');

  try {
    const { content, strategy, config } = await loadSampleData();
    const facebookEntries = filterFacebookEntries(content.calendar);

    console.log(`📅 Content entries: ${content.calendar.length} total, ${facebookEntries.length} Facebook-only`);
    console.log(`🎯 Strategy campaign: ${strategy.campaignStrategy.campaignRecommendations[0]?.name}`);
    console.log(`💰 Budget allocation: Facebook ${strategy.campaignStrategy.primaryChannels[0]?.estimatedShare}%\n`);

    // Build the input prompt for the agent
    const input = `Here is the market strategy from our planning workflow. Build the Meta Ads structure from it as PAUSED drafts:

STRATEGY WORKFLOW OUTPUT (MarketingStrategyOutput):
${JSON.stringify(strategy, null, 2)}

CONTENT WORKFLOW OUTPUT (filtered to Facebook only):
${JSON.stringify({ calendar: facebookEntries }, null, 2)}

CAMPAIGN CONFIG:
${JSON.stringify(config, null, 2)}

Create a Facebook conversion campaign using the above data. Use the Facebook platform entries from the content calendar for ad creatives (primary text, CTA, images). Use the landingPageUrl from config for all creatives. All entities should be created as PAUSED.`;

    console.log('🤖 Creating launch agent with free model...\n');
    const launchAgent = await createLaunchAgent();

    console.log('🤖 Invoking launch agent...\n');
    const result = await launchAgent.generate([
      { role: 'user', content: input }
    ]);

    console.log('\n✅ Campaign creation complete!');
    console.log('━'.repeat(60));
    console.log(result.text);
    console.log('━'.repeat(60));

  } catch (error) {
    console.error('❌ Auto-run failed:', error);
    throw error;
  }
}

// Run and exit
runCampaign()
  .then(() => {
    console.log('\n🏁 Auto-run finished. Exiting...');
    process.exit(0);
  })
  .catch(err => {
    console.error('💥 Fatal error:', err);
    process.exit(1);
  });