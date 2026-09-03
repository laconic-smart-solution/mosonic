import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'crypto';
import { RedNoteNotConfiguredError } from '../errors/rednote.errors';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

@Injectable()
export class RedNoteCookieCryptoService {
  constructor(private readonly config: ConfigService) {}

  private resolveKey(): Buffer {
    const raw = this.config
      .get<string>('REDNOTE_COOKIE_ENCRYPTION_KEY')
      ?.trim();
    if (!raw) {
      throw new RedNoteNotConfiguredError();
    }
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
      return Buffer.from(raw, 'hex');
    }
    try {
      const b64 = Buffer.from(raw, 'base64');
      if (b64.length === 32) return b64;
    } catch {
      // fall through to scrypt
    }
    return scryptSync(raw, 'mosonic-rednote-cookies', 32);
  }

  /** Returns base64(iv + tag + ciphertext). Never log the result. */
  encrypt(plaintext: string): string {
    const key = this.resolveKey();
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv(ALGO, key, iv);
    const enc = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]).toString('base64');
  }

  decrypt(payloadB64: string): string {
    const key = this.resolveKey();
    const buf = Buffer.from(payloadB64, 'base64');
    if (buf.length < IV_LEN + TAG_LEN + 1) {
      throw new Error('Invalid encrypted cookie payload');
    }
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const data = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString(
      'utf8',
    );
  }

  newCookiesRef(): string {
    return `rnck_${randomBytes(16).toString('hex')}`;
  }
}
