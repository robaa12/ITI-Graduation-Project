import { MCPClient } from '@mastra/mcp';
import { createMetaAdsServerConfig } from '../src/mastra/mcp/meta-oauth.mjs';

const client = new MCPClient({
  id: 'schema-scan',
  servers: { metaAds: createMetaAdsServerConfig() },
});

const { tools } = await client.listToolsWithErrors();
const names = Object.keys(tools);
console.log('tools:', names.length);

const STANDARD = new Set([
  '$ref', '$defs', '$schema', 'title', 'description', 'type', 'properties',
  'required', 'items', 'additionalProperties', 'minItems', 'maxItems',
  'minLength', 'maxLength', 'pattern', 'format', 'enum', 'anyOf', 'oneOf',
  'allOf', 'not', 'default', 'minimum', 'maximum', 'exclusiveMinimum',
  'exclusiveMaximum', 'multipleOf', 'const', 'uniqueItems', 'deprecated',
]);

function scan(node: Record<string, unknown> | Array<unknown> | string | number | boolean | null | undefined, path: string): string[] {
  const out: string[] = [];
  if (node === null || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    node.forEach((v, i) => out.push(...scan(v as Record<string, unknown>, path + `[${i}]`)));
    return out;
  }
  for (const [k, v] of Object.entries(node)) {
    const flag = k.startsWith('$') ? 'RESERVED' : STANDARD.has(k) ? '' : 'NON_STANDARD';
    if (flag) out.push(path + k + ' [' + flag + ']');
    out.push(...scan(v as Record<string, unknown>, path + k + '/'));
  }
  return out;
}

for (const name of names) {
  const t = tools[name];
  let schema: never;
  try {
    schema = t.inputSchema;
  } catch {
    continue;
  }
  if (!schema) continue;
  const issues = scan(schema, '');
  if (issues.length) {
    console.log('\n=== ' + name);
    console.log(issues.slice(0, 8).join('\n'));
  }
}
await client.disconnect();
