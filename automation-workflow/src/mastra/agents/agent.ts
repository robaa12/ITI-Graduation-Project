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
