import { ConfigService } from '@nestjs/config';

import { TokenCipherService } from './token-cipher.service';

describe('TokenCipherService', () => {
  const key = Buffer.alloc(32, 7).toString('base64');

  it('encrypts with an authenticated, non-deterministic envelope', () => {
    const service = new TokenCipherService({
      get: jest.fn().mockReturnValue(key),
    } as unknown as ConfigService);

    const first = service.encrypt('page-access-token');
    const second = service.encrypt('page-access-token');

    expect(first).not.toBe(second);
    expect(first).not.toContain('page-access-token');
    expect(service.decrypt(first)).toBe('page-access-token');
  });

  it('rejects a key that is not exactly 32 bytes', () => {
    const service = new TokenCipherService({
      get: jest.fn().mockReturnValue(Buffer.alloc(16).toString('base64')),
    } as unknown as ConfigService);

    expect(() => service.encrypt('token')).toThrow(
      'META_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes',
    );
  });
});
