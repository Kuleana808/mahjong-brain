// apps/api/src/adapters/crypto/der.ts
var TAG_SEQUENCE = 48;
var TAG_BIT_STRING = 3;
var TAG_INTEGER = 2;
var TAG_OID = 6;
function readNode(bytes, offset = 0) {
  if (offset + 2 > bytes.length) throw new Error("DER: truncated element");
  const tag = bytes[offset];
  let cursor = offset + 1;
  let length = bytes[cursor++];
  if (length & 128) {
    const lengthBytes = length & 127;
    if (lengthBytes === 0 || lengthBytes > 4) throw new Error("DER: unsupported length");
    length = 0;
    for (let i = 0; i < lengthBytes; i++) length = length << 8 | bytes[cursor++];
  }
  const end = cursor + length;
  if (end > bytes.length) throw new Error("DER: length runs past the buffer");
  return { tag, content: bytes.subarray(cursor, end), full: bytes.subarray(offset, end), end };
}
function readChildren(node) {
  const children = [];
  let offset = 0;
  while (offset < node.content.length) {
    const child = readNode(node.content, offset);
    children.push(child);
    offset = child.end;
  }
  return children;
}
var OID = {
  ecPublicKey: "1.2.840.10045.2.1",
  prime256v1: "1.2.840.10045.3.1.7",
  secp384r1: "1.3.132.0.34",
  ecdsaWithSha256: "1.2.840.10045.4.3.2",
  ecdsaWithSha384: "1.2.840.10045.4.3.3"
};
function decodeOid(content) {
  const parts = [Math.floor(content[0] / 40), content[0] % 40];
  let value = 0;
  for (let i = 1; i < content.length; i++) {
    value = value << 7 | content[i] & 127;
    if ((content[i] & 128) === 0) {
      parts.push(value);
      value = 0;
    }
  }
  return parts.join(".");
}
function parseCertificate(der) {
  const root = readNode(der);
  if (root.tag !== TAG_SEQUENCE) throw new Error("DER: certificate is not a SEQUENCE");
  const [tbsNode, algorithmNode, signatureNode] = readChildren(root);
  if (!tbsNode || !algorithmNode || !signatureNode) throw new Error("DER: malformed certificate");
  if (signatureNode.tag !== TAG_BIT_STRING) throw new Error("DER: signature is not a BIT STRING");
  const algorithmOid = readChildren(algorithmNode).find((c) => c.tag === TAG_OID);
  const tbsChildren = readChildren(tbsNode);
  const hasVersion = tbsChildren[0]?.tag === 160;
  const spkiNode = tbsChildren[hasVersion ? 6 : 5];
  if (!spkiNode || spkiNode.tag !== TAG_SEQUENCE) {
    throw new Error("DER: could not locate the subject public key");
  }
  const spkiAlgorithm = readChildren(spkiNode)[0];
  const spkiOids = spkiAlgorithm ? readChildren(spkiAlgorithm).filter((c) => c.tag === TAG_OID) : [];
  const keyType = spkiOids[0] ? decodeOid(spkiOids[0].content) : "";
  const curveOid = spkiOids[1] ? decodeOid(spkiOids[1].content) : "";
  let curve = null;
  if (keyType === OID.ecPublicKey) {
    if (curveOid === OID.prime256v1) curve = "P-256";
    else if (curveOid === OID.secp384r1) curve = "P-384";
    else throw new Error(`DER: unsupported EC curve ${curveOid}`);
  }
  return {
    tbs: tbsNode.full,
    spki: spkiNode.full,
    // A BIT STRING's first content byte is the count of unused trailing bits.
    signature: signatureNode.content.subarray(1),
    signatureAlgorithm: algorithmOid ? decodeOid(algorithmOid.content) : "",
    curve
  };
}
function hashForSignatureAlgorithm(oid) {
  if (oid === OID.ecdsaWithSha256) return "SHA-256";
  if (oid === OID.ecdsaWithSha384) return "SHA-384";
  throw new Error(`Unsupported certificate signature algorithm ${oid}`);
}
function derSignatureToRaw(der, size) {
  const seq = readNode(der);
  if (seq.tag !== TAG_SEQUENCE) throw new Error("DER: signature is not a SEQUENCE");
  const [r, s] = readChildren(seq);
  if (!r || !s || r.tag !== TAG_INTEGER || s.tag !== TAG_INTEGER) {
    throw new Error("DER: signature is not two INTEGERs");
  }
  const out = new Uint8Array(size * 2);
  for (const [index, part] of [r, s].entries()) {
    let bytes = part.content;
    while (bytes.length > 0 && bytes[0] === 0) bytes = bytes.subarray(1);
    if (bytes.length > size) throw new Error("DER: signature component too large");
    out.set(bytes, index * size + (size - bytes.length));
  }
  return out;
}
var CURVE_SIZE = {
  "P-256": 32,
  "P-384": 48
};

// apps/api/src/adapters/crypto/jws.ts
function base64UrlToBytes(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - padded.length % 4) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
function parseJws(token) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Not a compact JWS");
  const [headerPart, payloadPart, signaturePart] = parts;
  const decode = (part, what) => {
    try {
      return JSON.parse(new TextDecoder().decode(base64UrlToBytes(part)));
    } catch {
      throw new Error(`JWS ${what} is not JSON`);
    }
  };
  return {
    header: decode(headerPart, "header"),
    payload: decode(payloadPart, "payload"),
    signingInput: new TextEncoder().encode(`${headerPart}.${payloadPart}`),
    signature: base64UrlToBytes(signaturePart)
  };
}
async function verifyRs256(jws, jwk) {
  const key = await crypto.subtle.importKey(
    "jwk",
    { ...jwk, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    toArrayBuffer(jws.signature),
    toArrayBuffer(jws.signingInput)
  );
  if (!valid) throw new Error("Signature does not verify");
}
async function verifyEs256WithChain(jws, trustedRootSpki) {
  const x5c = jws.header.x5c;
  if (!Array.isArray(x5c) || x5c.length < 2) {
    throw new Error("JWS header has no usable x5c chain");
  }
  const chain = x5c.map((entry, index) => {
    if (typeof entry !== "string") throw new Error(`x5c[${index}] is not a string`);
    return parseCertificate(base64ToBytes(entry));
  });
  const presentedRoot = chain[chain.length - 1];
  if (!bytesEqual(presentedRoot.spki, trustedRootSpki)) {
    throw new Error("x5c chain does not terminate at the trusted root");
  }
  for (let i = 0; i < chain.length - 1; i++) {
    await verifyCertificateSignature(chain[i], chain[i + 1]);
  }
  await verifyCertificateSignature(presentedRoot, presentedRoot);
  const leaf = chain[0];
  if (leaf.curve === null) throw new Error("Leaf certificate does not carry an EC key");
  const key = await crypto.subtle.importKey(
    "spki",
    toArrayBuffer(leaf.spki),
    { name: "ECDSA", namedCurve: leaf.curve },
    false,
    ["verify"]
  );
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    toArrayBuffer(jws.signature),
    toArrayBuffer(jws.signingInput)
  );
  if (!valid) throw new Error("Signature does not verify against the leaf certificate");
}
async function verifyCertificateSignature(child, issuer) {
  if (issuer.curve === null) throw new Error("Issuer certificate does not carry an EC key");
  const hash = hashForSignatureAlgorithm(child.signatureAlgorithm);
  const key = await crypto.subtle.importKey(
    "spki",
    toArrayBuffer(issuer.spki),
    { name: "ECDSA", namedCurve: issuer.curve },
    false,
    ["verify"]
  );
  const raw = derSignatureToRaw(child.signature, CURVE_SIZE[issuer.curve]);
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash },
    key,
    toArrayBuffer(raw),
    toArrayBuffer(child.tbs)
  );
  if (!valid) throw new Error("Certificate chain link does not verify");
}
function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
function toArrayBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

// apps/api/src/adapters/appleIdentity.ts
var APPLE_ISSUER = "https://appleid.apple.com";
var APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";
var JWKS_TTL_MS = 24 * 60 * 60 * 1e3;
var FETCH_TIMEOUT_MS = 4e3;
var CLOCK_SKEW_SECONDS = 60;
function createAppleIdentityPort(options) {
  if (!options.bundleId) {
    throw new Error("createAppleIdentityPort: bundleId is required");
  }
  const doFetch = options.fetchImpl ?? fetch;
  const jwksUrl = options.jwksUrl ?? APPLE_JWKS_URL;
  const now = options.now ?? (() => Date.now());
  let cache = null;
  async function keys(force = false) {
    if (!force && cache && now() - cache.fetchedAt < JWKS_TTL_MS) return cache.keys;
    const response = await doFetch(jwksUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`Apple JWKS returned ${response.status}`);
    const body = await response.json();
    if (!Array.isArray(body.keys) || body.keys.length === 0) {
      throw new Error("Apple JWKS response had no keys");
    }
    cache = { keys: body.keys, fetchedAt: now() };
    return body.keys;
  }
  return {
    async verifyIdentityToken(token) {
      const jws = parseJws(token);
      const kid = jws.header.kid;
      if (typeof kid !== "string") throw new Error("Identity token header has no kid");
      if (jws.header.alg !== "RS256") {
        throw new Error(`Unexpected identity token algorithm ${String(jws.header.alg)}`);
      }
      let jwk = (await keys()).find((k) => k.kid === kid);
      if (!jwk) {
        jwk = (await keys(true)).find((k) => k.kid === kid);
      }
      if (!jwk) throw new Error(`No Apple signing key matches kid ${kid}`);
      await verifyRs256(jws, jwk);
      const { iss, aud, sub, exp, email } = jws.payload;
      if (iss !== APPLE_ISSUER) throw new Error(`Unexpected issuer ${String(iss)}`);
      const audiences = Array.isArray(aud) ? aud : [aud];
      if (!audiences.includes(options.bundleId)) {
        throw new Error("Token audience is not this app");
      }
      if (typeof exp !== "number" || exp + CLOCK_SKEW_SECONDS < Math.floor(now() / 1e3)) {
        throw new Error("Token has expired");
      }
      if (typeof sub !== "string" || sub.length === 0) throw new Error("Token has no subject");
      return { subject: sub, email: typeof email === "string" ? email : null };
    }
  };
}

