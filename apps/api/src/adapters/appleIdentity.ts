/**
 * Apple identity token verification — contract 3.
 *
 * Sign in with Apple hands the client an identity token. It is a JWS, and it is
 * worth precisely nothing until every one of these has been checked:
 *
 *   1. the signature verifies against the Apple public key named by `kid`,
 *   2. `iss` is `https://appleid.apple.com`,
 *   3. `aud` is our bundle id,
 *   4. it has not expired.
 *
 * Skipping (3) is the classic mistake: a token minted for *any other app* is a
 * perfectly valid Apple token, and accepting it lets anyone with an unrelated
 * app sign in as one of our users. Since the account carries the purchase
 * unlock, that is a paid-content bypass as well as an account takeover.
 *
 * There is no unverified path. The port either returns a verified subject or
 * throws.
 */

import type { AppleIdentityPort, VerifiedAppleIdentity } from '@nihi/core/contracts';

import { parseJws, verifyRs256 } from './crypto/jws';

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';

/** Apple rotates signing keys; a day is well inside their cadence. */
const JWKS_TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 4000;
/** Tolerance for clock skew between us and Apple. */
const CLOCK_SKEW_SECONDS = 60;

interface AppleJwk extends JsonWebKey {
  kid: string;
}

export interface AppleIdentityOptions {
  /** The app's bundle id. This is the `aud` claim, and it is required. */
  readonly bundleId: string;
  readonly jwksUrl?: string;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
}

export function createAppleIdentityPort(options: AppleIdentityOptions): AppleIdentityPort {
  if (!options.bundleId) {
    // Refusing to construct is deliberate: a verifier with no audience to check
    // against would accept tokens minted for other apps.
    throw new Error('createAppleIdentityPort: bundleId is required');
  }

  const doFetch = options.fetchImpl ?? fetch;
  const jwksUrl = options.jwksUrl ?? APPLE_JWKS_URL;
  const now = options.now ?? (() => Date.now());

  let cache: { keys: AppleJwk[]; fetchedAt: number } | null = null;

  async function keys(force = false): Promise<AppleJwk[]> {
    if (!force && cache && now() - cache.fetchedAt < JWKS_TTL_MS) return cache.keys;

    const response = await doFetch(jwksUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`Apple JWKS returned ${response.status}`);

    const body = (await response.json()) as { keys?: AppleJwk[] };
    if (!Array.isArray(body.keys) || body.keys.length === 0) {
      throw new Error('Apple JWKS response had no keys');
    }

    cache = { keys: body.keys, fetchedAt: now() };
    return body.keys;
  }

  return {
    async verifyIdentityToken(token: string): Promise<VerifiedAppleIdentity> {
      const jws = parseJws(token);

      const kid = jws.header.kid;
      if (typeof kid !== 'string') throw new Error('Identity token header has no kid');
      if (jws.header.alg !== 'RS256') {
        // Pinning the algorithm closes the "alg: none" and algorithm-confusion
        // families outright.
        throw new Error(`Unexpected identity token algorithm ${String(jws.header.alg)}`);
      }

      let jwk = (await keys()).find((k) => k.kid === kid);
      if (!jwk) {
        // Unknown kid usually means Apple rotated. Re-fetch once before failing.
        jwk = (await keys(true)).find((k) => k.kid === kid);
      }
      if (!jwk) throw new Error(`No Apple signing key matches kid ${kid}`);

      await verifyRs256(jws, jwk);

      const { iss, aud, sub, exp, email } = jws.payload as {
        iss?: string;
        aud?: string | string[];
        sub?: string;
        exp?: number;
        email?: string;
      };

      if (iss !== APPLE_ISSUER) throw new Error(`Unexpected issuer ${String(iss)}`);

      const audiences = Array.isArray(aud) ? aud : [aud];
      if (!audiences.includes(options.bundleId)) {
        throw new Error('Token audience is not this app');
      }

      if (typeof exp !== 'number' || exp + CLOCK_SKEW_SECONDS < Math.floor(now() / 1000)) {
        throw new Error('Token has expired');
      }

      if (typeof sub !== 'string' || sub.length === 0) throw new Error('Token has no subject');

      // The email may be a private relay address, may be absent on repeat
      // sign-ins, and is never an identifier. `sub` is the only stable key.
      return { subject: sub, email: typeof email === 'string' ? email : null };
    },
  };
}
