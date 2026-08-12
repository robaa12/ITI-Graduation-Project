import { pathToFileURL } from 'node:url';
import { Agent } from '@mastra/core/agent';
import { TaskSignalProvider } from '@mastra/core/signals';
import { askUserTool, createTool, webFetchTool } from '@mastra/core/tools';
import { LocalFilesystem, LocalSandbox, WORKSPACE_TOOLS, Workspace } from '@mastra/core/workspace';
import { Memory } from '@mastra/memory';
import { startScheduleTool, stopScheduleTool } from '../tools/schedule-tools.ts';
import { mcpClient } from '../mcp/client.ts';
import { buildSystemPrompt } from './system-prompt.ts';

const { tools: mcpTools, errors: mcpErrors } = await mcpClient.listToolsWithErrors();
if (Object.keys(mcpErrors).length > 0) {
  console.warn('MCP tools unavailable:', JSON.stringify(mcpErrors, null, 2));
}

const META_ADS_TOOLS = [
  'metaAds_ads_get_ad_account_pages',
  'metaAds_ads_creative_upload_image',
  'metaAds_ads_creative_upload_video',
  'metaAds_ads_create_campaign',
  'metaAds_ads_create_ad_set',
  'metaAds_ads_create_creative',
  'metaAds_ads_create_ad',
] as const;

type McpTool = (typeof mcpTools)[string];

const DRY_RUN_DESCRIPTIONS: Record<string, string> = {
  metaAds_ads_get_ad_account_pages:
    'List the ad account’s connected Pages so we can pick which page_id to run the ads on.',
  metaAds_ads_creative_upload_image:
    'Upload an image asset to Meta and get back the image_hash used in ad creatives.',
  metaAds_ads_creative_upload_video:
    'Upload a video asset to Meta and get back the video_id used in ad creatives.',
  metaAds_ads_create_campaign:
    'Create a Facebook ad campaign with the given name, objective, status and budget.',
  metaAds_ads_create_ad_set:
    'Create an ad set that defines the targeting, placements, budget and schedule for a campaign.',
  metaAds_ads_create_creative:
    'Create an ad creative (object story spec) holding the ad copy, link, image and call-to-action.',
  metaAds_ads_create_ad:
    'Create an ad that binds an ad set to a creative so it can run.',
};

let dryRunStep = 0;

function dryRunResult(toolName: string, input: Record<string, unknown>): Record<string, unknown> {
  dryRunStep += 1;
  const step = dryRunStep;
  console.log('\n[DRY-RUN] Step %d — %s', step, toolName);
  console.log('  desc: %s', DRY_RUN_DESCRIPTIONS[toolName] ?? 'Meta Ads tool call (simulated).');
  console.log('  input: %s', JSON.stringify(input, null, 2));
  return { success: true, dry_run: true, note: 'Simulated — nothing was sent to Meta.' };
}

const metaAdsTools = Object.fromEntries(
  Object.entries(mcpTools)
    .filter(([name]) => (META_ADS_TOOLS as readonly string[]).includes(name))
    .map(([name, tool]) => {
      const mcpTool = tool as McpTool;
      const id = (mcpTool.id as string) ?? name;
      const simulate = (input: Record<string, unknown>): Record<string, unknown> => {
        const step = dryRunStep + 1;
        switch (name) {
          case 'metaAds_ads_get_ad_account_pages':
            return {
              ...dryRunResult(name, input),
              ad_account_pages: [
                { id: 'dryrun_page_001', name: 'Dry Run Page', leadgen_tos_accepted: true },
              ],
              total_count: 1,
            };
          case 'metaAds_ads_creative_upload_image':
            return { ...dryRunResult(name, input), image_hash: `dryrun_img_${step}` };
          case 'metaAds_ads_creative_upload_video':
            return { ...dryRunResult(name, input), video_id: `dryrun_vid_${step}` };
          case 'metaAds_ads_create_campaign':
            return { ...dryRunResult(name, input), campaign_id: `dryrun_campaign_${step}` };
          case 'metaAds_ads_create_ad_set':
            return { ...dryRunResult(name, input), ad_set_id: `dryrun_adset_${step}` };
          case 'metaAds_ads_create_creative':
            return { ...dryRunResult(name, input), ad_creative_id: `dryrun_creative_${step}` };
          case 'metaAds_ads_create_ad':
            return { ...dryRunResult(name, input), ad_id: `dryrun_ad_${step}` };
          default:
            return dryRunResult(name, input);
        }
      };
      return [
        name,
        createTool({
          id,
          description: mcpTool.description,
          inputSchema: mcpTool.inputSchema,
          execute: async (input) => simulate((input ?? {}) as Record<string, unknown>),
        }),
      ];
    }),
);

console.log(`Loaded ${Object.keys(metaAdsTools).length}/${Object.keys(mcpTools).length} Meta Ads tools.`);

const workspacePath = 'workspace';

const workspace = new Workspace({
  id: 'agent-workspace',
  name: 'Agent Workspace',
  filesystem: new LocalFilesystem({
    basePath: workspacePath,
  }),
  sandbox: new LocalSandbox({
    workingDirectory: workspacePath,
  }),
  tools: {
    [WORKSPACE_TOOLS.FILESYSTEM.WRITE_FILE]: {
      requireReadBeforeWrite: true,
    },
    [WORKSPACE_TOOLS.FILESYSTEM.EDIT_FILE]: {
      requireReadBeforeWrite: true,
    },
    [WORKSPACE_TOOLS.FILESYSTEM.DELETE]: {
      requireApproval: true,
    },
  },
});

export const agent = new Agent({
  id: 'agent',
  name: 'Agent',
  description:
    'A senior Meta marketing specialist that plans, creates, and optimizes Facebook & Instagram ad campaigns via the Meta Ads MCP tools.',
  metadata: {
    suggestedPrompts: [
      'Set up a sales campaign for my e-commerce store on a $100/day budget.',
      'Review my current campaigns and recommend optimizations.',
      'Write 3 ad copy variations for a lead-gen campaign.',
      'Here is the market strategy from our planning workflow. Build the Meta Ads structure from it as PAUSED drafts: <paste the MarketingStrategyOutput JSON>',
    ],
  },
  instructions: buildSystemPrompt(pathToFileURL(`${workspacePath}/`).href),
  model: 'openrouter/anthropic/claude-sonnet-5',
  defaultOptions: {
    maxSteps: 100,
    autoResumeSuspendedTools: true,
  },
  memory: new Memory({
    options: {
      generateTitle: true,
    },
  }),
  workspace,
  tools: {
    ask_user: askUserTool,
    start_schedule: startScheduleTool,
    stop_schedule: stopScheduleTool,
    web_fetch: webFetchTool,
    ...metaAdsTools,
  },
  signals: [new TaskSignalProvider()],
});