// apps/api/src/adapters/session.ts
var DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 60;
function createSessionPort(options) {
  if (!options.signingKey || options.signingKey.length < 32) {
    throw new Error("createSessionPort: signingKey must be at least 32 characters");
  }
  const ttl = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const now = options.now ?? (() => Date.now());
  const encoder = new TextEncoder();
  const keyPromise = crypto.subtle.importKey(
    "raw",
    toArrayBuffer(encoder.encode(options.signingKey)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  const encode = (value) => bytesToBase64Url(encoder.encode(JSON.stringify(value)));
  return {
    async issue(accountId) {
      const issuedAt = Math.floor(now() / 1e3);
      const expiresAt = issuedAt + ttl;
      const body = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
        sub: accountId,
        iat: issuedAt,
        exp: expiresAt
      })}`;
      const signature = await crypto.subtle.sign(
        "HMAC",
        await keyPromise,
        encoder.encode(body)
      );
      return {
        token: `${body}.${bytesToBase64Url(new Uint8Array(signature))}`,
        expiresAt: new Date(expiresAt * 1e3).toISOString()
      };
    },
    async verify(token) {
      if (!token) return null;
      const parts = token.split(".");
      if (parts.length !== 3) return null;
      try {
        const valid = await crypto.subtle.verify(
          "HMAC",
          await keyPromise,
          toArrayBuffer(base64UrlToBytes(parts[2])),
          encoder.encode(`${parts[0]}.${parts[1]}`)
        );
        if (!valid) return null;
        const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[1])));
        if (typeof payload.exp !== "number" || payload.exp * 1e3 < now()) return null;
        if (typeof payload.sub !== "string" || payload.sub.length === 0) return null;
        return payload.sub;
      } catch {
        return null;
      }
    }
  };
}

// apps/api/src/adapters/storekit.ts
function createStoreKitPort(options) {
  if (!options.appleRootCaG3Base64) {
    throw new Error("createStoreKitPort: appleRootCaG3Base64 is required");
  }
  if (options.expectedProductIds.length === 0 || !options.expectedBundleId) {
    throw new Error("createStoreKitPort: expectedProductIds and expectedBundleId are required");
  }
  const rootSpki = parseCertificate(base64ToBytes(options.appleRootCaG3Base64)).spki;
  const now = options.now ?? (() => Date.now());
  return {
    async verifySignedTransaction(jwsString) {
      const jws = parseJws(jwsString);
      if (jws.header.alg !== "ES256") {
        throw new Error(`Unexpected transaction algorithm ${String(jws.header.alg)}`);
      }
      await verifyEs256WithChain(jws, rootSpki);
      const payload = jws.payload;
      if (payload.bundleId !== options.expectedBundleId) {
        throw new Error("Transaction is for a different app");
      }
      if (!payload.productId || !options.expectedProductIds.includes(payload.productId)) {
        throw new Error(`Transaction is for ${String(payload.productId)}, not an approved product`);
      }
      const transactionId = payload.transactionId;
      if (!transactionId) throw new Error("Transaction has no individual identifier");
      const originalTransactionId = payload.originalTransactionId ?? payload.transactionId;
      if (!originalTransactionId) throw new Error("Transaction has no identifier");
      const purchasedMs = payload.originalPurchaseDate ?? payload.purchaseDate;
      if (typeof purchasedMs !== "number") throw new Error("Transaction has no purchase date");
      if (purchasedMs > now() + 6e4) throw new Error("Transaction is dated in the future");
      return {
        productId: payload.productId,
        transactionId: String(transactionId),
        originalTransactionId: String(originalTransactionId),
        purchasedAt: new Date(purchasedMs).toISOString(),
        environment: payload.environment ?? "Production",
        // A revocation date is how a refund and a family-sharing removal both
        // arrive. Ignoring it means giving away what somebody was refunded for.
        revoked: typeof payload.revocationDate === "number"
      };
    }
  };
}

// apps/api/src/adapters/supabaseStore.ts
function consumableGrant(row) {
  return { accountId: row.account_id, transactionId: row.transaction_id, productId: row.product_id, kind: row.kind, quantity: row.quantity, purchasedAt: row.purchased_at, environment: row.environment, grantedAt: row.granted_at };
}
function createSupabaseStore(options) {
  if (!options.url || !options.serviceRoleKey) {
    throw new Error("createSupabaseStore: url and serviceRoleKey are required");
  }
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 5e3;
  const base = `${options.url.replace(/\/$/, "")}/rest/v1`;
  async function request(path, init = {}) {
    const response = await doFetch(`${base}${path}`, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        apikey: options.serviceRoleKey,
        authorization: `Bearer ${options.serviceRoleKey}`,
        "content-type": "application/json",
        ...init.headers
      }
    });
    if (!response.ok) {
      throw new Error(`Supabase ${init.method ?? "GET"} ${path} failed with ${response.status}`);
    }
    if (response.status === 204) return void 0;
    const body = await response.text();
    if (body.length === 0) return void 0;
    return JSON.parse(body);
  }
  const encode = encodeURIComponent;
  return {
    async findAccountByAppleSubject(subject) {
      const rows = await request(
        `/accounts?apple_subject=eq.${encode(subject)}&select=id,apple_subject,created_at&limit=1`
      );
      const row = rows[0];
      return row ? { accountId: row.id, appleSubject: row.apple_subject, createdAt: row.created_at } : null;
    },
    async createAccount(subject) {
      const rows = await request("/accounts", {
        method: "POST",
        headers: { prefer: "return=representation" },
        body: JSON.stringify({ apple_subject: subject })
      });
      const row = rows[0];
      if (!row) throw new Error("Supabase did not return the created account");
      return { accountId: row.id, appleSubject: row.apple_subject, createdAt: row.created_at };
    },
    async getSettings(accountId) {
      const rows = await request(
        `/settings?account_id=eq.${encode(accountId)}&select=settings,revision,updated_at&limit=1`
      );
      const row = rows[0];
      return row ? { settings: row.settings, revision: row.revision, updatedAt: row.updated_at } : null;
    },
    async putSettings(accountId, settings, revision) {
      const rows = await request("/settings", {
        method: "POST",
        headers: {
          prefer: "return=representation,resolution=merge-duplicates"
        },
        body: JSON.stringify({
          account_id: accountId,
          settings,
          revision,
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        })
      });
      const row = rows[0];
      if (!row) throw new Error("Supabase did not return the written settings");
      return { settings: row.settings, revision: row.revision, updatedAt: row.updated_at };
    },
    async getUnlock(accountId) {
      const rows = await request(
        `/unlocks?account_id=eq.${encode(accountId)}&select=*&limit=1`
      );
      const row = rows[0];
      return row ? {
        accountId: row.account_id,
        productId: row.product_id,
        originalTransactionId: row.original_transaction_id,
        purchasedAt: row.purchased_at,
        environment: row.environment,
        revoked: row.revoked,
        source: row.source,
        verifiedAt: row.verified_at
      } : null;
    },
    async putUnlock(record) {
      await request("/unlocks", {
        method: "POST",
        headers: { prefer: "resolution=merge-duplicates" },
        body: JSON.stringify({
          account_id: record.accountId,
          product_id: record.productId,
          original_transaction_id: record.originalTransactionId,
          purchased_at: record.purchasedAt,
          environment: record.environment,
          revoked: record.revoked,
          source: record.source,
          verified_at: record.verifiedAt
        })
      });
    },
    async recordSession(row) {
      await request("/session_analytics", {
        method: "POST",
        body: JSON.stringify(row)
      });
    },
    async recordEvents(rows) {
      if (rows.length === 0) return;
      await request("/events", { method: "POST", body: JSON.stringify(rows) });
    },
    async getDailyReward(accountId) {
      const rows = await request(
        `/daily_rewards?account_id=eq.${encode(accountId)}&select=last_claimed_on,streak_days&limit=1`
      );
      const row = rows[0];
      return row ? { lastClaimedOn: row.last_claimed_on, streakDays: row.streak_days } : null;
    },
    async putDailyReward(accountId, record) {
      await request("/daily_rewards", {
        method: "POST",
        headers: { prefer: "resolution=merge-duplicates" },
        body: JSON.stringify({
          account_id: accountId,
          last_claimed_on: record.lastClaimedOn,
          streak_days: record.streakDays
        })
      });
    },
    async getConsumableGrant(transactionId) {
      const rows = await request(
        `/consumable_grants?transaction_id=eq.${encode(transactionId)}&select=*&limit=1`
      );
      return rows[0] ? consumableGrant(rows[0]) : null;
    },
    async putConsumableGrant(record) {
      const rows = await request("/consumable_grants?on_conflict=transaction_id", {
        method: "POST",
        headers: { prefer: "resolution=ignore-duplicates,return=representation" },
        body: JSON.stringify({ account_id: record.accountId, transaction_id: record.transactionId, product_id: record.productId, kind: record.kind, quantity: record.quantity, purchased_at: record.purchasedAt, environment: record.environment, granted_at: record.grantedAt })
      });
      return rows.length === 1;
    }
  };
}

// apps/api/src/certs/appleRootCaG3.ts
var APPLE_ROOT_CA_G3_BASE64 = "MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtfTjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySrMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gAMGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM6BgD56KyKA==";

// apps/api/src/edgeConfig.ts
function createEdgePorts(readEnvironment) {
  const ports2 = {};
  const lines2 = [];
  const env = (key) => {
    const value = readEnvironment(key);
    return value && value.length > 0 ? value : void 0;
  };
  const supabaseUrl = env("SUPABASE_URL");
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (supabaseUrl && serviceRoleKey) {
    ports2.store = createSupabaseStore({ url: supabaseUrl, serviceRoleKey });
    lines2.push("store       supabase");
  } else {
    lines2.push("store       DISABLED \u2014 set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY");
  }
  const signingKey = env("SESSION_SIGNING_KEY");
  if (signingKey) {
    try {
      ports2.session = createSessionPort({ signingKey });
      lines2.push("session     hs256");
    } catch (cause) {
      lines2.push(`session     DISABLED \u2014 ${cause.message}`);
    }
  } else {
    lines2.push("session     DISABLED \u2014 set SESSION_SIGNING_KEY (32+ chars)");
  }
  const bundleId = env("APPLE_BUNDLE_ID");
  if (bundleId) {
    ports2.apple = createAppleIdentityPort({ bundleId });
    lines2.push(`apple       verifying aud=${bundleId}`);
  } else {
    lines2.push("apple       DISABLED \u2014 set APPLE_BUNDLE_ID");
  }
  const productIds = (env("IAP_PRODUCT_IDS") ?? env("IAP_PRODUCT_ID") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  if (productIds.length > 0 && bundleId) {
    try {
      ports2.storekit = createStoreKitPort({
        appleRootCaG3Base64: env("APPLE_ROOT_CA_G3_BASE64") ?? APPLE_ROOT_CA_G3_BASE64,
        expectedProductIds: productIds,
        expectedBundleId: bundleId
      });
      lines2.push(`storekit    verifying ${productIds.join(", ")}`);
    } catch (cause) {
      lines2.push(`storekit    DISABLED \u2014 ${cause.message}`);
    }
  } else {
    lines2.push("storekit    DISABLED \u2014 set APPLE_BUNDLE_ID + IAP_PRODUCT_IDS");
  }
  return { ports: ports2, lines: lines2 };
}

// packages/core/src/contracts/envelope.ts
var iso = (now) => now ?? (/* @__PURE__ */ new Date()).toISOString();
function ok(contract, version, data, options = {}) {
  return {
    contract,
    version,
    state: options.state ?? "live_verified",
    fallback_reason: options.fallbackReason ?? null,
    data,
    error: null,
    generated_at: iso(options.now)
  };
}
function fail(contract, version, error, options = {}) {
  return {
    contract,
    version,
    state: options.state ?? "source_available",
    fallback_reason: options.fallbackReason ?? null,
    data: null,
    error,
    generated_at: iso(options.now)
  };
}
function notConfigured(contract, version, missing, options = {}) {
  return {
    contract,
    version,
    state: "source_available",
    fallback_reason: `Not configured in this environment. Missing: ${missing.join(", ")}.`,
    data: null,
    error: {
      code: "not_configured",
      message: "This feature is not available yet."
    },
    generated_at: iso(options.now)
  };
}
function httpStatus(envelope) {
  if (!envelope.error) return 200;
  switch (envelope.error.code) {
    case "invalid_request":
    case "unknown_layout":
      return 400;
    case "unauthenticated":
      return 401;
    case "not_found":
      return 404;
    case "not_configured":
      return 503;
    default:
      return 500;
  }
}

// packages/core/src/contracts/ports.ts
var nowOf = (ports2) => (ports2.now ?? (() => (/* @__PURE__ */ new Date()).toISOString()))();

// packages/core/src/contracts/types.ts
var CONTRACT_VERSION = "1";

// packages/core/src/game/tiles.ts
function matchGroup(face) {
  if (face.suit === "flower" || face.suit === "season") return face.suit;
  return `${face.suit}-${face.rank}`;
}
function facesMatch(a, b) {
  return matchGroup(a) === matchGroup(b);
}
var WIND_NAMES = ["East", "South", "West", "North"];
var DRAGON_NAMES = ["Red", "Green", "White"];
var FLOWER_NAMES = ["Plum", "Orchid", "Chrysanthemum", "Bamboo"];
var SEASON_NAMES = ["Spring", "Summer", "Autumn", "Winter"];
function faceName(face) {
  switch (face.suit) {
    case "bamboo":
      return `${face.rank} of Bamboo`;
    case "character":
      return `${face.rank} of Characters`;
    case "circle":
      return `${face.rank} of Circles`;
    case "wind":
      return `${WIND_NAMES[face.rank - 1]} Wind`;
    case "dragon":
      return `${DRAGON_NAMES[face.rank - 1]} Dragon`;
    case "flower":
      return `${FLOWER_NAMES[face.rank - 1]} (Flower)`;
    case "season":
      return `${SEASON_NAMES[face.rank - 1]} (Season)`;
  }
}
function standardSet() {
  const faces = [];
  const push = (suit, rank, copies) => {
    for (let i = 0; i < copies; i++) faces.push({ suit, rank });
  };
  for (const suit of ["bamboo", "character", "circle"]) {
    for (let rank = 1; rank <= 9; rank++) push(suit, rank, 4);
  }
  for (let rank = 1; rank <= 4; rank++) push("wind", rank, 4);
  for (let rank = 1; rank <= 3; rank++) push("dragon", rank, 4);
  for (let rank = 1; rank <= 4; rank++) push("flower", rank, 1);
  for (let rank = 1; rank <= 4; rank++) push("season", rank, 1);
  return faces;
}
function facesForCount(count) {
  if (count % 2 !== 0) {
    throw new Error(`facesForCount: layout has an odd tile count (${count})`);
  }
  const standard = standardSet();
  if (count === standard.length) return standard;
  const pairable = standard.filter((f) => f.suit !== "flower" && f.suit !== "season");
  const faces = [];
  for (let i = 0; faces.length < count; i++) {
    const face = pairable[i * 2 % pairable.length];
    faces.push(face, face);
  }
  return faces.slice(0, count);
}

// packages/core/src/game/board.ts
function overlaps1D(a, b) {
  return a < b + 1 && b < a + 1;
}
function sameFootprintColumn(a, b) {
  return overlaps1D(a.x, b.x) && overlaps1D(a.y, b.y);
}
function isCovered(tile, others) {
  for (const other of others) {
    if (other === tile) continue;
    if (other.z > tile.z && sameFootprintColumn(tile, other)) return true;
  }
  return false;
}
function sideBlocked(tile, others, side) {
  for (const other of others) {
    if (other === tile) continue;
    if (other.z !== tile.z) continue;
    if (!overlaps1D(tile.y, other.y)) continue;
    if (side === "left" && other.x < tile.x && other.x > tile.x - 2) return true;
    if (side === "right" && other.x > tile.x && other.x < tile.x + 2) return true;
  }
  return false;
}
function isFree(tile, others) {
  if (isCovered(tile, others)) return false;
  return !sideBlocked(tile, others, "left") || !sideBlocked(tile, others, "right");
}
function remainingTiles(board) {
  return board.tiles.filter((t) => board.remaining.has(t.id));
}
function freeTiles(board) {
  const live = remainingTiles(board);
  return live.filter((t) => isFree(t, live));
}
function availableMoves(board) {
  const free = freeTiles(board);
  const moves = [];
  for (let i = 0; i < free.length; i++) {
    for (let j = i + 1; j < free.length; j++) {
      if (facesMatch(free[i].face, free[j].face)) moves.push([free[i], free[j]]);
    }
  }
  return moves;
}
function canPair(board, aId, bId) {
  if (aId === bId) return false;
  const live = remainingTiles(board);
  const a = live.find((t) => t.id === aId);
  const b = live.find((t) => t.id === bId);
  if (!a || !b) return false;
  if (!facesMatch(a.face, b.face)) return false;
  return isFree(a, live) && isFree(b, live);
}
function removePair(board, aId, bId) {
  if (!canPair(board, aId, bId)) return board;
  const remaining = new Set(board.remaining);
  remaining.delete(aId);
  remaining.delete(bId);
  return { ...board, remaining, removed: [...board.removed, [aId, bId]] };
}
function isComplete(board) {
  return board.remaining.size === 0;
}
function isStuck(board) {
  return board.remaining.size > 0 && availableMoves(board).length === 0;
}
function tilesFreedBy(board, ids) {
  const before = new Set(freeTiles(board).map((t) => t.id));
  const after = board.tiles.filter((t) => board.remaining.has(t.id) && !ids.includes(t.id));
  return after.filter((t) => !before.has(t.id) && isFree(t, after));
}

// packages/core/src/game/layouts.ts
var SPECS = [
  {
    // Lotus Terrace. The internal id remains `turtle` so saved games from the
    // prototype still restore, but the visible arrangement is original and has
    // no animal silhouette. Its 10-column footprint keeps phone tiles readable.
    id: "turtle",
    name: "Lotus Terrace",
    relativeDifficulty: 0.55,
    layers: [
      {
        offset: [1, 0],
        rows: [
          "..####..",
          ".######.",
          "########",
          "########",
          "########",
          "########",
          "########",
          ".######.",
          ".#####..",
          "..###..."
        ]
      },
      { offset: [1, 1.5], rows: [".######.", ".######.", "########", "########", "########", ".######.", "..####.."] },
      { offset: [1, 3], rows: ["..####..", "########", "########", "..####.."] },
      { offset: [3, 4], rows: ["####", "####"] },
      { offset: [3, 0.5], rows: ["#..#"] }
    ]
  },
  {
    // Garden Steps. An original, softly tapered arrangement for the first
    // board: broad readable edges, staggered shoulders, and a narrow raised
    // spine. It retains 144 tiles and the same 10 x 8 footprint as the former
    // rectangular pyramid, so phone tiles stay large without presenting a
    // visible uniform grid.
    id: "pyramid",
    name: "Garden Steps",
    relativeDifficulty: 0.3,
    layers: [
      {
        offset: [0, 0],
        rows: [
          "..######..",
          ".########.",
          "##########",
          "##########",
          "##########",
          "##########",
          ".########.",
          "..######.."
        ]
      },
      {
        offset: [0, 1],
        rows: [
          ".########.",
          "##########",
          "##########",
          "##########",
          "##########",
          ".########."
        ]
      },
      {
        offset: [2, 2],
        rows: [".####.", "######", "######", ".####."]
      }
    ]
  },
  {
    // Lantern Tower. The deep, narrow stack is harder without becoming tiny:
    // the challenge comes from five layers, not an 18-column phone footprint.
    id: "dragon",
    name: "Lantern Tower",
    relativeDifficulty: 0.85,
    layers: [
      {
        offset: [0, 0],
        rows: [
          "..######..",
          ".########.",
          "##########",
          "##########",
          ".########.",
          "..######.."
        ]
      },
      { offset: [0, 0], rows: ["..######..", ".########.", "##########", "##########", ".########.", "..######.."] },
      { offset: [1, 1], rows: ["########", "########", "########", "########"] },
      { offset: [2, 2], rows: ["######", "######"] },
      { offset: [4, 2], rows: ["##", "##"] }
    ]
  }
];
function buildLayout(spec) {
  const cells = [];
  spec.layers.forEach((layer, z) => {
    const [ox, oy] = layer.offset;
    layer.rows.forEach((row, ry) => {
      for (let rx = 0; rx < row.length; rx++) {
        if (row[rx] === "#") cells.push({ x: ox + rx, y: oy + ry, z });
      }
    });
  });
  for (const extra of spec.extras ?? []) cells.push(extra);
  if (cells.length % 2 !== 0) {
    throw new Error(`Layout "${spec.id}" has an odd cell count (${cells.length})`);
  }
  const bounds = cells.reduce(
    (acc, c) => ({
      minX: Math.min(acc.minX, c.x),
      minY: Math.min(acc.minY, c.y),
      maxX: Math.max(acc.maxX, c.x + 1),
      maxY: Math.max(acc.maxY, c.y + 1)
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  );
  return {
    id: spec.id,
    name: spec.name,
    relativeDifficulty: spec.relativeDifficulty,
    cells,
    bounds,
    maxZ: cells.reduce((m, c) => Math.max(m, c.z), 0)
  };
}
var LAYOUTS = Object.freeze(
  Object.fromEntries(SPECS.map((s) => [s.id, buildLayout(s)]))
);
var LAYOUT_IDS = SPECS.map((s) => s.id);
var LAYOUTS_BY_DIFFICULTY = Object.values(LAYOUTS).sort(
  (a, b) => a.relativeDifficulty - b.relativeDifficulty
);

// packages/core/src/game/rng.ts
function createRng(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = state + 1831565813 >>> 0;
    let t = state;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  const int = (n) => Math.floor(next() * n);
  return {
    seed,
    next,
    int,
    pick(items) {
      if (items.length === 0) throw new Error("rng.pick: empty array");
      return items[int(items.length)];
    },
    shuffle(items) {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(i + 1);
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    }
  };
}
function randomSeed() {
  return Math.random() * 4294967295 >>> 0;
}

// packages/core/src/game/deal.ts
var MAX_DEAL_ATTEMPTS = 40;
function pairUp(faces, rng) {
  const groups = /* @__PURE__ */ new Map();
  for (const face of faces) {
    const key = matchGroup(face);
    const group = groups.get(key);
    if (group) group.push(face);
    else groups.set(key, [face]);
  }
  const pairs = [];
  for (const group of groups.values()) {
    if (group.length % 2 !== 0) {
      throw new Error(`pairUp: match group "${matchGroup(group[0])}" has an odd count`);
    }
    for (let i = 0; i < group.length; i += 2) pairs.push([group[i], group[i + 1]]);
  }
  return rng.shuffle(pairs);
}
function tryBuild(cells, pairs, rng) {
  const remaining = cells.slice();
  const assigned = [];
  for (const pair of pairs) {
    const free = remaining.filter((c) => isFree(c, remaining));
    if (free.length < 2) return null;
    const sorted = free.slice().sort((a, b) => b.z - a.z);
    const window = sorted.slice(0, Math.max(2, Math.ceil(sorted.length * 0.6)));
    const shuffled = rng.shuffle(window);
    const [first, second] = shuffled;
    assigned.push({ cell: first, face: pair[0] }, { cell: second, face: pair[1] });
    for (const cell of [first, second]) {
      remaining.splice(remaining.indexOf(cell), 1);
    }
  }
  return remaining.length === 0 ? assigned : null;
}
function build(cells, faces, rng) {
  for (let attempt = 0; attempt < MAX_DEAL_ATTEMPTS; attempt++) {
    const assigned2 = tryBuild(cells, pairUp(faces, rng), rng);
    if (assigned2) return { assigned: assigned2, solvable: true };
  }
  const positions = rng.shuffle(cells);
  const pairs = pairUp(faces, rng);
  const assigned = [];
  pairs.forEach((pair, i) => {
    assigned.push({ cell: positions[i * 2], face: pair[0] });
    assigned.push({ cell: positions[i * 2 + 1], face: pair[1] });
  });
  return { assigned, solvable: false };
}
function deal(layoutId, seed) {
  const layout = LAYOUTS[layoutId];
  const rng = createRng(seed);
  const { assigned } = build(layout.cells, facesForCount(layout.cells.length), rng);
  const faceByCell = new Map(assigned.map((a) => [a.cell, a.face]));
  const tiles = layout.cells.map((cell, id) => ({
    ...cell,
    id,
    face: faceByCell.get(cell)
  }));
  return {
    layoutId,
    seed,
    tiles,
    remaining: new Set(tiles.map((t) => t.id)),
    removed: []
  };
}

// packages/core/src/contracts/handlers/game.ts
var GENERATE = "game/board/generate";
var VALIDATE = "game/board/validate-move";
function isLayoutId(value) {
  return typeof value === "string" && value in LAYOUTS;
}
function generateBoard(request, ports2 = {}) {
  const now = nowOf(ports2);
  if (!isLayoutId(request.layout)) {
    return fail(GENERATE, CONTRACT_VERSION, {
      code: "unknown_layout",
      message: `Unknown layout. Expected one of: ${Object.keys(LAYOUTS).join(", ")}.`,
      field: "layout"
    }, { now });
  }
  if (request.seed !== void 0 && !Number.isInteger(request.seed)) {
    return fail(GENERATE, CONTRACT_VERSION, {
      code: "invalid_request",
      message: "Seed must be an integer.",
      field: "seed"
    }, { now });
  }
  const seed = request.seed ?? (ports2.randomSeed ?? randomSeed)();
  const board = deal(request.layout, seed);
  return ok(
    GENERATE,
    CONTRACT_VERSION,
    {
      layout: request.layout,
      seed,
      tileCount: board.tiles.length,
      layerCount: LAYOUTS[request.layout].maxZ + 1,
      solvable: true,
      openingMoves: availableMoves(board).length,
      tiles: request.includeTiles ? board.tiles.map((t) => ({ id: t.id, x: t.x, y: t.y, z: t.z, face: t.face })) : null
    },
    { now }
  );
}
function replay(layout, seed, removed) {
  let board = deal(layout, seed);
  for (const pair of removed) {
    const next = removePair(board, pair[0], pair[1]);
    if (next === board) return null;
    board = next;
  }
  return board;
}
function validateMove(request, ports2 = {}) {
  const now = nowOf(ports2);
  if (!isLayoutId(request.layout)) {
    return fail(VALIDATE, CONTRACT_VERSION, {
      code: "unknown_layout",
      message: "Unknown layout.",
      field: "layout"
    }, { now });
  }
  if (!Number.isInteger(request.seed)) {
    return fail(VALIDATE, CONTRACT_VERSION, {
      code: "invalid_request",
      message: "Seed must be an integer.",
      field: "seed"
    }, { now });
  }
  if (!Array.isArray(request.move) || request.move.length !== 2) {
    return fail(VALIDATE, CONTRACT_VERSION, {
      code: "invalid_request",
      message: "A move is exactly two tile ids.",
      field: "move"
    }, { now });
  }
  const board = replay(request.layout, request.seed, request.removed ?? []);
  if (!board) {
    return ok(
      VALIDATE,
      CONTRACT_VERSION,
      {
        valid: false,
        reason: "replay_diverged",
        tilesRemaining: 0,
        movesRemaining: 0,
        boardComplete: false,
        boardStuck: false
      },
      { now }
    );
  }
  const [a, b] = request.move;
  const after = canPair(board, a, b) ? removePair(board, a, b) : board;
  const valid = after !== board;
  return ok(
    VALIDATE,
    CONTRACT_VERSION,
    {
      valid,
      reason: valid ? "ok" : rejectionReason(board, a, b),
      tilesRemaining: after.remaining.size,
      movesRemaining: availableMoves(after).length,
      boardComplete: isComplete(after),
      boardStuck: isStuck(after)
    },
    { now }
  );
}
function rejectionReason(board, a, b) {
  if (a === b) return "same_tile";
  if (!board.remaining.has(a) || !board.remaining.has(b)) return "already_removed";
  const live = board.tiles.filter((t) => board.remaining.has(t.id));
  const tileA = live.find((t) => t.id === a);
  const tileB = live.find((t) => t.id === b);
  if (!tileA || !tileB) return "already_removed";
  const free = new Set(freeTiles(board).map((t) => t.id));
  if (tileA.face.suit !== tileB.face.suit || tileA.face.rank !== tileB.face.rank) {
    const bothBonus = tileA.face.suit === "flower" && tileB.face.suit === "flower" || tileA.face.suit === "season" && tileB.face.suit === "season";
    if (!bothBonus) return "faces_do_not_match";
  }
  if (!free.has(a)) return "first_tile_blocked";
  return "second_tile_blocked";
}

// packages/core/src/contracts/handlers/auth.ts
var CONTRACT = "api/auth/apple-id";
async function authenticateWithApple(request, ports2 = {}) {
  const now = nowOf(ports2);
  if (typeof request.identityToken !== "string" || request.identityToken.split(".").length !== 3) {
    return fail(CONTRACT, CONTRACT_VERSION, {
      code: "invalid_request",
      message: "Expected an Apple identity token.",
      field: "identityToken"
    }, { now });
  }
  const missing = [];
  if (!ports2.apple) missing.push("APPLE_BUNDLE_ID (blocked on D-001, the final app name)");
  if (!ports2.store) missing.push("SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY");
  if (!ports2.session) missing.push("SESSION_SIGNING_KEY");
  if (missing.length > 0) return notConfigured(CONTRACT, CONTRACT_VERSION, missing, { now });
  let identity;
  try {
    identity = await ports2.apple.verifyIdentityToken(request.identityToken);
  } catch (cause) {
    return fail(CONTRACT, CONTRACT_VERSION, {
      code: "unauthenticated",
      message: "That sign-in could not be verified."
    }, {
      now,
      // The verifier is wired and it ran — this is a bad token, not a missing
      // deployment. Reporting `source_available` here would tell Codex the
      // endpoint is unbuilt when it is working exactly as intended.
      state: "configured",
      fallbackReason: `Apple identity token rejected: ${cause.message}`
    });
  }
  if (request.userIdentifier && request.userIdentifier !== identity.subject) {
    return fail(CONTRACT, CONTRACT_VERSION, {
      code: "unauthenticated",
      message: "That sign-in could not be verified."
    }, {
      now,
      state: "configured",
      fallbackReason: "userIdentifier did not match the token subject"
    });
  }
  const store = ports2.store;
  const existing = await store.findAccountByAppleSubject(identity.subject);
  const account = existing ?? await store.createAccount(identity.subject);
  const session = await ports2.session.issue(account.accountId);
  return ok(
    CONTRACT,
    CONTRACT_VERSION,
    {
      sessionToken: session.token,
      expiresAt: session.expiresAt,
      accountId: account.accountId,
      created: existing === null
    },
    { now, state: "configured" }
  );
}

// packages/core/src/contracts/handlers/settings.ts
var CONTRACT2 = "api/settings";
var DEFAULT_SYNCED_SETTINGS = {
  theme: "system",
  fontScale: 1,
  reduceMotion: false,
  dimBlocked: true,
  haptics: true,
  sounds: true,
  difficultyPreference: "auto"
};
var THEMES = /* @__PURE__ */ new Set(["calm", "calm-dark", "high-contrast", "system"]);
var DIFFICULTIES = /* @__PURE__ */ new Set(["auto", "gentle", "standard", "demanding"]);
function validate(patch) {
  if (patch.theme !== void 0 && !THEMES.has(patch.theme)) return "theme";
  if (patch.difficultyPreference !== void 0 && !DIFFICULTIES.has(patch.difficultyPreference)) {
    return "difficultyPreference";
  }
  if (patch.fontScale !== void 0) {
    if (typeof patch.fontScale !== "number" || patch.fontScale < 0.8 || patch.fontScale > 2) {
      return "fontScale";
    }
  }
  for (const key of ["reduceMotion", "dimBlocked", "haptics", "sounds"]) {
    if (patch[key] !== void 0 && typeof patch[key] !== "boolean") return key;
  }
  return null;
}
async function requireAccount(sessionToken, ports2) {
  const now = nowOf(ports2);
  const missing = [];
  if (!ports2.store) missing.push("SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY");
  if (!ports2.session) missing.push("SESSION_SIGNING_KEY");
  if (missing.length > 0) return notConfigured(CONTRACT2, CONTRACT_VERSION, missing, { now });
  const accountId = await ports2.session.verify(sessionToken);
  if (!accountId) {
    return fail(CONTRACT2, CONTRACT_VERSION, {
      code: "unauthenticated",
      message: "Sign in to sync your settings across devices."
    }, { now, state: "configured" });
  }
  return { accountId };
}
async function getSettings(sessionToken, ports2 = {}) {
  const now = nowOf(ports2);
  const gate2 = await requireAccount(sessionToken, ports2);
  if ("contract" in gate2) return gate2;
  const stored = await ports2.store.getSettings(gate2.accountId);
  if (!stored) {
    return ok(
      CONTRACT2,
      CONTRACT_VERSION,
      { settings: DEFAULT_SYNCED_SETTINGS, updatedAt: now, revision: 0 },
      { now, state: "configured" }
    );
  }
  return ok(
    CONTRACT2,
    CONTRACT_VERSION,
    { settings: stored.settings, updatedAt: stored.updatedAt, revision: stored.revision },
    { now, state: "configured" }
  );
}
async function patchSettings(sessionToken, patch, ports2 = {}) {
  const now = nowOf(ports2);
  const badField = validate(patch ?? {});
  if (badField) {
    return fail(CONTRACT2, CONTRACT_VERSION, {
      code: "invalid_request",
      message: `Not a valid value for ${badField}.`,
      field: badField
    }, { now });
  }
  const gate2 = await requireAccount(sessionToken, ports2);
  if ("contract" in gate2) return gate2;
  const stored = await ports2.store.getSettings(gate2.accountId);
  const current2 = stored?.settings ?? DEFAULT_SYNCED_SETTINGS;
  const revision = stored?.revision ?? 0;
  if (patch.ifRevision !== void 0 && patch.ifRevision !== revision) {
    return ok(
      CONTRACT2,
      CONTRACT_VERSION,
      { settings: current2, updatedAt: stored?.updatedAt ?? now, revision },
      {
        now,
        state: "configured",
        fallbackReason: `Stale revision ${patch.ifRevision}; another device wrote revision ${revision}. Nothing was changed.`
      }
    );
  }
  const { ifRevision: _ignored, ...changes } = patch ?? {};
  const written = await ports2.store.putSettings(
    gate2.accountId,
    { ...current2, ...changes },
    revision + 1
  );
  return ok(
    CONTRACT2,
    CONTRACT_VERSION,
    { settings: written.settings, updatedAt: written.updatedAt, revision: written.revision },
    { now, state: "configured" }
  );
}

// packages/core/src/ai/analysis.ts
function regionOf(tile, board) {
  const { minX, minY, maxX, maxY } = LAYOUTS[board.layoutId].bounds;
  const fx = (tile.x + 0.5 - minX) / (maxX - minX);
  const fy = (tile.y + 0.5 - minY) / (maxY - minY);
  const col = fx < 0.34 ? "left" : fx > 0.66 ? "right" : "centre";
  const row = fy < 0.34 ? "top" : fy > 0.66 ? "bottom" : "middle";
  if (row === "middle" && col === "centre") return "centre";
  if (row === "middle") return col;
  if (col === "centre") return row;
  return `${row}-${col}`;
}
function scoreMove(board, move) {
  const frees = tilesFreedBy(board, [move[0].id, move[1].id]).length;
  const depth = move[0].z + move[1].z;
  const group = matchGroup(move[0].face);
  const live = board.tiles.filter((t) => board.remaining.has(t.id));
  const siblings = live.filter((t) => matchGroup(t.face) === group).length;
  const buriedSiblings = siblings - 2;
  return frees * 3 + depth * 1.5 + (buriedSiblings > 0 ? 2 : 0);
}
function bestMove(board) {
  const moves = availableMoves(board);
  if (moves.length === 0) return null;
  return moves.reduce((best, move) => scoreMove(board, move) > scoreMove(board, best) ? move : best);
}
function analyse(board) {
  const moves = availableMoves(board);
  if (moves.length === 0) return null;
  const pair = bestMove(board);
  const [a, b] = pair;
  const regions = [.../* @__PURE__ */ new Set([regionOf(a, board), regionOf(b, board)])];
  const live = board.tiles.filter((t) => board.remaining.has(t.id));
  const group = matchGroup(a.face);
  const groupTiles = live.filter((t) => matchGroup(t.face) === group);
  const freeIds = new Set(freeTiles(board).map((t) => t.id));
  return {
    pair,
    faceLabel: faceName(a.face),
    regions,
    frees: tilesFreedBy(board, [a.id, b.id]),
    onlyMove: moves.length === 1,
    alternatives: moves.length - 1,
    quartetRisk: groupTiles.length >= 4 && groupTiles.filter((t) => freeIds.has(t.id)).length === 2,
    topLayer: Math.max(a.z, b.z) === Math.max(...live.map((t) => t.z)),
    tilesLeft: board.remaining.size
  };
}

// packages/core/src/ai/localExplainer.ts
var REGION_PHRASE = {
  "top-left": "the top-left corner",
  top: "along the top edge",
  "top-right": "the top-right corner",
  left: "the left side",
  centre: "the middle of the board",
  right: "the right side",
  "bottom-left": "the bottom-left corner",
  bottom: "along the bottom edge",
  "bottom-right": "the bottom-right corner"
};
function whereToLook(regions) {
  if (regions.length === 1) return REGION_PHRASE[regions[0]];
  return `${REGION_PHRASE[regions[0]]} and ${REGION_PHRASE[regions[1]]}`;
}
function countPhrase(n) {
  const words = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight"];
  return words[n] ?? String(n);
}
function explainLocally(analysis) {
  const parts = [];
  parts.push(`Look at ${whereToLook(analysis.regions)} \u2014 the two ${analysis.faceLabel} tiles there.`);
  const freed = analysis.frees.length;
  if (freed > 0) {
    const deeper = analysis.frees.filter((t) => t.z > 0).length;
    parts.push(
      deeper > 0 ? `Taking them releases ${countPhrase(freed)} more ${freed === 1 ? "tile" : "tiles"}, including ${countPhrase(deeper)} from the layer underneath.` : `Taking them opens up ${countPhrase(freed)} more ${freed === 1 ? "tile" : "tiles"} beside them.`
    );
  } else if (analysis.topLayer) {
    parts.push("Nothing is buried under them, so this one is free money \u2014 clear the top before it gets crowded.");
  } else {
    parts.push("They free nothing directly, but they clear a slot you will want later.");
  }
  if (analysis.onlyMove) {
    parts.push("It is the only pair on the board right now, so take it before anything else.");
  } else if (analysis.quartetRisk) {
    parts.push(
      `Worth doing now: two more ${analysis.faceLabel} tiles are still buried, and clearing these keeps that group from getting stranded.`
    );
  } else if (analysis.tilesLeft <= 12) {
    parts.push("Nearly there \u2014 from here, work the highest tiles first.");
  }
  return parts.join(" ");
}
function summariseLocally(analysis) {
  return `Two ${analysis.faceLabel} tiles, ${whereToLook(analysis.regions)}.`;
}

// packages/core/src/env.ts
var DEFAULTS = {
  ollamaHost: "http://localhost:11434",
  ollamaModel: "gemma3:4b",
  ollamaEnabled: true,
  debug: false
};
function readEnv() {
  const fromVite = (() => {
    try {
      return import.meta.env ?? {};
    } catch {
      return {};
    }
  })();
  const fromNode = (() => {
    try {
      const nodeProcess = globalThis.process;
      return nodeProcess?.env ?? {};
    } catch {
      return {};
    }
  })();
  return { ...fromNode, ...fromVite };
}
function fromEnvironment() {
  const env = readEnv();
  const pick = (...keys) => {
    for (const key of keys) {
      const value = env[key];
      if (value !== void 0 && value !== "") return value;
    }
    return void 0;
  };
  return {
    ollamaHost: pick("VITE_OLLAMA_HOST", "OLLAMA_HOST") ?? DEFAULTS.ollamaHost,
    ollamaModel: pick("VITE_OLLAMA_MODEL", "OLLAMA_MODEL") ?? DEFAULTS.ollamaModel,
    ollamaEnabled: pick("VITE_DISABLE_OLLAMA", "DISABLE_OLLAMA") !== "true",
    debug: pick("DEV", "NODE_ENV") === "development" || env.DEV === true.toString()
  };
}
var current = fromEnvironment();
function config() {
  return current;
}

// packages/core/src/ai/ollama.ts
var TIMEOUT_MS = 1500;
var PROBE_TIMEOUT_MS = 400;
var SYSTEM_PROMPT = [
  "You coach a calm mahjong solitaire game played mostly by people over 60.",
  "You are given a JSON description of one recommended move.",
  "Write 2 short sentences that TEACH the player to see the pattern themselves.",
  "Point at the area of the board first, then say what the move unlocks.",
  'Never list coordinates. Never say "the answer is". Never use exclamation marks.',
  "Plain, warm, unhurried English. No emoji. No markdown."
].join(" ");
var availability = null;
function ollamaAvailable() {
  if (availability) return availability;
  availability = (async () => {
    if (!config().ollamaEnabled) return false;
    try {
      const response = await fetch(`${config().ollamaHost}/api/tags`, {
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS)
      });
      return response.ok;
    } catch {
      return false;
    }
  })();
  return availability;
}
async function explainWithOllama(analysis) {
  const payload = {
    tiles: analysis.faceLabel,
    look_at: analysis.regions,
    unlocks: analysis.frees.length,
    unlocks_lower_layer: analysis.frees.some((t) => t.z > 0),
    is_only_move: analysis.onlyMove,
    other_moves_available: analysis.alternatives,
    group_could_get_stranded: analysis.quartetRisk,
    tiles_left: analysis.tilesLeft
  };
  try {
    const response = await fetch(`${config().ollamaHost}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        model: config().ollamaModel,
        system: SYSTEM_PROMPT,
        prompt: JSON.stringify(payload),
        stream: false,
        options: { temperature: 0.4, num_predict: 90 }
      })
    });
    if (!response.ok) return null;
    const data = await response.json();
    const text = data.response?.trim();
    if (!text || text.length < 20 || text.length > 320) return null;
    return text;
  } catch {
    return null;
  }
}

