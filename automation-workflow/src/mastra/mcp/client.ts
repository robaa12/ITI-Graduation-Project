import { MCPClient } from '@mastra/mcp';
import { createMetaAdsServerConfig } from './meta-oauth.mjs';

export const mcpClient = new MCPClient({
  id: 'meta-ads-mcp-client',
  servers: {
    metaAds: createMetaAdsServerConfig(),
  },
});
