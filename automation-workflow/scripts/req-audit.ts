import { MCPClient } from '@mastra/mcp';
import { createMetaAdsServerConfig } from '../mcp/meta-oauth.mjs';

const client = new MCPClient({ id: 'req-audit', servers: { metaAds: createMetaAdsServerConfig() } });
const { tools } = await client.listToolsWithErrors();

const WANT = [
  'metaAds_ads_get_ad_accounts',
  'metaAds_ads_get_ad_account_pages',
  'metaAds_ads_get_ad_account_custom_audiences',
  'metaAds_ads_get_ad_images',
  'metaAds_ads_get_ad_videos',
  'metaAds_ads_creative_upload_image',
  'metaAds_ads_creative_upload_video',
  'metaAds_ads_create_campaign',
  'metaAds_ads_create_ad_set',
  'metaAds_ads_create_creative',
  'metaAds_ads_create_ad',
  'metaAds_ads_get_ad_entities',
  'metaAds_ads_get_creatives',
  'metaAds_ads_update_entity',
  'metaAds_ads_get_errors',
];

function stripReserved(node) {
  const out = {};
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('$')) continue;
    if (value && typeof value === 'object') {
      out[key] = Array.isArray(value)
        ? value.map((item) => (item && typeof item === 'object' ? stripReserved(item) : item))
        : stripReserved(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

for (const name of WANT) {
  const t = tools[name];
  if (!t) {
    console.log(name, '=> TOOL NOT FOUND');
    continue;
  }
  const std = t.inputSchema['~standard'];
  const json = stripReserved(std.jsonSchema.input({ target: 'draft-07' }));
  const props = json.properties ?? {};
  const required = json.required ?? [];
  const missing = required.filter((r) => !(r in props));
  const danglingRef = Object.entries(props).filter(([, v]) => v && typeof v === 'object' && Object.keys(v).length === 0);
  if (missing.length || danglingRef.length) {
    console.log(name);
    if (missing.length) console.log('  required-not-defined:', missing.join(', '));
    if (danglingRef.length)
      console.log('  emptied props (dangling $ref):', danglingRef.map(([k]) => k).join(', '));
  }
}
await client.disconnect();