// packages/core/src/ai/router.ts
var LOG_LIMIT = 50;
var log = [];
function recordRoute(record) {
  log.push(record);
  if (log.length > LOG_LIMIT) log.shift();
  if (config().debug) {
    const suffix = record.fallbackFrom ? ` (fell back from ${record.fallbackFrom}: ${record.reason})` : "";
    console.info(`[hint] ${record.tier} in ${Math.round(record.latencyMs)}ms${suffix}`);
  }
}

// packages/core/src/ai/hintCoach.ts
async function getHint(board, options = {}) {
  const analysis = analyse(board);
  if (!analysis) return null;
  const started = performance.now();
  const offline = (tier, fallbackFrom, reason) => {
    recordRoute({ tier, latencyMs: performance.now() - started, fallbackFrom, reason });
    return {
      pair: analysis.pair,
      text: explainLocally(analysis),
      summary: summariseLocally(analysis),
      tier
    };
  };
  if (!options.allowModelPhrasing) return offline("offline");
  if (!await ollamaAvailable()) {
    return offline("offline", "ollama", "not reachable");
  }
  const text = await explainWithOllama(analysis);
  if (!text) return offline("offline", "ollama", "timed out or rejected");
  recordRoute({ tier: "ollama", latencyMs: performance.now() - started });
  return { pair: analysis.pair, text, summary: summariseLocally(analysis), tier: "ollama" };
}

