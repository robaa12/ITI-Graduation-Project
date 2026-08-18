import assert from 'node:assert/strict';
import test from 'node:test';
import { MCPOAuthClientProvider } from '@mastra/mcp';
import {
  createMetaAdsServerConfig,
  normalizeMetaOAuthMetadata,
  REDIRECT_URL,
} from '../src/mastra/mcp/meta-oauth.mjs';

const TEST_PIPEBOARD_TOKEN = 'test-pipeboard-token';

test('uses an explicit bearer token when one is configured', () => {
  const previousToken = process.env.META_ACCESS_TOKEN;
  const previousPipeboardToken = process.env.PIPEBOARD_TOKEN;
  process.env.META_ACCESS_TOKEN = 'test-access-token';
  process.env.PIPEBOARD_TOKEN = TEST_PIPEBOARD_TOKEN;

  try {
    const config = createMetaAdsServerConfig();
    const headers = new Headers(config.requestInit?.headers);

    assert.equal(headers.get('authorization'), 'Bearer test-access-token');
    assert.equal(config.authProvider, undefined);
    // Verify token is in URL
    assert.ok(config.url.toString().includes(`token=${TEST_PIPEBOARD_TOKEN}`));
  } finally {
    if (previousToken === undefined) delete process.env.META_ACCESS_TOKEN;
    else process.env.META_ACCESS_TOKEN = previousToken;
    if (previousPipeboardToken === undefined) delete process.env.PIPEBOARD_TOKEN;
    else process.env.PIPEBOARD_TOKEN = previousPipeboardToken;
  }
});

test('uses an IPv4 loopback OAuth callback', () => {
  assert.equal(REDIRECT_URL, 'http://localhost:5533/oauth/callback');
});

test('uses dynamic MCP OAuth when neither a bearer token nor app id is configured', () => {
  const previousToken = process.env.META_ACCESS_TOKEN;
  const previousAppId = process.env.META_APP_ID;
  const previousPipeboardToken = process.env.PIPEBOARD_TOKEN;
  delete process.env.META_ACCESS_TOKEN;
  delete process.env.META_APP_ID;
  process.env.PIPEBOARD_TOKEN = TEST_PIPEBOARD_TOKEN;

  try {
    const config = createMetaAdsServerConfig();

    assert.ok(config.authProvider instanceof MCPOAuthClientProvider);
    assert.equal(typeof config.fetch, 'function');
    assert.equal(config.requestInit, undefined);
    // Verify token is in URL
    assert.ok(config.url.toString().includes(`token=${TEST_PIPEBOARD_TOKEN}`));
  } finally {
    if (previousToken === undefined) delete process.env.META_ACCESS_TOKEN;
    else process.env.META_ACCESS_TOKEN = previousToken;
    if (previousAppId === undefined) delete process.env.META_APP_ID;
    else process.env.META_APP_ID = previousAppId;
    if (previousPipeboardToken === undefined) delete process.env.PIPEBOARD_TOKEN;
    else process.env.PIPEBOARD_TOKEN = previousPipeboardToken;
  }
});

test('normalizes only Pipeboard Meta Ads mismatched OAuth issuer metadata', async () => {
  const metadataUrl = 'https://meta-ads.mcp.pipeboard.co/.well-known/oauth-authorization-server';
  const response = new Response(
    JSON.stringify({
      issuer: 'https://pipeboard.co',
      authorization_endpoint: 'https://pipeboard.co/oauth/authorize',
      token_endpoint: 'https://pipeboard.co/oauth/token',
    }),
    { headers: { 'content-type': 'application/json' } },
  );

  const normalized = await normalizeMetaOAuthMetadata(metadataUrl, response);
  assert.equal((await normalized.json()).issuer, 'https://meta-ads.mcp.pipeboard.co/');

  const unrelated = new Response(JSON.stringify({ issuer: 'https://pipeboard.co' }));
  assert.equal(
    await normalizeMetaOAuthMetadata('https://example.com/.well-known/oauth', unrelated),
    unrelated,
  );
});
