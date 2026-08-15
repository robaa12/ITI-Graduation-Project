import { MCPClient } from '@mastra/mcp';
import { createMetaAdsServerConfig } from '../src/mastra/mcp/meta-oauth.mjs';
import { fromStandardJsonSchema } from 'zod';

const client = new MCPClient({
  id: 'probe',
  servers: { metaAds: createMetaAdsServerConfig() },
});

const { tools, errors } = await client.listToolsWithErrors();
console.log('errors:', Object.keys(errors).length);
const names = Object.keys(tools);
console.log('tools:', names.length);
for (const name of names) {
  const t = tools[name];
  let schema = null;
  try { schema = t.inputSchema; } catch (e) { console.log(name, '=> inputSchema threw:', (e as Error).message); continue; }
  if (!schema) { console.log(name, '=> no schema'); continue; }
  // schema may be { type, properties } or a JSON schema; try standard conversion
  try {
    const converted = fromStandardJsonSchema(schema as never);
    console.log(name, '=> OK', JSON.stringify(converted._def?.typeName ?? typeof converted));
  } catch (e) {
    console.log(name, '=> FAIL:', (e as Error).message);
  }
}
await client.disconnect();