// packages/core/src/contracts/handlers/hints.ts
var CONTRACT3 = "api/hints/generate";
function replay2(layout, seed, removed) {
  let board = deal(layout, seed);
  for (const pair of removed ?? []) {
    const next = removePair(board, pair[0], pair[1]);
    if (next === board) return null;
    board = next;
  }
  return board;
}
async function generateHint(request, ports2 = {}) {
  const now = nowOf(ports2);
  if (!(request.layout in LAYOUTS)) {
    return fail(CONTRACT3, CONTRACT_VERSION, {
      code: "unknown_layout",
      message: "Unknown layout.",
      field: "layout"
    }, { now });
  }
  const board = replay2(request.layout, request.seed, request.removed);
  if (!board) {
    return fail(CONTRACT3, CONTRACT_VERSION, {
      code: "invalid_request",
      message: "That sequence of moves could not have happened on this board.",
      field: "removed"
    }, { now });
  }
  const started = Date.now();
  const hint = await getHint(board, { allowModelPhrasing: request.allowModelPhrasing });
  const latencyMs = Date.now() - started;
  if (!hint) {
    return fail(CONTRACT3, CONTRACT_VERSION, {
      code: "no_moves",
      message: "There are no pairs left to take."
    }, { now, state: "live_verified" });
  }
  const degraded = request.allowModelPhrasing && hint.tier === "offline" ? "Ollama unavailable or over its latency budget; answered with the offline explainer. Recommendation is unchanged." : null;
  return ok(
    CONTRACT3,
    CONTRACT_VERSION,
    {
      pair: [hint.pair[0].id, hint.pair[1].id],
      text: hint.text,
      summary: hint.summary,
      tier: hint.tier,
      latencyMs
    },
    { now, fallbackReason: degraded }
  );
}

