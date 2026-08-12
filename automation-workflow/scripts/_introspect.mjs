import { MCPClient } from '@mastra/mcp';
import { createMetaAdsServerConfig } from '../src/mastra/mcp/meta-oauth.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const client = new MCPClient({ id: 'introspect2', servers: { metaAds: createMetaAdsServerConfig() } });
let tools = {};
try {
  for (let attempt = 0; attempt < 6; attempt++) {
    if (attempt) { const w = [30000, 60000, 120000, 180000][Math.min(attempt - 1, 3)]; console.error(`retry in ${w / 1000}s...`); await sleep(w); }
    try {
      const r = await client.listToolsWithErrors();
      if (Object.keys(r.tools).length > 0) { tools = r.tools; break; }
    } catch (e) { console.error('err', e.message); }
  }
  const wanted = ['metaAds_ads_create_campaign', 'metaAds_ads_create_ad_set', 'metaAds_ads_create_creative', 'metaAds_ads_create_ad', 'metaAds_ads_get_ad_accounts'];
  for (const name of wanted) {
    const t = tools[name];
    if (!t) { console.log(`== ${name}: NOT FOUND`); continue; }
    console.log(`\n== ${name}`);
    console.log((t.inputSchema && t.inputSchema.jsonSchema ? t.inputSchema.jsonSchema : t.inputSchema));
  }
} finally {
  await client.disconnect();
}
