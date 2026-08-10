import { isPublicIpAddress } from './url-safety';

describe('knowledge URL safety', () => {
  it.each([
    '127.0.0.1', '10.0.0.1', '100.64.0.1', '169.254.1.1', '172.16.0.1',
    '192.168.1.1', '198.18.0.1', '203.0.113.1', '::1', 'fc00::1', 'fe80::1', '2001:db8::1',
  ])('rejects non-public address %s', (address) => {
    expect(isPublicIpAddress(address)).toBe(false);
  });

  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])('allows public address %s', (address) => {
    expect(isPublicIpAddress(address)).toBe(true);
  });
});
