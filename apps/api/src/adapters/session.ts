/**
 * App session tokens.
 *
 * A compact JWS, HS256, signed with a server-side key. Small on purpose: the
 * only claim that matters is which account this is, and the only consumers are
 * contracts 4 and 9.
 *
 * Verification is constant-time via WebCrypto's `verify` — never a string
 * comparison of signatures — and the expiry is checked after the signature, not
 * before, so an unsigned token cannot reveal anything by how fast it is
 * rejected.
 */

import type { SessionPort } from '@nihi/core/contracts';

import { base64UrlToBytes, bytesToBase64Url, toArrayBuffer } from './crypto/jws';

const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 60; // 60 days; this is a game, not a bank.

export interface SessionOptions {
  /** At least 32 bytes of secret. Rotating it signs everyone out, which is fine. */
  readonly signingKey: string;
  readonly ttlSeconds?: number;
  readonly now?: () => number;
}

export function createSessionPort(options: SessionOptions): SessionPort {
  if (!options.signingKey || options.signingKey.length < 32) {
    throw new Error('createSessionPort: signingKey must be at least 32 characters');
  }

  const ttl = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const now = options.now ?? (() => Date.now());
  const encoder = new TextEncoder();

  const keyPromise = crypto.subtle.importKey(
    'raw',
    toArrayBuffer(encoder.encode(options.signingKey)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );

  const encode = (value: unknown) => bytesToBase64Url(encoder.encode(JSON.stringify(value)));

  return {
    async issue(accountId: string) {
      const issuedAt = Math.floor(now() / 1000);
      const expiresAt = issuedAt + ttl;

      const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
        sub: accountId,
        iat: issuedAt,
        exp: expiresAt,
      })}`;

      const signature = await crypto.subtle.sign(
        'HMAC',
        await keyPromise,
        encoder.encode(body),
      );

      return {
        token: `${body}.${bytesToBase64Url(new Uint8Array(signature))}`,
        expiresAt: new Date(expiresAt * 1000).toISOString(),
      };
    },

    async verify(token: string | null): Promise<string | null> {
      if (!token) return null;

      const parts = token.split('.');
      if (parts.length !== 3) return null;

      try {
        const valid = await crypto.subtle.verify(
          'HMAC',
          await keyPromise,
          toArrayBuffer(base64UrlToBytes(parts[2])),
          encoder.encode(`${parts[0]}.${parts[1]}`),
        );
        if (!valid) return null;

        const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[1]))) as {
          sub?: string;
          exp?: number;
        };

        if (typeof payload.exp !== 'number' || payload.exp * 1000 < now()) return null;
        if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null;

        return payload.sub;
      } catch {
        // A malformed token is an invalid token, not a server error.
        return null;
      }
    },
  };
}
