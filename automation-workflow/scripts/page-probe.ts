import { MCPClient } from '@mastra/mcp';
import { createMetaAdsServerConfig } from '../mcp/meta-oauth.mjs';

const client = new MCPClient({ id: 'page-probe', servers: { metaAds: createMetaAdsServerConfig() } });
const { tools } = await client.listToolsWithErrors();
const pages = tools['metaAds_ads_get_ad_account_pages'];
try {
  const res = await pages.execute(
    { advertiser_request: 'fetch pages for ad account to use for lead ads', ad_account_id: '1047735554778180' },
    {},
  );
  console.log('isError:', (res as { isError?: boolean }).isError);
  console.log(JSON.stringify(res, null, 2).slice(0, 1500));
} catch (e) {
  console.log('THREW:', (e as Error).message);
  try {
    console.log(JSON.stringify(JSON.parse((e as Error).message), null, 2).slice(0, 1200));
  } catch {
    /* noop */
  }
}
await client.disconnect();