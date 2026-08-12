import { MCPClient } from '@mastra/mcp';
import { createMetaAdsServerConfig } from '../mcp/meta-oauth.mjs';

const client = new MCPClient({ id: 'dump', servers: { metaAds: createMetaAdsServerConfig() } });
const { tools } = await client.listToolsWithErrors();
const t = tools['metaAds_ads_create_campaign'];
const schema = t.inputSchema;
console.log('top-level keys:', Object.keys(schema));
const std = schema['~standard'] as { jsonSchema: { input: (opts?: Record<string, unknown>) => Record<string, unknown> } };
console.log(JSON.stringify(std.jsonSchema.input({ target: 'draft-07' }), null, 2));
await client.disconnect();