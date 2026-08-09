/**
 * JWS verification on WebCrypto only.
 *
 * Two shapes matter here, and they trust their keys differently:
 *
 *   - Apple identity tokens (contract 3) are RS256 and name a key by `kid`,
 *     which is looked up in Apple's published JWKS.
 *   - StoreKit 2 signed transactions (contract 8) are ES256 and carry their own
 *     certificate chain in `x5c`, which is only trustworthy once it has been
 *     walked up to a root we already pinned.
 *
 * No dependencies, because this has to run unchanged in Node and in a Supabase
 * Edge Function.
 */

import {
  CURVE_SIZE,
  derSignatureToRaw,
  hashForSignatureAlgorithm,
  parseCertificate,
  type Certificate,
} from './der';

export function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export interface ParsedJws {
  readonly header: Record<string, unknown>;
  readonly payload: Record<string, unknown>;
  /** ASCII bytes of `header.payload` — exactly what the signature covers. */
  readonly signingInput: Uint8Array;
  readonly signature: Uint8Array;
}

export function parseJws(token: string): ParsedJws {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Not a compact JWS');

  const [headerPart, payloadPart, signaturePart] = parts;
  const decode = (part: string, what: string): Record<string, unknown> => {
    try {
      return JSON.parse(new TextDecoder().decode(base64UrlToBytes(part)));
    } catch {
      throw new Error(`JWS ${what} is not JSON`);
    }
  };

  return {
    header: decode(headerPart, 'header'),
    payload: decode(payloadPart, 'payload'),
    signingInput: new TextEncoder().encode(`${headerPart}.${payloadPart}`),
    signature: base64UrlToBytes(signaturePart),
  };
}

/** Verifies an RS256 JWS against a JWK. Throws on any failure. */
export async function verifyRs256(jws: ParsedJws, jwk: JsonWebKey): Promise<void> {
  const key = await crypto.subtle.importKey(
    'jwk',
    { ...jwk, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    toArrayBuffer(jws.signature),
    toArrayBuffer(jws.signingInput),
  );
  if (!valid) throw new Error('Signature does not verify');
}

/**
 * Verifies an ES256 JWS whose signing key is the leaf of an `x5c` chain, and
 * verifies that chain up to a pinned root.
 *
 * The chain check is the whole point. Without it, anybody can mint a
 * certificate, sign a transaction with it, ship the certificate in the header,
 * and the signature will verify perfectly against a key they chose.
 *
 * `trustedRootSpki` is Apple Root CA G3's SubjectPublicKeyInfo, DER-encoded.
 * The last certificate in the chain must present exactly that key.
 */
export async function verifyEs256WithChain(
  jws: ParsedJws,
  trustedRootSpki: Uint8Array,
): Promise<void> {
  const x5c = jws.header.x5c;
  if (!Array.isArray(x5c) || x5c.length < 2) {
    throw new Error('JWS header has no usable x5c chain');
  }

  const chain: Certificate[] = x5c.map((entry, index) => {
    if (typeof entry !== 'string') throw new Error(`x5c[${index}] is not a string`);
    return parseCertificate(base64ToBytes(entry));
  });

  // The root we were handed must be the root we already trust. Comparing the
  // public key rather than the whole certificate means a re-issued root with
  // the same key still validates, and a different key never does.
  const presentedRoot = chain[chain.length - 1];
  if (!bytesEqual(presentedRoot.spki, trustedRootSpki)) {
    throw new Error('x5c chain does not terminate at the trusted root');
  }

  // Each certificate must be signed by the next one up.
  for (let i = 0; i < chain.length - 1; i++) {
    await verifyCertificateSignature(chain[i], chain[i + 1]);
  }
  // The root is self-signed; check that too, so a truncated chain cannot pass.
  await verifyCertificateSignature(presentedRoot, presentedRoot);

  const leaf = chain[0];
  if (leaf.curve === null) throw new Error('Leaf certificate does not carry an EC key');

  const key = await crypto.subtle.importKey(
    'spki',
    toArrayBuffer(leaf.spki),
    { name: 'ECDSA', namedCurve: leaf.curve },
    false,
    ['verify'],
  );

  const valid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    toArrayBuffer(jws.signature),
    toArrayBuffer(jws.signingInput),
  );
  if (!valid) throw new Error('Signature does not verify against the leaf certificate');
}

async function verifyCertificateSignature(child: Certificate, issuer: Certificate): Promise<void> {
  if (issuer.curve === null) throw new Error('Issuer certificate does not carry an EC key');

  const hash = hashForSignatureAlgorithm(child.signatureAlgorithm);
  const key = await crypto.subtle.importKey(
    'spki',
    toArrayBuffer(issuer.spki),
    { name: 'ECDSA', namedCurve: issuer.curve },
    false,
    ['verify'],
  );

  const raw = derSignatureToRaw(child.signature, CURVE_SIZE[issuer.curve]);
  const valid = await crypto.subtle.verify(
    { name: 'ECDSA', hash },
    key,
    toArrayBuffer(raw),
    toArrayBuffer(child.tbs),
  );
  if (!valid) throw new Error('Certificate chain link does not verify');
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
