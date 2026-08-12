import { MCPClient } from '@mastra/mcp';
import { createMetaAdsServerConfig } from '../mcp/meta-oauth.mjs';

const client = new MCPClient({
  id: 'meta-ads-auth-script',
  servers: {
    metaAds: createMetaAdsServerConfig(),
  },
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  let connected = false;
  for (const wait of [0, 30000, 60000, 120000]) {
    if (wait) {
      console.log(`Meta is rate-limiting this IP; waiting ${wait / 1000}s before retrying...`);
      await sleep(wait);
    }
    try {
      await client.listTools();
      connected = true;
      break;
    } catch (e) {
      console.warn(`Connect attempt failed: ${e.message}`);
    }
  }

  if (!connected) throw new Error('Could not connect to Meta Ads MCP server.');

  const { tools, errors } = await client.listToolsWithErrors();
  const names = Object.keys(tools);
  console.log(`Connected to Meta Ads. MCP tools available: ${names.length}`);
  if (names.length) console.log(names.join(', '));
  if (Object.keys(errors).length) console.error('Errors:', JSON.stringify(errors, null, 2));
} finally {
  await client.disconnect();
}