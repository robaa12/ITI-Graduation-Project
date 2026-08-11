import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

@Injectable()
export class TokenCipherService {
  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return this.readKey(false) !== null;
  }

  encrypt(value: string): string {
    const key = this.readKey(true)!;
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);

    return [
      'v1',
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }

  decrypt(value: string): string {
    const key = this.readKey(true)!;
    const [version, iv, tag, ciphertext] = value.split('.');
    if (version !== 'v1' || !iv || !tag || !ciphertext) {
      throw new Error('Stored social token has an unsupported format');
    }

    const decipher = createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(iv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  private readKey(required: boolean): Buffer | null {
    const raw = this.config.get<string>('meta.tokenEncryptionKey');
    if (!raw) {
      if (required) {
        throw new ServiceUnavailableException(
          'Meta connectors are not configured',
        );
      }
      return null;
    }

    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32) {
      if (required) {
        throw new ServiceUnavailableException(
          'META_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes',
        );
      }
      return null;
    }
    return key;
  }
}