// packages/core/src/game/difficulty.ts
var INITIAL_PROFILE = {
  secondsPerMove: null,
  hintRate: 0,
  completionRate: 0.5,
  boardsPlayed: 0,
  boardsCompleted: 0,
  lastLayoutId: null
};
var ALPHA = 0.3;
var ewma = (previous, sample) => previous === null ? sample : previous * (1 - ALPHA) + sample * ALPHA;
function recordOutcome(profile, outcome) {
  const meaningful = outcome.movesPlayed >= 5;
  return {
    secondsPerMove: meaningful ? ewma(profile.secondsPerMove, outcome.elapsedSeconds / outcome.movesPlayed) : profile.secondsPerMove,
    hintRate: meaningful ? ewma(profile.hintRate, outcome.hintsUsed / outcome.movesPlayed) : profile.hintRate,
    completionRate: meaningful ? ewma(profile.completionRate, outcome.completed ? 1 : 0) : profile.completionRate,
    boardsPlayed: profile.boardsPlayed + 1,
    boardsCompleted: profile.boardsCompleted + (outcome.completed ? 1 : 0),
    lastLayoutId: outcome.layoutId
  };
}
function skillScore(profile) {
  if (profile.secondsPerMove === null) return 0.25;
  const pace = clamp01((12 - profile.secondsPerMove) / 9);
  const independence = clamp01(1 - profile.hintRate * 5);
  const finishing = clamp01(profile.completionRate);
  return clamp01(pace * 0.4 + independence * 0.3 + finishing * 0.3);
}
var clamp01 = (n) => Math.min(1, Math.max(0, n));
function chooseLayout(profile) {
  const score = skillScore(profile);
  const ladder = LAYOUTS_BY_DIFFICULTY;
  const target = ladder[Math.min(ladder.length - 1, Math.floor(score * ladder.length))];
  if (profile.lastLayoutId === null) return ladder[0].id;
  const currentIndex = ladder.findIndex((l) => l.id === profile.lastLayoutId);
  const targetIndex = ladder.findIndex((l) => l.id === target.id);
  if (currentIndex === -1 || currentIndex === targetIndex) return target.id;
  const MARGIN = 0.08;
  const distanceIntoBand = Math.abs(score - ladder[currentIndex].relativeDifficulty);
  if (distanceIntoBand < MARGIN) return profile.lastLayoutId;
  const step = targetIndex > currentIndex ? 1 : -1;
  return ladder[currentIndex + step].id;
}

