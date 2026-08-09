/**
 * A tiny DER writer, for tests only.
 *
 * The chain-verification code in `crypto/jws.ts` is the difference between
 * "anyone can mint an unlock" and "only Apple can", so it has to be tested
 * against real certificates and real signatures rather than mocks. That means
 * being able to *build* a certificate chain in the test, which means being able
 * to write DER.
 *
 * Test-only. Never imported by the server.
 */

import { bytesToBase64Url } from '../crypto/jws';

// --- DER writing -----------------------------------------------------------

function length(n: number): number[] {
  if (n < 0x80) return [n];
  const bytes: number[] = [];
  let value = n;
  while (value > 0) {
    bytes.unshift(value & 0xff);
    value >>= 8;
  }
  return [0x80 | bytes.length, ...bytes];
}

function tlv(tag: number, content: Uint8Array): Uint8Array {
  const header = [tag, ...length(content.length)];
  const out = new Uint8Array(header.length + content.length);
  out.set(header, 0);
  out.set(content, header.length);
  return out;
}

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

const sequence = (...children: Uint8Array[]) => tlv(0x30, concat(...children));
const integer = (bytes: number[]) => tlv(0x02, new Uint8Array(bytes));
const utcTime = (value: string) => tlv(0x17, new TextEncoder().encode(value));
const emptyName = () => sequence();

/** OID 1.2.840.10045.4.3.2 — ecdsa-with-SHA256. */
const ECDSA_SHA256_OID = new Uint8Array([0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x04, 0x03, 0x02]);
const ecdsaSha256Algorithm = () => sequence(ECDSA_SHA256_OID);

/** Raw r||s from WebCrypto back to the DER SEQUENCE X.509 expects. */
function rawSignatureToDer(raw: Uint8Array): Uint8Array {
  const half = raw.length / 2;
  const encodePart = (bytes: Uint8Array): Uint8Array => {
    let start = 0;
    while (start < bytes.length - 1 && bytes[start] === 0) start++;
    let trimmed = bytes.subarray(start);
    // DER INTEGERs are signed, so a high bit needs a leading zero.
    if (trimmed[0] & 0x80) trimmed = concat(new Uint8Array([0]), trimmed);
    return tlv(0x02, trimmed);
  };
  return sequence(encodePart(raw.subarray(0, half)), encodePart(raw.subarray(half)));
}

// --- certificates ----------------------------------------------------------

export interface TestCert {
  readonly der: Uint8Array;
  readonly base64: string;
  readonly keys: CryptoKeyPair;
}

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

export async function generateEcKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
}

/**
 * Builds a certificate for `subject`, signed by `issuer`. Pass the same key
 * pair for both to get a self-signed root.
 */
export async function makeCertificate(
  subject: CryptoKeyPair,
  issuer: CryptoKeyPair,
  serial = 1,
): Promise<TestCert> {
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', subject.publicKey));

  const tbs = sequence(
    tlv(0xa0, integer([2])), // [0] EXPLICIT version v3
    integer([serial]),
    ecdsaSha256Algorithm(),
    emptyName(), // issuer — not read by the parser under test
    sequence(utcTime('260101000000Z'), utcTime('360101000000Z')),
    emptyName(), // subject
    spki,
  );

  const rawSignature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      issuer.privateKey,
      tbs as unknown as ArrayBufferView<ArrayBuffer>,
    ),
  );

  const der = sequence(
    tbs,
    ecdsaSha256Algorithm(),
    tlv(0x03, concat(new Uint8Array([0]), rawSignatureToDer(rawSignature))),
  );

  return { der, base64: toBase64(der), keys: subject };
}

// --- JWS -------------------------------------------------------------------

const encodeJson = (value: unknown) =>
  bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));

/** Signs a compact ES256 JWS with the given leaf key and x5c chain. */
export async function signEs256(
  payload: unknown,
  leaf: CryptoKeyPair,
  x5c: string[],
): Promise<string> {
  const body = `${encodeJson({ alg: 'ES256', x5c })}.${encodeJson(payload)}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      leaf.privateKey,
      new TextEncoder().encode(body) as unknown as ArrayBufferView<ArrayBuffer>,
    ),
  );
  return `${body}.${bytesToBase64Url(signature)}`;
}

/** Signs a compact RS256 JWS, the shape Apple's identity tokens take. */
export async function signRs256(
  payload: unknown,
  keys: CryptoKeyPair,
  kid: string,
): Promise<string> {
  const body = `${encodeJson({ alg: 'RS256', kid })}.${encodeJson(payload)}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      keys.privateKey,
      new TextEncoder().encode(body) as unknown as ArrayBufferView<ArrayBuffer>,
    ),
  );
  return `${body}.${bytesToBase64Url(signature)}`;
}

export async function generateRsaKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
}

export async function publicJwk(keys: CryptoKeyPair, kid: string): Promise<JsonWebKey & { kid: string }> {
  const jwk = await crypto.subtle.exportKey('jwk', keys.publicKey);
  return { ...jwk, kid, key_ops: ['verify'] } as JsonWebKey & { kid: string };
}
