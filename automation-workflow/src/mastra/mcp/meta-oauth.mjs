import { spawn } from 'node:child_process';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { getCallbackUrlCandidates, MCPOAuthClientProvider } from '@mastra/mcp';

export const REDIRECT_URL = 'http://localhost:5533/oauth/callback';
const META_ADS_SERVER_URL = 'https://mcp.facebook.com/ads';
const META_AUTH_METADATA_URL =
  'https://mcp.facebook.com/.well-known/oauth-authorization-server/ads';
const REDIRECT_URIS = getCallbackUrlCandidates(REDIRECT_URL).map((url) => url.toString());
const TOKEN_FILE = join(process.cwd(), '.mastra', 'oauth', 'meta-ads.json');

class FileOAuthStorage {
  async set(key, value) {
    const data = await this.#read();
    data[key] = value;
    await this.#write(data);
  }

  async get(key) {
    const data = await this.#read();
    return data[key];
  }

  async delete(key) {
    const data = await this.#read();
    delete data[key];
    await this.#write(data);
  }

  async #read() {
    try {
      return JSON.parse(await readFile(TOKEN_FILE, 'utf8'));
    } catch {
      return {};
    }
  }

  async #write(data) {
    await mkdir(dirname(TOKEN_FILE), { recursive: true });
    await writeFile(TOKEN_FILE, JSON.stringify(data, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    });
    await chmod(TOKEN_FILE, 0o600);
  }
}

class MetaOAuthClientProvider extends MCPOAuthClientProvider {
  #sessionState;
  #hasSessionVerifier = false;
  #hasSessionRedirect = false;

  async beginAuthorizationSession() {
    this.#sessionState = await super.beginAuthorizationSession();
    this.#hasSessionVerifier = false;
    this.#hasSessionRedirect = false;
    return this.#sessionState;
  }

  endAuthorizationSession() {
    this.#sessionState = undefined;
    this.#hasSessionVerifier = false;
    this.#hasSessionRedirect = false;
    super.endAuthorizationSession();
  }

  async saveCodeVerifier(codeVerifier) {
    if (this.#sessionState && this.#hasSessionVerifier) return;

    await super.saveCodeVerifier(codeVerifier);
    if (this.#sessionState) this.#hasSessionVerifier = true;
  }

  async redirectToAuthorization(url) {
    const state = url.searchParams.get('state');
    if (this.#sessionState && state === this.#sessionState && this.#hasSessionRedirect) return;

    await super.redirectToAuthorization(url);
    if (this.#sessionState && state === this.#sessionState) this.#hasSessionRedirect = true;
  }
}

function openBrowser(url) {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
  const child = spawn(command, [url.toString()], { detached: true, stdio: 'ignore' });
  child.unref();
  console.log('\nOpen this URL in your browser to authorize Meta Ads access:');
  console.log(url.toString());
}

export function createMetaOAuthProvider() {
  const clientInformation = process.env.META_APP_ID
    ? {
        client_id: process.env.META_APP_ID,
        ...(process.env.META_APP_SECRET ? { client_secret: process.env.META_APP_SECRET } : {}),
      }
    : undefined;

  return new MetaOAuthClientProvider({
    redirectUrl: REDIRECT_URL,
    ...(clientInformation ? { clientInformation } : {}),
    clientMetadata: {
      redirect_uris: REDIRECT_URIS,
      client_name: 'Meta Campaign Manager',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    },
    storage: new FileOAuthStorage(),
    onRedirectToAuthorization: openBrowser,
  });
}

export function createMetaAdsServerConfig() {
  const accessToken = process.env.META_ACCESS_TOKEN?.trim();

  if (!accessToken) {
    return {
      url: new URL(META_ADS_SERVER_URL),
      authProvider: createMetaOAuthProvider(),
      fetch: normalizeMetaAuthChallenge,
      connectTimeout: 120000,
    };
  }

  return {
    url: new URL(META_ADS_SERVER_URL),
    requestInit: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    connectTimeout: 120000,
  };
}

export async function normalizeMetaOAuthMetadata(url, response) {
  if (new URL(url).toString() !== META_AUTH_METADATA_URL || !response.ok) return response;

  const metadata = await response.clone().json().catch(() => undefined);
  if (
    !metadata ||
    metadata.issuer !== 'https://www.facebook.com' ||
    !metadata.authorization_endpoint?.startsWith('https://www.facebook.com/') ||
    !metadata.token_endpoint?.startsWith('https://graph.facebook.com/')
  ) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.delete('content-encoding');
  headers.delete('content-length');
  headers.set('content-type', 'application/json');

  return new Response(JSON.stringify({ ...metadata, issuer: META_ADS_SERVER_URL }), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function normalizeMetaAuthChallenge(url, init) {
  const originalResponse = await fetch(url, init);
  const response = await normalizeMetaOAuthMetadata(url, originalResponse);
  const authenticate = response.headers.get('www-authenticate');

  if (response.status === 400 && authenticate) {
    return new Response(response.body, {
      status: 401,
      statusText: 'Unauthorized',
      headers: response.headers,
    });
  }

  return response;
}