// packages/core/src/contracts/handlers/difficulty.ts
var LOG = "api/play-pattern/log";
var NEXT = "api/difficulty/next-board";
var MEANINGFUL_MOVES = 5;
function toProfile(wire) {
  if (!wire) return INITIAL_PROFILE;
  return {
    secondsPerMove: wire.secondsPerMove ?? null,
    hintRate: wire.hintRate ?? 0,
    completionRate: wire.completionRate ?? 0.5,
    boardsPlayed: wire.boardsPlayed ?? 0,
    boardsCompleted: wire.boardsCompleted ?? 0,
    lastLayoutId: wire.lastLayoutId ?? null
  };
}
var toWire = (profile) => ({
  secondsPerMove: profile.secondsPerMove,
  hintRate: profile.hintRate,
  completionRate: profile.completionRate,
  boardsPlayed: profile.boardsPlayed,
  boardsCompleted: profile.boardsCompleted,
  lastLayoutId: profile.lastLayoutId
});
function logPlayPattern(request, ports2 = {}) {
  const now = nowOf(ports2);
  if (!(request.layout in LAYOUTS)) {
    return fail(LOG, CONTRACT_VERSION, {
      code: "unknown_layout",
      message: "Unknown layout.",
      field: "layout"
    }, { now });
  }
  if (!Number.isFinite(request.movesPlayed) || request.movesPlayed < 0) {
    return fail(LOG, CONTRACT_VERSION, {
      code: "invalid_request",
      message: "movesPlayed must be a non-negative number.",
      field: "movesPlayed"
    }, { now });
  }
  const before = toProfile(request.profile);
  const after = recordOutcome(before, {
    layoutId: request.layout,
    completed: Boolean(request.completed),
    movesPlayed: request.movesPlayed,
    hintsUsed: Math.max(0, request.hintsUsed ?? 0),
    elapsedSeconds: Math.max(0, request.elapsedSeconds ?? 0)
  });
  const ignored = request.movesPlayed < MEANINGFUL_MOVES ? "Board ended before it could say anything about skill; counted as played but excluded from the averages." : null;
  return ok(
    LOG,
    CONTRACT_VERSION,
    {
      profile: toWire(after),
      skillScore: skillScore(after),
      accepted: true,
      ignoredReason: ignored
    },
    { now }
  );
}
function nextBoard(request, ports2 = {}) {
  const now = nowOf(ports2);
  const profile = toProfile(request.profile);
  const layout = chooseLayout(profile);
  const score = skillScore(profile);
  const seed = (ports2.randomSeed ?? randomSeed)();
  return ok(
    NEXT,
    CONTRACT_VERSION,
    {
      layout,
      seed,
      tileCount: deal(layout, seed).tiles.length,
      // Debug only. Never rendered — see the note at the top of this file.
      rationale: profile.secondsPerMove === null ? "No history yet, so the gentlest layout." : `skill ${score.toFixed(2)} from ${profile.secondsPerMove.toFixed(1)}s per move and a ${(profile.hintRate * 100).toFixed(0)}% hint rate over ${profile.boardsPlayed} boards.`,
      skillScore: score
    },
    { now }
  );
}

