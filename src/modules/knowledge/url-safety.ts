import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/** Reject loopback, link-local, private, benchmark, documentation, and multicast ranges. */
export function isPublicIpAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const [a, b] = address.split('.').map(Number);
    return !(a === 0
      || a === 10
      || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 0 || b === 168))
      || (a === 198 && (b === 18 || b === 19 || b === 51))
      || (a === 203 && b === 0)
      || a >= 224);
  }
  if (family === 6) {
    const normalized = address.toLowerCase();
    return !(/^(?:::|::1|fc|fd|fe[89ab]|2001:db8:)/.test(normalized));
  }
  return false;
}

/**
 * Resolves every address before a crawler makes a request. Rejecting mixed
 * public/private DNS answers prevents common DNS-rebinding and SSRF bypasses.
 */
export async function assertPublicHostname(hostname: string): Promise<void> {
  const normalized = hostname.toLowerCase();
  if (normalized === 'localhost') throw new Error('localhost is not a public host');
  if (isIP(normalized)) {
    if (!isPublicIpAddress(normalized)) throw new Error('private network addresses are not allowed');
    return;
  }
  const addresses = await lookup(normalized, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicIpAddress(address))) {
    throw new Error('host does not resolve exclusively to public addresses');
  }
}
