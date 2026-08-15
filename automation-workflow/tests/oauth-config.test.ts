import assert from 'node:assert/strict';
import test from 'node:test';
import { MCPOAuthClientProvider } from '@mastra/mcp';
import {
  createMetaAdsServerConfig,
  normalizeMetaOAuthMetadata,
  REDIRECT_URL,
} from '../src/mastra/mcp/meta-oauth.mjs';

test('uses an explicit bearer token when one is configured', () => {
  const previousToken = process.env.META_ACCESS_TOKEN;
  process.env.META_ACCESS_TOKEN = 'test-access-token';

  try {
    const config = createMetaAdsServerConfig();
    const headers = new Headers(config.requestInit?.headers);

    assert.equal(headers.get('authorization'), 'Bearer test-access-token');
    assert.equal(config.authProvider, undefined);
  } finally {
    if (previousToken === undefined) delete process.env.META_ACCESS_TOKEN;
    else process.env.META_ACCESS_TOKEN = previousToken;
  }
});

test('uses an IPv4 loopback OAuth callback', () => {
  assert.equal(REDIRECT_URL, 'http://localhost:5533/oauth/callback');
});

test('uses dynamic MCP OAuth when neither a bearer token nor app id is configured', () => {
  const previousToken = process.env.META_ACCESS_TOKEN;
  const previousAppId = process.env.META_APP_ID;
  delete process.env.META_ACCESS_TOKEN;
  delete process.env.META_APP_ID;

  try {
    const config = createMetaAdsServerConfig();

    assert.ok(config.authProvider instanceof MCPOAuthClientProvider);
    assert.equal(typeof config.fetch, 'function');
    assert.equal(config.requestInit, undefined);
  } finally {
    if (previousToken === undefined) delete process.env.META_ACCESS_TOKEN;
    else process.env.META_ACCESS_TOKEN = previousToken;
    if (previousAppId === undefined) delete process.env.META_APP_ID;
    else process.env.META_APP_ID = previousAppId;
  }
});

test('normalizes only Meta Ads mismatched OAuth issuer metadata', async () => {
  const metadataUrl = 'https://mcp.facebook.com/.well-known/oauth-authorization-server/ads';
  const response = new Response(
    JSON.stringify({
      issuer: 'https://www.facebook.com',
      authorization_endpoint: 'https://www.facebook.com/v26.0/dialog/oauth',
      token_endpoint: 'https://graph.facebook.com/v26.0/oauth/access_token',
    }),
    { headers: { 'content-type': 'application/json' } },
  );

  const normalized = await normalizeMetaOAuthMetadata(metadataUrl, response);
  assert.equal((await normalized.json()).issuer, 'https://mcp.facebook.com/ads');

  const unrelated = new Response(JSON.stringify({ issuer: 'https://www.facebook.com' }));
  assert.equal(
    await normalizeMetaOAuthMetadata('https://example.com/.well-known/oauth', unrelated),
    unrelated,
  );
});