// packages/core/src/contracts/handlers/purchases.ts
var VALIDATE2 = "api/receipts/validate";
var STATUS = "api/unlock-status";
async function validateReceipt(request, sessionToken, ports2 = {}) {
  const now = nowOf(ports2);
  if (typeof request.signedTransaction !== "string" || request.signedTransaction.split(".").length !== 3) {
    return fail(VALIDATE2, CONTRACT_VERSION, {
      code: "invalid_request",
      message: "Expected a StoreKit 2 signed transaction.",
      field: "signedTransaction"
    }, { now });
  }
  const missing = [];
  if (!ports2.storekit) {
    missing.push("APPLE_ROOT_CA_G3_BASE64 + IAP_PRODUCT_ID + APPLE_BUNDLE_ID (blocked on D-005)");
  }
  if (!ports2.store) missing.push("SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY");
  if (sessionToken && !ports2.session) missing.push("SESSION_SIGNING_KEY");
  if (missing.length > 0) {
    return notConfigured(VALIDATE2, CONTRACT_VERSION, missing, { now });
  }
  let accountId = null;
  if (sessionToken) {
    accountId = await ports2.session.verify(sessionToken);
    if (!accountId) {
      return fail(VALIDATE2, CONTRACT_VERSION, {
        code: "invalid_session",
        message: "Sign in again before syncing this purchase."
      }, { now, state: "configured" });
    }
  }
  let verified;
  try {
    verified = await ports2.storekit.verifySignedTransaction(request.signedTransaction);
  } catch (cause) {
    return fail(VALIDATE2, CONTRACT_VERSION, {
      code: "unverified_transaction",
      message: "That purchase could not be verified. Try Restore Purchases."
    }, {
      now,
      // Verifier present and running; this transaction failed it.
      state: "configured",
      fallbackReason: `StoreKit transaction rejected: ${cause.message}`
    });
  }
  const unlocked = !verified.revoked;
  if (accountId && ports2.store) {
    await ports2.store.putUnlock({
      accountId,
      productId: verified.productId,
      originalTransactionId: verified.originalTransactionId,
      purchasedAt: verified.purchasedAt,
      environment: verified.environment,
      revoked: verified.revoked,
      source: "verified_transaction",
      verifiedAt: now
    });
  }
  return ok(
    VALIDATE2,
    CONTRACT_VERSION,
    {
      unlocked,
      productId: verified.productId,
      originalTransactionId: verified.originalTransactionId,
      purchasedAt: verified.purchasedAt,
      environment: verified.environment,
      revoked: verified.revoked
    },
    {
      now,
      state: "configured",
      fallbackReason: verified.revoked ? "Transaction verified but revoked (refund or family-sharing removal); the unlock does not apply." : null
    }
  );
}
async function unlockStatus(sessionToken, ports2 = {}) {
  const now = nowOf(ports2);
  const missing = [];
  if (!ports2.store) missing.push("SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY");
  if (!ports2.session) missing.push("SESSION_SIGNING_KEY");
  if (missing.length > 0) {
    return ok(
      STATUS,
      CONTRACT_VERSION,
      { unlocked: false, source: "none", productId: null, verifiedAt: null },
      {
        now,
        state: "source_available",
        fallbackReason: `Server-side unlock lookup not configured (${missing.join(", ")}). The device's StoreKit entitlement remains authoritative.`
      }
    );
  }
  const accountId = await ports2.session.verify(sessionToken);
  if (!accountId) {
    return ok(
      STATUS,
      CONTRACT_VERSION,
      { unlocked: false, source: "none", productId: null, verifiedAt: null },
      {
        now,
        state: "configured",
        fallbackReason: "Not signed in; no cross-device unlock to report."
      }
    );
  }
  const record = await ports2.store.getUnlock(accountId);
  if (!record || record.revoked) {
    return ok(
      STATUS,
      CONTRACT_VERSION,
      { unlocked: false, source: "none", productId: null, verifiedAt: null },
      {
        now,
        state: "configured",
        fallbackReason: record?.revoked ? "Purchase was refunded or revoked." : null
      }
    );
  }
  return ok(
    STATUS,
    CONTRACT_VERSION,
    {
      unlocked: true,
      source: record.source,
      productId: record.productId,
      verifiedAt: record.verifiedAt
    },
    { now, state: "configured" }
  );
}

// packages/core/src/contracts/handlers/analytics.ts
var CONTRACT4 = "api/analytics/session";
var ALLOWED_FIELDS = [
  "boardsStarted",
  "boardsCompleted",
  "hintsUsed",
  "totalSeconds",
  "appVersion",
  "anonymousSessionId"
];
async function recordSessionAnalytics(request, ports2 = {}) {
  const now = nowOf(ports2);
  if (request?.consent !== true) {
    return ok(
      CONTRACT4,
      CONTRACT_VERSION,
      { stored: false, reason: "No consent on this request; the body was discarded." },
      { now, state: "live_verified" }
    );
  }
  if (typeof request.anonymousSessionId !== "string" || request.anonymousSessionId.length < 8) {
    return fail(CONTRACT4, CONTRACT_VERSION, {
      code: "invalid_request",
      message: "A rotating anonymous session id is required.",
      field: "anonymousSessionId"
    }, { now });
  }
  if (!ports2.store) {
    return notConfigured(
      CONTRACT4,
      CONTRACT_VERSION,
      ["SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY"],
      { now }
    );
  }
  const COLUMNS = {
    boardsStarted: "boards_started",
    boardsCompleted: "boards_completed",
    hintsUsed: "hints_used",
    totalSeconds: "total_seconds",
    appVersion: "app_version",
    anonymousSessionId: "anonymous_session_id"
  };
  const row = { recorded_at: now };
  for (const field of ALLOWED_FIELDS) row[COLUMNS[field]] = request[field];
  await ports2.store.recordSession(row);
  return ok(
    CONTRACT4,
    CONTRACT_VERSION,
    { stored: true, reason: null },
    { now, state: "configured" }
  );
}

// packages/core/src/telemetry/events.ts
var EVENT_SCHEMA_VERSION = 1;
var EVENT_NAMES = [
  // Does the app open, and does anyone come back?
  "app_open",
  "app_background",
  "session_start",
  "session_end",
  // Does onboarding land? Every screen, so a drop-off has a location.
  "tos_shown",
  "age_gate_shown",
  "age_gate_passed",
  "age_gate_failed",
  "tos_accepted",
  "loading_quote_shown",
  "tutorial_step_shown",
  "tutorial_step_completed",
  "tutorial_first_pair_cleared",
  "tutorial_completed",
  "tutorial_skipped",
  // Does the core loop work?
  "board_start",
  "tile_tap",
  "tile_tap_rejected",
  "pair_cleared",
  "holder_slot_filled",
  "holder_full",
  "board_won",
  "board_abandoned",
  // Do the revenue hooks get seen, tapped, and completed?
  "revive_offered",
  "revive_tapped",
  "revive_ad_started",
  "revive_ad_completed",
  "revive_ad_abandoned",
  "revive_granted",
  "hint_tapped",
  "hint_ad_started",
  "hint_ad_completed",
  "hint_ad_abandoned",
  "hint_shown",
  "shuffle_tapped",
  "shuffle_iap_shown",
  "shuffle_iap_purchased",
  "shuffle_iap_cancelled",
  "shuffle_granted",
  "store_shown",
  "iap_purchase_started",
  "iap_purchase_completed",
  "iap_purchase_failed",
  "iap_restore_tapped",
  // Do the retention loops fire?
  "daily_reward_shown",
  "daily_reward_claimed",
  "streak_advanced",
  "streak_broken",
  "notification_permission_shown",
  "notification_permission_granted",
  "notification_permission_denied",
  // Settings, so an accessibility change is visible in the data.
  "settings_opened",
  "setting_changed",
  // Progression surfaces. Level is a ratchet, IQ is an estimate — see
  // progression/progression.ts for why they are separate numbers.
  "level_up",
  "iq_changed",
  "home_shown",
  "game_over_shown"
];
var NAMES = new Set(EVENT_NAMES);
var MAX_EVENTS_PER_BATCH = 500;
function validateBatch(batch) {
  const accepted = [];
  const rejected = [];
  batch.events.forEach((event, index) => {
    if (!event || typeof event !== "object") {
      rejected.push({ index, reason: "not an object" });
      return;
    }
    if (!NAMES.has(event.name)) {
      rejected.push({ index, reason: `unknown event name "${String(event.name)}"` });
      return;
    }
    if (typeof event.at !== "string" || Number.isNaN(Date.parse(event.at))) {
      rejected.push({ index, reason: "at is not an ISO timestamp" });
      return;
    }
    if (!Number.isInteger(event.sequence) || event.sequence < 0) {
      rejected.push({ index, reason: "sequence is not a non-negative integer" });
      return;
    }
    accepted.push(event);
  });
  return { accepted, rejected };
}
var ALLOWED_PROPERTIES = [
  "layout",
  "seed",
  "step",
  "holderCount",
  "tilesRemaining",
  "cleared",
  "elapsedMs",
  "productId",
  "placement",
  "reason",
  "settingKey",
  "streakDays",
  "level",
  "iq",
  "screen"
];
function sanitiseProperties(properties) {
  if (!properties || typeof properties !== "object") return {};
  const source = properties;
  const out = {};
  for (const key of ALLOWED_PROPERTIES) {
    if (source[key] !== void 0) out[key] = source[key];
  }
  return out;
}

// packages/core/src/contracts/handlers/telemetry.ts
var CONTRACT5 = "api/events/batch";
async function ingestEvents(batch, ports2 = {}) {
  const now = nowOf(ports2);
  if (!batch || !Array.isArray(batch.events)) {
    return fail(CONTRACT5, CONTRACT_VERSION, {
      code: "invalid_request",
      message: "A batch needs an events array.",
      field: "events"
    }, { now });
  }
  if (typeof batch.anonymousDeviceId !== "string" || batch.anonymousDeviceId.length < 8) {
    return fail(CONTRACT5, CONTRACT_VERSION, {
      code: "invalid_request",
      message: "A rotating anonymous device id is required.",
      field: "anonymousDeviceId"
    }, { now });
  }
  if (batch.events.length > MAX_EVENTS_PER_BATCH) {
    return fail(CONTRACT5, CONTRACT_VERSION, {
      code: "invalid_request",
      message: `A batch holds at most ${MAX_EVENTS_PER_BATCH} events. Send several.`,
      field: "events"
    }, { now });
  }
  const { accepted, rejected } = validateBatch(batch);
  if (!ports2.store) {
    return notConfigured(CONTRACT5, CONTRACT_VERSION, ["SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY"], {
      now
    });
  }
  if (accepted.length > 0) {
    await ports2.store.recordEvents(
      accepted.map((event) => ({
        schema_version: EVENT_SCHEMA_VERSION,
        anonymous_device_id: batch.anonymousDeviceId,
        session_id: batch.sessionId,
        app_version: batch.appVersion,
        platform: batch.platform,
        name: event.name,
        client_at: event.at,
        server_at: now,
        sequence: event.sequence,
        properties: sanitiseProperties(event.properties)
      }))
    );
  }
  return ok(
    CONTRACT5,
    CONTRACT_VERSION,
    { accepted: accepted.length, rejected, schemaVersion: EVENT_SCHEMA_VERSION },
    {
      now,
      state: "configured",
      // A partially-accepted batch is a client bug, and a silent one is a
      // funnel that quietly under-reports for a release.
      fallbackReason: rejected.length > 0 ? `${rejected.length} of ${batch.events.length} events were rejected and not stored.` : null
    }
  );
}

