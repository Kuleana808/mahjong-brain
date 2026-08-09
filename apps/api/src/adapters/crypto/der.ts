/**
 * Just enough ASN.1/DER to verify an X.509 chain.
 *
 * StoreKit 2 signs transactions with a JWS whose header carries an `x5c`
 * certificate chain, and the only way to trust that signature is to walk the
 * chain up to Apple's root. Node's `crypto.X509Certificate` could do this, but
 * it does not exist in a Supabase Edge Function (Deno/workerd), and this code
 * has to run in both. WebCrypto does exist in both — it just cannot parse a
 * certificate, so the certificate parsing lives here.
 *
 * Deliberately minimal: this reads the four things a chain check needs and
 * refuses everything else. It is not a general ASN.1 library and must not grow
 * into one.
 */

export interface DerNode {
  readonly tag: number;
  /** Content bytes, excluding tag and length. */
  readonly content: Uint8Array;
  /** The whole element including its header — what a signature covers. */
  readonly full: Uint8Array;
  readonly end: number;
}

const TAG_SEQUENCE = 0x30;
const TAG_BIT_STRING = 0x03;
const TAG_INTEGER = 0x02;
const TAG_OID = 0x06;

/** Reads one TLV element starting at `offset`. */
export function readNode(bytes: Uint8Array, offset = 0): DerNode {
  if (offset + 2 > bytes.length) throw new Error('DER: truncated element');

  const tag = bytes[offset];
  let cursor = offset + 1;
  let length = bytes[cursor++];

  if (length & 0x80) {
    const lengthBytes = length & 0x7f;
    if (lengthBytes === 0 || lengthBytes > 4) throw new Error('DER: unsupported length');
    length = 0;
    for (let i = 0; i < lengthBytes; i++) length = (length << 8) | bytes[cursor++];
  }

  const end = cursor + length;
  if (end > bytes.length) throw new Error('DER: length runs past the buffer');

  return { tag, content: bytes.subarray(cursor, end), full: bytes.subarray(offset, end), end };
}

/** Reads every direct child of a constructed element. */
export function readChildren(node: DerNode): DerNode[] {
  const children: DerNode[] = [];
  let offset = 0;
  while (offset < node.content.length) {
    const child = readNode(node.content, offset);
    children.push(child);
    offset = child.end;
  }
  return children;
}

export interface Certificate {
  /** Exactly the bytes the issuer signed. */
  readonly tbs: Uint8Array;
  /** SubjectPublicKeyInfo, ready for crypto.subtle.importKey('spki', …). */
  readonly spki: Uint8Array;
  /** Raw signature bytes from the BIT STRING. */
  readonly signature: Uint8Array;
  /** OID of the algorithm the issuer used, dotted form. */
  readonly signatureAlgorithm: string;
  /** Named curve of the subject key, when it is an EC key. */
  readonly curve: 'P-256' | 'P-384' | null;
}

const OID = {
  ecPublicKey: '1.2.840.10045.2.1',
  prime256v1: '1.2.840.10045.3.1.7',
  secp384r1: '1.3.132.0.34',
  ecdsaWithSha256: '1.2.840.10045.4.3.2',
  ecdsaWithSha384: '1.2.840.10045.4.3.3',
} as const;

function decodeOid(content: Uint8Array): string {
  const parts: number[] = [Math.floor(content[0] / 40), content[0] % 40];
  let value = 0;
  for (let i = 1; i < content.length; i++) {
    value = (value << 7) | (content[i] & 0x7f);
    if ((content[i] & 0x80) === 0) {
      parts.push(value);
      value = 0;
    }
  }
  return parts.join('.');
}

/**
 * Parses a DER certificate.
 *
 * Certificate ::= SEQUENCE { tbsCertificate, signatureAlgorithm, signatureValue }
 * TBSCertificate ::= SEQUENCE { [0] version, serialNumber, signature, issuer,
 *                               validity, subject, subjectPublicKeyInfo, … }
 */
export function parseCertificate(der: Uint8Array): Certificate {
  const root = readNode(der);
  if (root.tag !== TAG_SEQUENCE) throw new Error('DER: certificate is not a SEQUENCE');

  const [tbsNode, algorithmNode, signatureNode] = readChildren(root);
  if (!tbsNode || !algorithmNode || !signatureNode) throw new Error('DER: malformed certificate');
  if (signatureNode.tag !== TAG_BIT_STRING) throw new Error('DER: signature is not a BIT STRING');

  const algorithmOid = readChildren(algorithmNode).find((c) => c.tag === TAG_OID);
  const tbsChildren = readChildren(tbsNode);

  // Skip the optional [0] EXPLICIT version wrapper, then count forward to the
  // SubjectPublicKeyInfo. Both layouts appear in Apple's chain.
  const hasVersion = tbsChildren[0]?.tag === 0xa0;
  const spkiNode = tbsChildren[hasVersion ? 6 : 5];
  if (!spkiNode || spkiNode.tag !== TAG_SEQUENCE) {
    throw new Error('DER: could not locate the subject public key');
  }

  const spkiAlgorithm = readChildren(spkiNode)[0];
  const spkiOids = spkiAlgorithm ? readChildren(spkiAlgorithm).filter((c) => c.tag === TAG_OID) : [];
  const keyType = spkiOids[0] ? decodeOid(spkiOids[0].content) : '';
  const curveOid = spkiOids[1] ? decodeOid(spkiOids[1].content) : '';

  let curve: Certificate['curve'] = null;
  if (keyType === OID.ecPublicKey) {
    if (curveOid === OID.prime256v1) curve = 'P-256';
    else if (curveOid === OID.secp384r1) curve = 'P-384';
    else throw new Error(`DER: unsupported EC curve ${curveOid}`);
  }

  return {
    tbs: tbsNode.full,
    spki: spkiNode.full,
    // A BIT STRING's first content byte is the count of unused trailing bits.
    signature: signatureNode.content.subarray(1),
    signatureAlgorithm: algorithmOid ? decodeOid(algorithmOid.content) : '',
    curve,
  };
}

/** Hash implied by an ECDSA signature-algorithm OID. */
export function hashForSignatureAlgorithm(oid: string): 'SHA-256' | 'SHA-384' {
  if (oid === OID.ecdsaWithSha256) return 'SHA-256';
  if (oid === OID.ecdsaWithSha384) return 'SHA-384';
  throw new Error(`Unsupported certificate signature algorithm ${oid}`);
}

/**
 * DER ECDSA signature (SEQUENCE of two INTEGERs) to the raw r||s WebCrypto
 * wants. The INTEGERs are signed, so they may carry a leading zero byte, and
 * they may be short — both have to be normalised to a fixed width.
 */
export function derSignatureToRaw(der: Uint8Array, size: number): Uint8Array {
  const seq = readNode(der);
  if (seq.tag !== TAG_SEQUENCE) throw new Error('DER: signature is not a SEQUENCE');

  const [r, s] = readChildren(seq);
  if (!r || !s || r.tag !== TAG_INTEGER || s.tag !== TAG_INTEGER) {
    throw new Error('DER: signature is not two INTEGERs');
  }

  const out = new Uint8Array(size * 2);
  for (const [index, part] of [r, s].entries()) {
    let bytes = part.content;
    while (bytes.length > 0 && bytes[0] === 0) bytes = bytes.subarray(1);
    if (bytes.length > size) throw new Error('DER: signature component too large');
    out.set(bytes, index * size + (size - bytes.length));
  }
  return out;
}

export const CURVE_SIZE: Record<NonNullable<Certificate['curve']>, number> = {
  'P-256': 32,
  'P-384': 48,
};
