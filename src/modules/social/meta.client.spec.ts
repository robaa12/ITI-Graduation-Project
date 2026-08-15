import { ConfigService } from '@nestjs/config';

import { META_SCOPES, MetaClient } from './meta.client';

describe('MetaClient', () => {
  const values: Record<string, string> = {
    'meta.appId': 'app-id',
    'meta.appSecret': 'app-secret',
    'meta.redirectUri':
      'https://api.example.com/api/connectors/meta/oauth/callback',
    'meta.frontendRedirectUrl': 'https://app.example.com/connectors',
    'meta.graphVersion': 'v25.0',
  };

  const client = new MetaClient({
    get: jest.fn((key: string) => values[key]),
    getOrThrow: jest.fn((key: string) => {
      if (!values[key]) throw new Error(`Missing ${key}`);
      return values[key];
    }),
  } as unknown as ConfigService);

  it('builds a state-bound authorization URL with the least publishing scopes', () => {
    const url = new URL(client.buildAuthorizationUrl('random-state'));

    expect(url.origin).toBe('https://www.facebook.com');
    expect(url.pathname).toBe('/v25.0/dialog/oauth');
    expect(url.searchParams.get('state')).toBe('random-state');
    expect(url.searchParams.get('redirect_uri')).toBe(
      values['meta.redirectUri'],
    );
    expect(url.searchParams.get('scope')?.split(',')).toEqual(META_SCOPES);
  });

  it('stays unconfigured until every OAuth setting is present', () => {
    const unconfigured = new MetaClient({
      get: jest.fn((key: string) =>
        key === 'meta.appId' ? 'app-id' : undefined,
      ),
    } as unknown as ConfigService);

    expect(unconfigured.isConfigured()).toBe(false);
  });
});