// packages/core/src/contracts/handlers/retention.ts
var CONTRACT6 = "api/retention/daily";
var CYCLE = [
  { kind: "hint", quantity: 1 },
  { kind: "shuffle", quantity: 1 },
  { kind: "hint", quantity: 2 },
  { kind: "revive", quantity: 1 },
  { kind: "shuffle", quantity: 2 },
  { kind: "hint", quantity: 3 },
  { kind: "revive", quantity: 3 }
];
var DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
function daysBetween(from, to) {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 864e5);
}
function stateFor(localDate, record) {
  const last = record?.lastClaimedOn ?? null;
  const gap = last ? daysBetween(last, localDate) : null;
  const streakBroken = gap !== null && gap > 1;
  const claimableToday = gap === null || gap >= 1;
  const streakDays = gap === null || streakBroken ? 0 : record?.streakDays ?? 0;
  const nextStreak = claimableToday ? streakDays + 1 : streakDays;
  const day = (nextStreak - 1) % CYCLE.length + 1;
  return {
    day: Math.max(1, day),
    streakDays: claimableToday ? streakDays : record?.streakDays ?? 0,
    claimableToday,
    reward: CYCLE[Math.max(0, day - 1)],
    lastClaimedOn: last,
    streakBroken
  };
}
async function gate(sessionToken, ports2) {
  const now = nowOf(ports2);
  const missing = [];
  if (!ports2.store) missing.push("SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY");
  if (!ports2.session) missing.push("SESSION_SIGNING_KEY");
  if (missing.length > 0) return notConfigured(CONTRACT6, CONTRACT_VERSION, missing, { now });
  const accountId = await ports2.session.verify(sessionToken);
  if (!accountId) {
    return fail(CONTRACT6, CONTRACT_VERSION, {
      code: "unauthenticated",
      message: "Sign in to keep your streak across devices."
    }, { now, state: "configured" });
  }
  return { accountId };
}
async function getDailyReward(sessionToken, localDate, ports2 = {}) {
  const now = nowOf(ports2);
  if (!DATE_PATTERN.test(localDate ?? "")) {
    return fail(CONTRACT6, CONTRACT_VERSION, {
      code: "invalid_request",
      message: "localDate must be YYYY-MM-DD.",
      field: "localDate"
    }, { now });
  }
  const account = await gate(sessionToken, ports2);
  if ("contract" in account) return account;
  const record = await ports2.store.getDailyReward(account.accountId);
  return ok(CONTRACT6, CONTRACT_VERSION, stateFor(localDate, record), {
    now,
    state: "configured"
  });
}
async function claimDailyReward(sessionToken, request, ports2 = {}) {
  const now = nowOf(ports2);
  const localDate = request?.localDate;
  if (!DATE_PATTERN.test(localDate ?? "")) {
    return fail(CONTRACT6, CONTRACT_VERSION, {
      code: "invalid_request",
      message: "localDate must be YYYY-MM-DD.",
      field: "localDate"
    }, { now });
  }
  const account = await gate(sessionToken, ports2);
  if ("contract" in account) return account;
  const record = await ports2.store.getDailyReward(account.accountId);
  const state = stateFor(localDate, record);
  if (!state.claimableToday) {
    return ok(
      CONTRACT6,
      CONTRACT_VERSION,
      { ...state, granted: null },
      {
        now,
        state: "configured",
        fallbackReason: "Already claimed today; nothing was granted."
      }
    );
  }
  const streakDays = state.streakDays + 1;
  await ports2.store.putDailyReward(account.accountId, {
    lastClaimedOn: localDate,
    streakDays
  });
  return ok(
    CONTRACT6,
    CONTRACT_VERSION,
    {
      ...state,
      streakDays,
      claimableToday: false,
      lastClaimedOn: localDate,
      granted: state.reward
    },
    { now, state: "configured" }
  );
}

// packages/core/src/contracts/handlers/consumables.ts
var CONTRACT7 = "api/consumables/validate";
var SHUFFLE_PRODUCT = "com.nihi.mahjong.shuffle5";
var SHUFFLE_QUANTITY = 5;
async function validateConsumable(request, sessionToken, ports2 = {}) {
  const now = nowOf(ports2);
  if (typeof request.signedTransaction !== "string" || request.signedTransaction.split(".").length !== 3) {
    return fail(CONTRACT7, CONTRACT_VERSION, { code: "invalid_request", message: "Expected a StoreKit 2 signed transaction.", field: "signedTransaction" }, { now });
  }
  const missing = [!ports2.storekit && "APPLE_ROOT_CA_G3_BASE64 + IAP_PRODUCT_IDS + APPLE_BUNDLE_ID", !ports2.store && "SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY", !ports2.session && "SESSION_SIGNING_KEY"].filter(Boolean);
  if (missing.length) return notConfigured(CONTRACT7, CONTRACT_VERSION, missing, { now });
  const accountId = await ports2.session.verify(sessionToken);
  if (!accountId) return fail(CONTRACT7, CONTRACT_VERSION, { code: "unauthenticated", message: "Sign in with Apple before buying a Shuffle pack." }, { now, state: "configured" });
  let verified;
  try {
    verified = await ports2.storekit.verifySignedTransaction(request.signedTransaction);
  } catch (cause) {
    return fail(CONTRACT7, CONTRACT_VERSION, { code: "unverified_transaction", message: "That purchase could not be verified." }, { now, state: "configured", fallbackReason: `StoreKit transaction rejected: ${cause.message}` });
  }
  if (verified.productId !== SHUFFLE_PRODUCT || verified.revoked) {
    return fail(CONTRACT7, CONTRACT_VERSION, { code: "wrong_product", message: "That transaction is not an active Shuffle pack." }, { now, state: "configured" });
  }
  const inserted = await ports2.store.putConsumableGrant({ accountId, transactionId: verified.transactionId, productId: verified.productId, kind: "shuffle", quantity: SHUFFLE_QUANTITY, purchasedAt: verified.purchasedAt, environment: verified.environment, grantedAt: now });
  const existing = inserted ? null : await ports2.store.getConsumableGrant(verified.transactionId);
  if (!inserted && existing?.accountId !== accountId) {
    return fail(CONTRACT7, CONTRACT_VERSION, { code: "transaction_claimed", message: "That transaction belongs to another account." }, { now, state: "configured" });
  }
  return ok(CONTRACT7, CONTRACT_VERSION, { productId: verified.productId, transactionId: verified.transactionId, kind: "shuffle", quantityGranted: existing?.quantity ?? SHUFFLE_QUANTITY, alreadyGranted: !inserted, purchasedAt: verified.purchasedAt, environment: verified.environment }, { now, state: "configured" });
}

// apps/api/src/router.ts
var num = (value) => {
  if (value === null || value === "") return void 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};
var unvalidated = (body) => body ?? {};
async function handle(request, ports2) {
  const { method, path, query, body, bearer } = request;
  const envelope = await route();
  return { status: httpStatus(envelope), envelope };
  async function route() {
    if (method === "GET" && path === "/api/game/board/generate") {
      return generateBoard(
        {
          layout: query.get("layout") ?? "turtle",
          seed: num(query.get("seed")),
          includeTiles: query.get("includeTiles") === "true"
        },
        ports2
      );
    }
    if (method === "POST" && path === "/api/game/board/validate-move") {
      return validateMove(unvalidated(body), ports2);
    }
    if (method === "POST" && path === "/api/auth/apple-id") {
      return authenticateWithApple(unvalidated(body), ports2);
    }
    if (path === "/api/settings") {
      if (method === "GET") return getSettings(bearer, ports2);
      if (method === "PATCH") return patchSettings(bearer, unvalidated(body), ports2);
    }
    if (method === "POST" && path === "/api/hints/generate") {
      return generateHint(unvalidated(body), ports2);
    }
    if (method === "POST" && path === "/api/play-pattern/log") {
      return logPlayPattern(unvalidated(body), ports2);
    }
    if (method === "GET" && path === "/api/difficulty/next-board") {
      const raw = query.get("profile");
      let profile;
      if (raw) {
        try {
          profile = JSON.parse(raw);
        } catch {
          return fail("api/difficulty/next-board", "1", {
            code: "invalid_request",
            message: "profile must be JSON.",
            field: "profile"
          });
        }
      }
      return nextBoard({ profile }, ports2);
    }
    if (method === "POST" && path === "/api/receipts/validate") {
      return validateReceipt(unvalidated(body), bearer, ports2);
    }
    if (method === "GET" && path === "/api/unlock-status") {
      return unlockStatus(bearer, ports2);
    }
    if (method === "POST" && path === "/api/analytics/session") {
      return recordSessionAnalytics(unvalidated(body), ports2);
    }
    if (method === "POST" && path === "/api/events/batch") {
      return ingestEvents(unvalidated(body), ports2);
    }
    if (path === "/api/retention/daily") {
      if (method === "GET") return getDailyReward(bearer, query.get("localDate") ?? "", ports2);
      if (method === "POST") return claimDailyReward(bearer, unvalidated(body), ports2);
    }
    if (method === "POST" && path === "/api/consumables/validate") return validateConsumable(unvalidated(body), bearer, ports2);
    return fail("api/unknown", "1", {
      code: "not_found",
      message: `No contract at ${method} ${path}.`
    });
  }
}

// apps/api/src/edge.ts
var corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization, apikey, x-client-info",
  "access-control-allow-methods": "GET, POST, PATCH, OPTIONS"
};
var json = (body, status) => Response.json(body, { status, headers: corsHeaders });
async function handleEdgeRequest(request, ports2) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/functions\/v1\/contracts(?=\/|$)/, "").replace(/^\/contracts(?=\/|$)/, "") || "/";
  let body;
  if (!["GET", "HEAD"].includes(request.method)) {
    const raw = await request.text();
    if (raw.length > 0) {
      try {
        body = JSON.parse(raw);
      } catch {
        return json({ error: { code: "invalid_json", message: "Body is not JSON." } }, 400);
      }
    }
  }
  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7) : null;
  try {
    const result = await handle(
      { method: request.method, path, query: url.searchParams, body, bearer },
      ports2
    );
    return json(result.envelope, result.status);
  } catch (cause) {
    console.error("unhandled edge request", cause);
    return json(
      {
        contract: "api/unknown",
        version: "1",
        state: "source_available",
        fallback_reason: "Unhandled server error.",
        data: null,
        error: { code: "internal_error", message: "Something went wrong." },
        generated_at: (/* @__PURE__ */ new Date()).toISOString()
      },
      500
    );
  }
}

// supabase/functions/contracts/source.ts
var { ports, lines } = createEdgePorts((key) => Deno.env.get(key));
for (const line of lines) console.info(line);
Deno.serve((request) => handleEdgeRequest(request, ports));
