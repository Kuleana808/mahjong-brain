import { parseCertificate, derSignatureToRaw, CURVE_SIZE, hashForSignatureAlgorithm } from '../adapters/crypto/der';
import { base64ToBytes } from '../adapters/crypto/jws';
import { APPLE_ROOT_CA_G3_BASE64 } from '../certs/appleRootCaG3';
import { createPorts } from '../config';

async function main() {
  const c = parseCertificate(base64ToBytes(APPLE_ROOT_CA_G3_BASE64));
  const buf = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
  const key = await crypto.subtle.importKey('spki', buf(c.spki), { name: 'ECDSA', namedCurve: c.curve! }, false, ['verify']);
  const raw = derSignatureToRaw(c.signature, CURVE_SIZE[c.curve!]);
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: hashForSignatureAlgorithm(c.signatureAlgorithm) }, key, buf(raw), buf(c.tbs));
  console.log(`Apple Root CA G3: curve=${c.curve} sigAlg=${c.signatureAlgorithm} selfVerify=${ok}`);
  const { lines } = createPorts();
  console.log(lines.find((l) => l.startsWith('storekit')));
}
main();
